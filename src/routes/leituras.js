const router = require('express').Router();
const Leitura = require('../models/Leitura');
const Dispositivo = require('../models/Dispositivo');
const { autenticar, permitir } = require('../middlewares/auth');
const { registrarLeitura } = require('../services/ingestao');
const { sincronizarTodos } = require('../services/thingspeak');
const { ErroApp, limitar } = require('../utils');

router.use(autenticar);

function lerData(valor, nome) {
  if (valor === undefined) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new ErroApp(400, `Data invalida em "${nome}" (use ISO, ex: 2026-10-08T10:00:00Z)`);
  return d;
}

// GET /api/leituras?dispositivo=ESP32-001&inicio=...&fim=...&limite=100
router.get('/', async (req, res) => {
  const { dispositivo, inicio, fim } = req.query;
  const limite = limitar(parseInt(req.query.limite, 10) || 100, 1, 1000);

  const filtro = {};
  if (dispositivo) filtro.dispositivo = String(dispositivo);
  const dInicio = lerData(inicio, 'inicio');
  const dFim = lerData(fim, 'fim');
  if (dInicio || dFim) {
    filtro.medidoEm = {};
    if (dInicio) filtro.medidoEm.$gte = dInicio;
    if (dFim) filtro.medidoEm.$lte = dFim;
  }
  const leituras = await Leitura.find(filtro).sort({ medidoEm: -1 }).limit(limite).select('-__v');
  res.json(leituras);
});

// GET /api/leituras/ultima?dispositivo=ESP32-001
router.get('/ultima', async (req, res) => {
  const filtro = req.query.dispositivo ? { dispositivo: String(req.query.dispositivo) } : {};
  const leitura = await Leitura.findOne(filtro).sort({ medidoEm: -1 }).select('-__v');
  if (!leitura) throw new ErroApp(404, 'Nenhuma leitura encontrada');
  res.json(leitura);
});

// POST /api/leituras  (admin) -> insere uma leitura manual. Util para testar alertas sem o ESP32.
router.post('/', permitir('admin'), async (req, res) => {
  const { dispositivo, ...bruta } = req.body || {};
  const disp = await Dispositivo.findById(dispositivo);
  if (!disp) throw new ErroApp(404, 'Dispositivo nao encontrado');
  const r = await registrarLeitura(disp, bruta, { fonte: 'manual' });
  if (!r.salva) throw new ErroApp(400, `Leitura descartada: ${r.motivo}`);
  res.status(201).json(r.leitura);
});

// POST /api/sincronizar  (admin) -> forca uma consulta ao ThingSpeak (respeita o intervalo minimo)
router.post('/sincronizar', permitir('admin'), async (_req, res) => {
  res.json(await sincronizarTodos());
});

module.exports = router;
