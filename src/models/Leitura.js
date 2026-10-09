const mongoose = require('mongoose');

const leituraSchema = new mongoose.Schema({
  dispositivo: { type: String, required: true, ref: 'Dispositivo' },
  temperatura: { type: Number, required: true },
  umidade: { type: Number, required: true },
  // Estatisticas do ciclo de 8 leituras calculadas no ESP32 (so existem se o firmware enviar)
  maxima: { type: Number, default: null },
  minima: { type: Number, default: null },
  media: { type: Number, default: null },
  medidoEm: { type: Date, required: true }, // created_at do ThingSpeak
  // Chaves de agrupamento ja no fuso de Recife. Guardar pronto deixa as consultas
  // de historico simples e rapidas (agrupar por string em vez de calcular data).
  dia: { type: String, required: true }, // "2026-10-08"
  hora: { type: String, required: true }, // "2026-10-08 16"
  entryId: { type: Number, default: null }, // entry_id do ThingSpeak (informativo)
  fonte: { type: String, enum: ['thingspeak', 'simulado', 'manual'], default: 'thingspeak' },
});

// Evita gravar a mesma leitura duas vezes (o poller consulta janelas que se sobrepoem)
leituraSchema.index({ dispositivo: 1, medidoEm: 1 }, { unique: true });
leituraSchema.index({ medidoEm: -1 });
leituraSchema.index({ dia: 1 });

module.exports = mongoose.model('Leitura', leituraSchema);
