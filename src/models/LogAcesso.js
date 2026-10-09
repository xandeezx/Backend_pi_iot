const mongoose = require('mongoose');

// Registro de acessos e incidentes para o relatorio de seguranca (RF11).
const logAcessoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['login_ok', 'login_falha', 'token_invalido', 'acesso_negado'],
    required: true,
  },
  email: { type: String, default: '' },
  perfil: { type: String, default: '' },
  ip: { type: String, default: '' },
  rota: { type: String, default: '' },
  metodo: { type: String, default: '' },
  em: { type: Date, default: Date.now },
});

logAcessoSchema.index({ em: -1 });
logAcessoSchema.index({ tipo: 1, em: -1 });

module.exports = mongoose.model('LogAcesso', logAcessoSchema);
