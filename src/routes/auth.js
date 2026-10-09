const router = require('express').Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Usuario = require('../models/Usuario');
const env = require('../config/env');
const { autenticar, registrarLog } = require('../middlewares/auth');
const { ErroApp } = require('../utils');

// Limita tentativas de login por IP (protege contra forca bruta)
const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.teste,
  message: { erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

// POST /api/auth/login  { email, senha }
router.post('/login', limitarLogin, async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) throw new ErroApp(400, 'Informe email e senha');

  const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim() }).select('+senhaHash');
  const senhaOk = usuario && usuario.ativo && (await usuario.conferirSenha(String(senha)));
  if (!senhaOk) {
    await registrarLog('login_falha', req, { email: String(email) });
    // Mesma mensagem para email inexistente e senha errada (nao revela quais emails existem)
    throw new ErroApp(401, 'Email ou senha invalidos');
  }

  const token = jwt.sign(
    { nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    env.jwtSecret,
    { subject: String(usuario._id), expiresIn: env.jwtExpira }
  );
  req.usuario = { email: usuario.email, perfil: usuario.perfil };
  await registrarLog('login_ok', req);
  res.json({ token, usuario });
});

// GET /api/auth/me
router.get('/me', autenticar, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario || !usuario.ativo) throw new ErroApp(401, 'Usuario inativo');
  res.json(usuario);
});

module.exports = router;
