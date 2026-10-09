// Rotas de leitura que alimentam os graficos do dashboard (RF07, RF10, RF06).
const router = require('express').Router();
const { autenticar, permitir } = require('../middlewares/auth');
const { montarVisaoGeral } = require('../services/visaoGeral');
const { montarHistorico } = require('../services/historico');
const { gerarPrevisao } = require('../services/previsao');

router.use(autenticar);

// GET /api/visao-geral
router.get('/visao-geral', async (_req, res) => {
  res.json(await montarVisaoGeral());
});

// GET /api/historico?periodo=7|30|safra&variavel=temperatura|umidade&dispositivo=todos|ESP32-001
router.get('/historico', async (req, res) => {
  const { periodo, variavel, dispositivo } = req.query;
  res.json(await montarHistorico({ periodo, variavel, dispositivo }));
});

// GET /api/previsao?dispositivo=todos&produto=manga
router.get('/previsao', permitir('produtor', 'analista', 'admin'), async (req, res) => {
  const { dispositivo, produto } = req.query;
  res.json(await gerarPrevisao({ dispositivo, produto }));
});

module.exports = router;
