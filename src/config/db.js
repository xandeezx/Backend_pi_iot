const mongoose = require('mongoose');
const env = require('./env');

async function conectarBanco(uri = env.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('[db] MongoDB conectado');
  return mongoose.connection;
}

async function desconectarBanco() {
  await mongoose.disconnect();
}

module.exports = { conectarBanco, desconectarBanco };
