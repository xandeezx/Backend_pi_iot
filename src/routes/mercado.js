const router = require('express').Router();
const Mercado = require('../models/Mercado');
const { autenticar, permitir } = require('../middlewares/auth');
const { chaveDia, limitar, ErroApp } = require('../utils');

router.use(autenticar);

// GET /api/mercado?produto=manga&dias=30  -> serie historica de precos
router.get('/', async (req, res) => {
  const dias = limitar(parseInt(req.query.dias, 10) || 30, 1, 365);
  const filtro = { dia: { $gte: chaveDia(new Date(Date.now() - dias * 24 * 3600 * 1000)) } };
  if (req.query.produto) filtro.produto = String(req.query.produto).toLowerCase();
  res.json(await Mercado.find(filtro).sort({ dia: 1 }).select('-__v'));
});

// GET /api/mercado/ultimos  -> preco mais recente de cada produto/destino
router.get('/ultimos', async (_req, res) => {
  // Pega os ultimos 14 dias (mais novo primeiro) e fica com o 1o registro de cada produto/destino
  const desde = chaveDia(new Date(Date.now() - 14 * 24 * 3600 * 1000));
  const registros = await Mercado.find({ dia: { $gte: desde } }).sort({ dia: -1 });

  const ultimos = new Map();
  for (const r of registros) {
    const chave = `${r.produto}|${r.destino}`;
    if (!ultimos.has(chave)) {
      ultimos.set(chave, { produto: r.produto, destino: r.destino, precoUsdKg: r.precoUsdKg, demandaIndice: r.demandaIndice, dia: r.dia });
    }
  }
  const lista = [...ultimos.values()];
  lista.sort((a, b) => a.produto.localeCompare(b.produto) || a.destino.localeCompare(b.destino));
  res.json(lista);
});

// POST /api/mercado  (analista/admin) { produto, destino, precoUsdKg, demandaIndice?, data? }
router.post('/', permitir('analista', 'admin'), async (req, res) => {
  const { produto, destino, precoUsdKg, demandaIndice = 50, data } = req.body || {};
  if (!produto || !destino || precoUsdKg === undefined) throw new ErroApp(400, 'Informe produto, destino e precoUsdKg');
  const preco = Number(precoUsdKg);
  if (!Number.isFinite(preco) || preco < 0) throw new ErroApp(400, 'precoUsdKg invalido');
  const quando = data ? new Date(data) : new Date();
  if (Number.isNaN(quando.getTime())) throw new ErroApp(400, 'data invalida');

  const dia = chaveDia(quando);
  const registro = await Mercado.findOneAndUpdate(
    { produto: String(produto).toLowerCase(), destino, dia },
    { precoUsdKg: preco, demandaIndice, data: quando, fonte: 'manual' },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  res.status(201).json(registro);
});

module.exports = router;
