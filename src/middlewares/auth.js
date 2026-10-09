const jwt = require('jsonwebtoken');
const env = require('../config/env');
const LogAcesso = require('../models/LogAcesso');

// Grava no log de seguranca. Se o log falhar, a requisicao nao pode quebrar.
async function registrarLog(tipo, req, extra = {}) {
  try {
    await LogAcesso.create({
      tipo,
      email: extra.email || req.usuario?.email || '',
      perfil: req.usuario?.perfil || '',
      ip: req.ip || '',
      rota: req.originalUrl,
      metodo: req.method,
    });
  } catch (erro) {
    console.error('[log] falha ao registrar acesso:', erro.message);
  }
}

// Exige token JWT valido no header "Authorization: Bearer <token>"
async function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token nao informado' });
  }
  try {
    // O token ja carrega id/perfil, entao nao consultamos o banco a cada requisicao (RNF10)
    const dados = jwt.verify(token, env.jwtSecret);
    req.usuario = { id: dados.sub, nome: dados.nome, email: dados.email, perfil: dados.perfil };
    return next();
  } catch {
    await registrarLog('token_invalido', req);
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}

// Exige um dos perfis listados (RBAC - RF08). Usar depois de autenticar.
function permitir(...perfis) {
  return async (req, res, next) => {
    if (!perfis.includes(req.usuario.perfil)) {
      await registrarLog('acesso_negado', req);
      return res.status(403).json({ erro: 'Seu perfil nao tem permissao para esta acao' });
    }
    return next();
  };
}

module.exports = { autenticar, permitir, registrarLog };
