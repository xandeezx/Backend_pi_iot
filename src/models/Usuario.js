const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Perfis do RBAC (RF08 / RF12)
const PERFIS = ['produtor', 'analista', 'admin'];

const usuarioSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false => a senha nunca vem nas consultas por padrao
    senhaHash: { type: String, required: true, select: false },
    perfil: { type: String, enum: PERFIS, default: 'produtor' },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Nunca devolve o hash no JSON
usuarioSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.senhaHash;
    return ret;
  },
});

usuarioSchema.statics.gerarHash = (senha) => bcrypt.hash(senha, 10);
usuarioSchema.methods.conferirSenha = function (senha) {
  return bcrypt.compare(senha, this.senhaHash);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
module.exports.PERFIS = PERFIS;
