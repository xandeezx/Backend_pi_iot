const mongoose = require('mongoose');

// Dados de mercado (RF03): preco e demanda de exportacao por produto/destino.
const mercadoSchema = new mongoose.Schema({
  produto: { type: String, required: true, lowercase: true, trim: true }, // "manga", "uva"
  destino: { type: String, required: true, trim: true }, // "Uniao Europeia", "EUA"
  precoUsdKg: { type: Number, required: true, min: 0 },
  demandaIndice: { type: Number, default: 50, min: 0, max: 100 },
  data: { type: Date, required: true },
  dia: { type: String, required: true },
  fonte: { type: String, enum: ['simulado', 'manual'], default: 'simulado' },
});

mercadoSchema.index({ produto: 1, destino: 1, dia: 1 }, { unique: true });

module.exports = mongoose.model('Mercado', mercadoSchema);
