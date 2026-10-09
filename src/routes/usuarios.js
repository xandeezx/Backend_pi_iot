const router = require('express').Router();
const Usuario = require('../models/Usuario');
const { PERFIS } = require('../models/Usuario');
const { autenticar, permitir } = require('../middlewares/auth');
const { ErroApp } = require('../utils');

// Tudo aqui e so do administrador (RF12)
router.use(autenticar, permitir('admin'));

const senhaForte = (s) => typeof s === 'string' && s.length >= 8;

// GET /api/usuarios
router.get('/', async (_req, res) => {
  res.json(await Usuario.find().sort({ nome: 1 }));
});

// POST /api/usuarios  { nome, email, senha, perfil }
router.post('/', async (req, res) => {
  const { nome, email, senha, perfil = 'produtor' } = req.body || {};
  if (!nome || !email || !senha) throw new ErroApp(400, 'Informe nome, email e senha');
  if (!senhaForte(senha)) throw new ErroApp(400, 'A senha precisa ter pelo menos 8 caracteres');
  if (!PERFIS.includes(perfil)) throw new ErroApp(400, `Perfil invalido (use: ${PERFIS.join(', ')})`);

  const usuario = await Usuario.create({ nome, email, perfil, senhaHash: await Usuario.gerarHash(senha) });
  res.status(201).json(usuario);
});

// PATCH /api/usuarios/:id  { nome?, perfil?, ativo?, senha? }
router.patch('/:id', async (req, res) => {
  const { nome, perfil, ativo, senha } = req.body || {};
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario) throw new ErroApp(404, 'Usuario nao encontrado');

  // Evita o admin se trancar para fora do sistema
  if (String(usuario._id) === req.usuario.id && (ativo === false || (perfil && perfil !== 'admin'))) {
    throw new ErroApp(400, 'Voce nao pode remover seu proprio acesso de administrador');
  }
  if (nome !== undefined) usuario.nome = nome;
  if (perfil !== undefined) {
    if (!PERFIS.includes(perfil)) throw new ErroApp(400, `Perfil invalido (use: ${PERFIS.join(', ')})`);
    usuario.perfil = perfil;
  }
  if (ativo !== undefined) usuario.ativo = !!ativo;
  if (senha !== undefined) {
    if (!senhaForte(senha)) throw new ErroApp(400, 'A senha precisa ter pelo menos 8 caracteres');
    usuario.senhaHash = await Usuario.gerarHash(senha);
  }
  await usuario.save();
  res.json(usuario);
});

// DELETE /api/usuarios/:id  -> desativa (nao apaga, para manter o historico de auditoria)
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.usuario.id) throw new ErroApp(400, 'Voce nao pode desativar a propria conta');
  const usuario = await Usuario.findByIdAndUpdate(req.params.id, { ativo: false }, { returnDocument: 'after' });
  if (!usuario) throw new ErroApp(404, 'Usuario nao encontrado');
  res.json(usuario);
});

module.exports = router;
