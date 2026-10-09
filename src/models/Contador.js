const mongoose = require('mongoose');

// Contador sequencial (usado para gerar "AL-0001", "AL-0002"...)
const contadorSchema = new mongoose.Schema({
  _id: String,
  valor: { type: Number, default: 0 },
});

const Contador = mongoose.model('Contador', contadorSchema);

async function proximoNumero(nome) {
  const doc = await Contador.findOneAndUpdate(
    { _id: nome },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc.valor;
}

module.exports = Contador;
module.exports.proximoNumero = proximoNumero;
