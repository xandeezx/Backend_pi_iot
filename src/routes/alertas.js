const router = require('express').Router();
const Alerta = require('../models/Alerta');
const { CATEGORIAS } = require('../models/Alerta');
const { autenticar, permitir } = require('../middlewares/auth');
const { alertaParaFront, aplicarAcao, buscarPorCodigo } = require('../services/alertas');
const { ACOES } = require('../services/maquinaAlertas');
const { ErroApp } = require('../utils');

router.use(autenticar);

const ABERTOS = ['pendente', 'reconhecido', 'tratamento'];

// GET /api/alertas?status=abertos|todos|pendente|...&dispositivo=ESP32-003
router.get('/', async (req, res) => {
  const { status = 'todos', dispositivo } = req.query;
  const filtro = {};
  if (status === 'abertos') filtro.status = { $in: ABERTOS };
  else if (status !== 'todos') filtro.status = String(status);
  if (dispositivo) filtro.device = String(dispositivo);

  const alertas = await Alerta.find(filtro).sort({ createdAt: -1 }).limit(200);
  res.json(alertas.map((a) => alertaParaFront(a)));
});

// GET /api/alertas/resumo  -> numeros para os badges
router.get('/resumo', async (_req, res) => {
  const [abertos, naoVistos] = await Promise.all([
    Alerta.countDocuments({ status: { $in: ABERTOS } }),
    Alerta.countDocuments({ visto: false }),
  ]);
  res.json({ abertos, naoVistos });
});

// POST /api/alertas/marcar-vistos  -> zera o badge ao abrir a tela de Alertas
router.post('/marcar-vistos', async (_req, res) => {
  await Alerta.updateMany({ visto: false }, { $set: { visto: true } });
  res.json({ ok: true });
});

// PATCH /api/alertas/:id  { categoria?, nota? }
router.patch('/:id', permitir('produtor', 'admin'), async (req, res) => {
  const { categoria, nota } = req.body || {};
  if (categoria !== undefined && categoria !== null && !CATEGORIAS.includes(categoria)) {
    throw new ErroApp(400, `Categoria invalida (use: ${CATEGORIAS.join(', ')})`);
  }
  const alerta = await buscarPorCodigo(req.params.id);
  if (categoria !== undefined) alerta.category = categoria;
  if (nota !== undefined) alerta.note = String(nota).slice(0, 500);
  await alerta.save();
  res.json(alertaParaFront(alerta));
});

// POST /api/alertas/:id/acao  { acao: "reconhecer"|"registrar"|"resolver"|"falso", categoria?, nota? }
router.post('/:id/acao', permitir('produtor', 'admin'), async (req, res) => {
  const { acao, categoria, nota } = req.body || {};
  if (!ACOES.includes(acao)) throw new ErroApp(400, `Acao invalida (use: ${ACOES.join(', ')})`);
  if (categoria !== undefined && categoria !== null && !CATEGORIAS.includes(categoria)) {
    throw new ErroApp(400, `Categoria invalida (use: ${CATEGORIAS.join(', ')})`);
  }
  const alerta = await aplicarAcao(req.params.id, acao, req.usuario, { categoria, nota });
  res.json(alertaParaFront(alerta));
});

module.exports = router;
