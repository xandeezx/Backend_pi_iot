// Ajuda dos testes: sobe um MongoDB para testar.
//  - Se existir MONGO_URI_TESTE usa esse banco (ex: um MongoDB local ou do Docker).
//  - Senao baixa e usa o mongodb-memory-server (precisa de internet na primeira vez).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-de-teste';

const mongoose = require('mongoose');

let servidorMemoria = null;

async function conectarTeste() {
  let uri = process.env.MONGO_URI_TESTE;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    servidorMemoria = await MongoMemoryServer.create();
    uri = servidorMemoria.getUri('pi_iot_teste');
  }
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // Garante os indices (ex: unicidade de leituras) antes do primeiro teste
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function limparBanco() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
}

async function desconectarTeste() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (servidorMemoria) await servidorMemoria.stop();
}

module.exports = { conectarTeste, limparBanco, desconectarTeste };
