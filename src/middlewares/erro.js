const { ErroApp } = require('../utils');

function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota nao encontrada: ${req.method} ${req.originalUrl}` });
}

// Ultimo middleware: transforma qualquer erro em resposta JSON
// eslint-disable-next-line no-unused-vars
function tratarErros(erro, req, res, _next) {
  if (erro instanceof ErroApp) return res.status(erro.status).json({ erro: erro.message });

  // Erros do Mongoose
  if (erro.name === 'ValidationError') {
    return res.status(400).json({ erro: Object.values(erro.errors).map((e) => e.message).join('; ') });
  }
  if (erro.name === 'CastError') return res.status(400).json({ erro: `Valor invalido para "${erro.path}"` });
  if (erro.code === 11000) return res.status(409).json({ erro: 'Registro duplicado' });

  // JSON malformado no body
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON invalido' });

  console.error('[erro]', erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}

module.exports = { naoEncontrado, tratarErros };
