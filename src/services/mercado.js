const Mercado = require('../models/Mercado');
const { chaveDia, arredondar } = require('../utils');

// Precos-base (US$/kg) usados pela simulacao. Numeros ilustrativos, nao sao dados reais.
const BASES = {
  manga: { 'União Europeia': 1.45, EUA: 1.3 },
  uva: { 'União Europeia': 3.2, EUA: 2.9 },
};

/**
 * Cria o preco do dia para cada produto/destino se ainda nao existir (RF03 - fonte simulada).
 * Cada dia varia no maximo +-4% em relacao ao dia anterior (passeio aleatorio).
 */
async function simularMercado(data = new Date()) {
  const dia = chaveDia(data);
  let criados = 0;
  for (const [produto, destinos] of Object.entries(BASES)) {
    for (const [destino, precoBase] of Object.entries(destinos)) {
      const existe = await Mercado.exists({ produto, destino, dia });
      if (existe) continue;
      const anterior = await Mercado.findOne({ produto, destino, dia: { $lt: dia } }).sort({ dia: -1 });
      const baseAtual = anterior ? anterior.precoUsdKg : precoBase;
      const preco = arredondar(baseAtual * (1 + (Math.random() * 0.08 - 0.04)), 2);
      await Mercado.create({
        produto,
        destino,
        precoUsdKg: preco,
        demandaIndice: Math.round(50 + Math.random() * 40),
        data,
        dia,
        fonte: 'simulado',
      });
      criados++;
    }
  }
  return criados;
}

// Gera varios dias para tras (usado no seed)
async function gerarHistoricoMercado(dias = 30) {
  for (let i = dias; i >= 0; i--) {
    await simularMercado(new Date(Date.now() - i * 24 * 3600 * 1000));
  }
}

module.exports = { BASES, simularMercado, gerarHistoricoMercado };
