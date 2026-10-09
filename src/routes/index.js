const router = require('express').Router();
const mongoose = require('mongoose');

// Health check publico (usado por plataformas de deploy e para conferir se o banco esta no ar)
router.get('/health', (_req, res) => {
  const bancoOk = mongoose.connection.readyState === 1;
  res.status(bancoOk ? 200 : 503).json({ status: bancoOk ? 'ok' : 'banco indisponivel', uptimeSeg: Math.round(process.uptime()) });
});

router.use('/auth', require('./auth'));
router.use('/usuarios', require('./usuarios'));
router.use('/dispositivos', require('./dispositivos'));
router.use('/leituras', require('./leituras'));
router.use('/alertas', require('./alertas'));
router.use('/mercado', require('./mercado'));
router.use('/relatorios', require('./relatorios'));
router.use('/', require('./painel')); // /visao-geral, /historico, /previsao

module.exports = router;
