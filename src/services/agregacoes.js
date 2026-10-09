const Leitura = require('../models/Leitura');

/**
 * Agrupa leituras por "dia" ou "hora" e devolve media/min/max de temperatura e umidade.
 * Usa o aggregation pipeline do MongoDB ($match -> $group -> $sort).
 *
 *   mediasPor('dia', { medidoEm: { $gte: desde } })
 *   -> [{ chave: '2026-10-08', n: 24, temperatura: { media, min, max }, umidade: { media, min, max } }]
 */
async function mediasPor(chave, filtro) {
  const linhas = await Leitura.aggregate([
    { $match: filtro },
    {
      $group: {
        _id: `$${chave}`, // "dia" ("2026-10-08") ou "hora" ("2026-10-08 16")
        n: { $sum: 1 },
        tMedia: { $avg: '$temperatura' },
        tMin: { $min: '$temperatura' },
        tMax: { $max: '$temperatura' },
        uMedia: { $avg: '$umidade' },
        uMin: { $min: '$umidade' },
        uMax: { $max: '$umidade' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return linhas.map((l) => ({
    chave: l._id,
    n: l.n,
    temperatura: { media: l.tMedia, min: l.tMin, max: l.tMax },
    umidade: { media: l.uMedia, min: l.uMin, max: l.uMax },
  }));
}

module.exports = { mediasPor };
