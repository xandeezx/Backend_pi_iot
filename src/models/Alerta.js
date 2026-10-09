const mongoose = require('mongoose');

const STATUS = ['pendente', 'reconhecido', 'tratamento', 'resolvido', 'falso'];
const CATEGORIAS = ['Equipe acionada', 'Ajuste realizado', 'Aguardando'];
const TIPOS = ['temp_alta', 'umid_baixa', 'umid_alta', 'offline', 'reconectado', 'janela_ideal'];

// Os nomes dos campos (severity, tone, title, device, place, status, category, note)
// seguem o tipo AlertRaw do front, assim a resposta da API encaixa direto.
const alertaSchema = new mongoose.Schema(
  {
    codigo: { type: String, required: true, unique: true }, // "AL-0001" (id publico)
    tipo: { type: String, enum: TIPOS, required: true },
    severity: { type: String, enum: ['Crítico', 'Atenção', 'Informativo'], required: true },
    tone: { type: String, enum: ['down', 'warn', 'info'], required: true },
    title: { type: String, required: true },
    device: { type: String, required: true }, // codigo do dispositivo
    place: { type: String, default: '' },
    status: { type: String, enum: STATUS, default: 'pendente' },
    category: { type: String, enum: [...CATEGORIAS, null], default: null },
    note: { type: String, default: '' },
    visto: { type: Boolean, default: false }, // badge de "nao vistos"
    // Trilha de auditoria de quem fez o que (ajuda no relatorio de seguranca - RF11)
    historico: [
      {
        acao: String,
        de: String,
        para: String,
        por: String,
        em: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

alertaSchema.index({ device: 1, tipo: 1, createdAt: -1 });
alertaSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Alerta', alertaSchema);
module.exports.STATUS = STATUS;
module.exports.CATEGORIAS = CATEGORIAS;
