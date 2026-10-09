const router = require('express').Router();
const Dispositivo = require('../models/Dispositivo');
const { mediasPor } = require('../services/agregacoes');
const Alerta = require('../models/Alerta');
const { autenticar, permitir } = require('../middlewares/auth');
const { dispositivoParaFront } = require('../services/estado');
const { arredondar, rotuloTempo, ErroApp } = require('../utils');

router.use(autenticar);

// GET /api/dispositivos  -> lista no formato Device do front
router.get('/', async (_req, res) => {
  const lista = await Dispositivo.find({ ativo: true }).sort({ _id: 1 });
  res.json(lista.map((d) => dispositivoParaFront(d)));
});

// GET /api/dispositivos/resumo  -> contagens para o cabecalho/filtros da tela
router.get('/resumo', async (_req, res) => {
  const lista = (await Dispositivo.find({ ativo: true })).map((d) => dispositivoParaFront(d));
  res.json({
    total: lista.length,
    online: lista.filter((d) => d.state === 'ok').length,
    warn: lista.filter((d) => d.state === 'warn').length,
    down: lista.filter((d) => d.state === 'down').length,
  });
});

// GET /api/dispositivos/:id  -> detalhe (Device + DeviceDetail do front)
router.get('/:id', async (req, res) => {
  const disp = await Dispositivo.findById(req.params.id);
  if (!disp || !disp.ativo) throw new ErroApp(404, 'Dispositivo nao encontrado');

  const desde = new Date(Date.now() - 24 * 3600 * 1000);
  const horas = await mediasPor('hora', { dispositivo: disp._id, medidoEm: { $gte: desde } });
  const alertas = await Alerta.find({ device: disp._id }).sort({ createdAt: -1 }).limit(5);

  res.json({
    ...dispositivoParaFront(disp),
    // O hardware atual (ESP32 + DHT11) nao mede luz nem envia RSSI/uptime: o front deve tratar null
    lux: null,
    rssi: null,
    uptime: '—',
    firmware: disp.firmware,
    events: alertas.map((a) => ({ time: rotuloTempo(a.createdAt), text: a.title })),
    series: horas.length ? horas.map((h) => arredondar(h.temperatura.media)) : null,
  });
});

// ---------- Cadastro (so admin) ----------
const CAMPOS = ['place', 'regiao', 'sensors', 'firmware', 'fonte', 'channelId', 'faixaTemp', 'simulacao'];

// POST /api/dispositivos  { id, place, regiao?, fonte?, channelId?, ... }
router.post('/', permitir('admin'), async (req, res) => {
  const { id } = req.body || {};
  if (!id || !req.body.place) throw new ErroApp(400, 'Informe id e place');
  if (req.body.fonte === 'thingspeak' && !req.body.channelId) {
    throw new ErroApp(400, 'Dispositivo com fonte "thingspeak" precisa de channelId');
  }
  if (await Dispositivo.exists({ _id: id })) throw new ErroApp(409, 'Ja existe um dispositivo com esse id');

  const dados = { _id: id };
  for (const c of CAMPOS) if (req.body[c] !== undefined) dados[c] = req.body[c];
  res.status(201).json(dispositivoParaFront(await Dispositivo.create(dados)));
});

// PATCH /api/dispositivos/:id
router.patch('/:id', permitir('admin'), async (req, res) => {
  const disp = await Dispositivo.findById(req.params.id);
  if (!disp) throw new ErroApp(404, 'Dispositivo nao encontrado');
  for (const c of CAMPOS) if (req.body[c] !== undefined) disp.set(c, req.body[c]);
  if (disp.fonte === 'thingspeak' && !disp.channelId) throw new ErroApp(400, 'Fonte "thingspeak" precisa de channelId');
  await disp.save();
  res.json(dispositivoParaFront(disp));
});

// DELETE /api/dispositivos/:id  -> desativa (as leituras antigas continuam no historico)
router.delete('/:id', permitir('admin'), async (req, res) => {
  const disp = await Dispositivo.findByIdAndUpdate(req.params.id, { ativo: false }, { returnDocument: 'after' });
  if (!disp) throw new ErroApp(404, 'Dispositivo nao encontrado');
  res.json({ ok: true });
});

module.exports = router;
