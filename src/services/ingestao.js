const Leitura = require('../models/Leitura');
const Dispositivo = require('../models/Dispositivo');
const env = require('../config/env');
const { arredondar, paraNumero, chaveDia, chaveHora } = require('../utils');
const { calcularEstado } = require('./estado');
const { avaliarLeitura, tratarReconexao } = require('./alertas');

// Faixa fisica aceitavel: fora disso e erro do sensor, nao clima.
const LIMITE_FISICO = { temperatura: [-10, 60], umidade: [0, 100] };

/**
 * Limpeza basica dos dados na entrada (RF05). Devolve { valida, motivo, dados }.
 * A limpeza pesada (outliers, interpolacao etc) fica com o pessoal de Data Science em Python/R.
 */
function tratarLeitura(bruta) {
  const temperatura = arredondar(paraNumero(bruta.temperatura), 1);
  const umidade = arredondar(paraNumero(bruta.umidade), 1);

  if (temperatura === null || umidade === null) return { valida: false, motivo: 'valor ausente ou nao numerico' };
  if (temperatura === 0 && umidade === 0) return { valida: false, motivo: 'leitura 0/0 (falha do DHT11)' };
  if (temperatura < LIMITE_FISICO.temperatura[0] || temperatura > LIMITE_FISICO.temperatura[1]) {
    return { valida: false, motivo: 'temperatura fora da faixa fisica' };
  }
  if (umidade < LIMITE_FISICO.umidade[0] || umidade > LIMITE_FISICO.umidade[1]) {
    return { valida: false, motivo: 'umidade fora da faixa fisica' };
  }

  return {
    valida: true,
    dados: {
      temperatura,
      umidade,
      maxima: arredondar(paraNumero(bruta.maxima), 1),
      minima: arredondar(paraNumero(bruta.minima), 1),
      media: arredondar(paraNumero(bruta.media), 1),
    },
  };
}

/**
 * Ponto unico de entrada de leituras (ThingSpeak, simulador ou manual).
 * Trata -> grava -> atualiza o dispositivo -> avalia alertas.
 */
async function registrarLeitura(disp, bruta, { fonte = 'thingspeak', entryId = null } = {}) {
  const tratada = tratarLeitura(bruta);
  if (!tratada.valida) return { salva: false, motivo: tratada.motivo };

  const medidoEm = bruta.medidoEm ? new Date(bruta.medidoEm) : new Date();
  if (Number.isNaN(medidoEm.getTime())) return { salva: false, motivo: 'data invalida' };

  let leitura;
  try {
    leitura = await Leitura.create({
      dispositivo: disp._id,
      ...tratada.dados,
      medidoEm,
      dia: chaveDia(medidoEm),
      hora: chaveHora(medidoEm),
      entryId,
      fonte,
    });
  } catch (erro) {
    if (erro.code === 11000) return { salva: false, motivo: 'duplicada' };
    throw erro;
  }

  // So atualiza o "ultimo valor" do dispositivo se essa leitura for a mais nova
  const anterior = disp.ultimaLeitura?.em;
  if (!anterior || medidoEm > new Date(anterior)) {
    const estavaOffline = !!anterior && calcularEstado(disp).state === 'down';
    disp.ultimaLeitura = { temperatura: leitura.temperatura, umidade: leitura.umidade, em: medidoEm };
    await Dispositivo.updateOne({ _id: disp._id }, { $set: { ultimaLeitura: disp.ultimaLeitura } });

    // Leitura antiga (ex: carga inicial do historico do ThingSpeak) nao deve gerar alerta
    const recente = Date.now() - medidoEm.getTime() < env.limites.offlineSeg * 1000;
    if (recente) {
      if (estavaOffline) await tratarReconexao(disp);
      await avaliarLeitura(disp, leitura);
    }
  }
  return { salva: true, leitura };
}

module.exports = { tratarLeitura, registrarLeitura, LIMITE_FISICO };
