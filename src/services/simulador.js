const Dispositivo = require('../models/Dispositivo');
const Leitura = require('../models/Leitura');
const { registrarLeitura } = require('./ingestao');
const { horaDoDia, emRecife, chaveDia, chaveHora, arredondar } = require('../utils');

/**
 * Gera temperatura/umidade parecidas com o clima de Petrolina: esquenta de dia (pico ~15h),
 * esfria de madrugada, e a umidade faz o caminho inverso. Serve para rodar o projeto sem hardware (RNF07).
 */
function valorSimulado(disp, data = new Date(), comRuido = true) {
  const hora = horaDoDia(data) + Number(emRecife(data).slice(14, 16)) / 60;
  const ciclo = Math.sin((2 * Math.PI * (hora - 9)) / 24); // pico as 15h, vale as 3h
  const ruido = (amp) => (comRuido ? (Math.random() * 2 - 1) * amp : 0);
  return {
    temperatura: arredondar(disp.simulacao.baseTemp + 3.5 * ciclo + ruido(0.6)),
    umidade: arredondar(disp.simulacao.baseUmid - 10 * ciclo + ruido(2)),
  };
}

// Uma leitura nova para cada dispositivo simulado que esteja "online"
async function simularTodos() {
  const dispositivos = await Dispositivo.find({ ativo: true, fonte: 'simulado' });
  let geradas = 0;
  for (const d of dispositivos) {
    if (d.simulacao.offline) continue; // dispositivo configurado para ficar sem comunicacao
    const r = await registrarLeitura(d, valorSimulado(d), { fonte: 'simulado' });
    if (r.salva) geradas++;
  }
  return geradas;
}

/**
 * Cria historico falso (1 leitura por hora) para o front ter graficos desde o primeiro dia.
 * Grava direto na colecao, sem passar pelos alertas (senao seriam centenas de alertas antigos).
 */
async function gerarHistorico(disp, dias = 30, passoMin = 60) {
  const agora = Date.now();
  const fim = disp.simulacao.offline ? agora - 3 * 3600 * 1000 : agora; // offline: parou ha 3h
  const docs = [];
  for (let t = agora - dias * 24 * 3600 * 1000; t <= fim; t += passoMin * 60 * 1000) {
    const medidoEm = new Date(t);
    docs.push({
      dispositivo: disp._id,
      ...valorSimulado(disp, medidoEm),
      medidoEm,
      dia: chaveDia(medidoEm),
      hora: chaveHora(medidoEm),
      fonte: 'simulado',
    });
  }
  await Leitura.insertMany(docs, { ordered: false });

  const ultima = docs[docs.length - 1];
  await Dispositivo.updateOne(
    { _id: disp._id },
    { $set: { ultimaLeitura: { temperatura: ultima.temperatura, umidade: ultima.umidade, em: ultima.medidoEm } } }
  );
  return docs.length;
}

module.exports = { valorSimulado, simularTodos, gerarHistorico };
