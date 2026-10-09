// Centraliza todas as variaveis de ambiente num so lugar.
// Assim o resto do codigo nunca le process.env direto.
require('dotenv').config({ quiet: true });

const num = (valor, padrao) => {
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  return Number.isNaN(n) ? padrao : n;
};
const bool = (valor, padrao) => (valor === undefined || valor === '' ? padrao : valor === 'true');

const producao = process.env.NODE_ENV === 'production';

if (producao && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET e obrigatorio em producao');
}

module.exports = {
  producao,
  teste: process.env.NODE_ENV === 'test',
  porta: num(process.env.PORT, 3333),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pi_iot',
  frontUrl: process.env.FRONT_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'segredo-apenas-para-desenvolvimento',
  jwtExpira: process.env.JWT_EXPIRA || '8h',
  tz: 'America/Recife',

  thingspeak: {
    baseUrl: 'https://api.thingspeak.com',
    channelId: process.env.THINGSPEAK_CHANNEL_ID || '',
    readKey: process.env.THINGSPEAK_READ_KEY || '',
    // RNF11: plano gratuito aceita 1 atualizacao a cada ~15s, entao nunca consultamos mais rapido que 16s
    intervaloSeg: Math.max(16, num(process.env.THINGSPEAK_INTERVALO_SEG, 20)),
    // Ordem dos campos no canal (confere com o codigo do ESP32: DHT11_ThingSpeak_MQTT_MaxMinMedia.ino)
    campos: {
      temperatura: 'field1',
      umidade: 'field2',
      maxima: 'field3',
      minima: 'field4',
      media: 'field5',
    },
  },

  simulador: {
    ativo: bool(process.env.SIMULAR, true),
    intervaloSeg: Math.max(5, num(process.env.SIMULADOR_INTERVALO_SEG, 60)),
  },

  limites: {
    tempMax: num(process.env.TEMP_MAX, 32),
    umidMin: num(process.env.UMID_MIN, 50),
    umidMax: num(process.env.UMID_MAX, 80),
    offlineSeg: num(process.env.OFFLINE_SEG, 300),
    cooldownAlertaMin: 30, // nao repete o mesmo alerta (tipo + dispositivo) dentro desse tempo
  },

  janela: {
    tempMin: num(process.env.JANELA_TEMP_MIN, 20),
    tempMax: num(process.env.JANELA_TEMP_MAX, 30),
  },

  safraDias: 120,

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@pi.local',
    senha: process.env.ADMIN_SENHA || 'Admin@12345',
  },
};
