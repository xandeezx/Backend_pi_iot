const mongoose = require('mongoose');

// O _id e o proprio codigo do dispositivo ("ESP32-001"), igual ao id que o front usa.
const dispositivoSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    place: { type: String, required: true, trim: true }, // nome do local, ex: "Bebedouro A"
    regiao: { type: String, default: 'Sem regiao' },
    sensors: { type: String, default: 'DHT11' },
    firmware: { type: String, default: 'v1.0.0' },
    // 'thingspeak' = dado real vindo do canal; 'simulado' = gerado pelo simulador
    fonte: { type: String, enum: ['thingspeak', 'simulado'], default: 'simulado' },
    channelId: { type: String, default: '' }, // so para fonte = thingspeak
    faixaTemp: {
      min: { type: Number, default: 22 },
      max: { type: Number, default: 32 },
    },
    ultimoSync: { type: Date, default: null }, // ultima consulta ao ThingSpeak
    ultimaLeitura: {
      temperatura: { type: Number, default: null },
      umidade: { type: Number, default: null },
      em: { type: Date, default: null },
    },
    // Parametros do simulador (so usados quando fonte = simulado)
    simulacao: {
      baseTemp: { type: Number, default: 28 },
      baseUmid: { type: Number, default: 65 },
      offline: { type: Boolean, default: false },
    },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispositivo', dispositivoSchema);
