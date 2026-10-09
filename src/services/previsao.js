const { mediasPor } = require('./agregacoes');
const Mercado = require('../models/Mercado');
const Alerta = require('../models/Alerta');
const env = require('../config/env');
const { media, regressaoLinear } = require('./estatisticas');
const { arredondar, chaveDia, limitar } = require('../utils');
const { criarAlerta } = require('./alertas');

/**
 * Pontuacao 0-100 de um dia para colheita/exportacao (funcao pura).
 *  - 50% temperatura dentro da faixa ideal
 *  - 30% umidade dentro da faixa
 *  - 20% preco de mercado (fator = preco recente / preco medio do mes)
 */
function pontuarDia({ temp, umid, fatorMercado = 1 }) {
  const { tempMin, tempMax } = env.janela;
  const { umidMin, umidMax } = env.limites;

  const distTemp = temp < tempMin ? tempMin - temp : temp > tempMax ? temp - tempMax : 0;
  const distUmid = umid < umidMin ? umidMin - umid : umid > umidMax ? umid - umidMax : 0;

  const notaTemp = limitar(100 - 20 * distTemp, 0, 100);
  const notaUmid = limitar(100 - 5 * distUmid, 0, 100);
  const notaMercado = limitar(50 + (fatorMercado - 1) * 250, 0, 100);

  return Math.round(0.5 * notaTemp + 0.3 * notaUmid + 0.2 * notaMercado);
}

function classificar(pontuacao) {
  if (pontuacao >= 80) return 'Janela ideal';
  if (pontuacao >= 60) return 'Condições boas';
  return 'Aguardar';
}

// Preco medio dos ultimos 3 dias dividido pela media dos ultimos 30 dias
async function fatorDeMercado(produto) {
  const desde30 = chaveDia(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const desde3 = chaveDia(new Date(Date.now() - 3 * 24 * 3600 * 1000));
  const precos = await Mercado.find({ produto, dia: { $gte: desde30 } });
  if (precos.length === 0) return { fator: 1, precoAtual: null };
  const recentes = precos.filter((p) => p.dia >= desde3).map((p) => p.precoUsdKg);
  const mediaMes = media(precos.map((p) => p.precoUsdKg));
  const mediaRecente = recentes.length ? media(recentes) : mediaMes;
  return { fator: mediaRecente / mediaMes, precoAtual: arredondar(mediaRecente, 2) };
}

/**
 * Previsao simples (RF06): regressao linear sobre as medias diarias dos ultimos dias
 * e projecao para os proximos dias. E um modelo baseline - o time de Data Science
 * pode trocar por algo melhor mantendo o mesmo formato de resposta.
 */
async function gerarPrevisao({ dispositivo = 'todos', produto = 'manga', diasHistorico = 14, diasPrever = 3 } = {}) {
  const desde = new Date(Date.now() - diasHistorico * 24 * 3600 * 1000);
  const filtro = { medidoEm: { $gte: desde } };
  if (dispositivo !== 'todos') filtro.dispositivo = dispositivo;

  const linhas = (await mediasPor('dia', filtro)).map((l) => ({ temp: l.temperatura.media, umid: l.umidade.media }));

  if (linhas.length < 3) {
    return { suficiente: false, mensagem: 'Dados insuficientes: sao necessarios pelo menos 3 dias de leituras.', dias: [] };
  }

  const regTemp = regressaoLinear(linhas.map((l) => l.temp));
  const regUmid = regressaoLinear(linhas.map((l) => l.umid));
  const { fator, precoAtual } = await fatorDeMercado(produto);

  const dias = [];
  for (let i = 1; i <= diasPrever; i++) {
    const x = linhas.length - 1 + i;
    const temp = arredondar(regTemp.a + regTemp.b * x);
    const umid = arredondar(limitar(regUmid.a + regUmid.b * x, 0, 100));
    const pontuacao = pontuarDia({ temp, umid, fatorMercado: fator });
    dias.push({
      dia: chaveDia(new Date(Date.now() + i * 24 * 3600 * 1000)),
      tempPrevista: temp,
      umidPrevista: umid,
      pontuacao,
      recomendacao: classificar(pontuacao),
    });
  }
  const melhorDia = dias.reduce((a, b) => (b.pontuacao > a.pontuacao ? b : a));

  return {
    suficiente: true,
    dispositivo,
    produto,
    baseadoEmDias: linhas.length,
    precoAtualUsdKg: precoAtual,
    fatorMercado: arredondar(fator, 3),
    tendenciaTempPorDia: arredondar(regTemp.b, 2),
    dias,
    melhorDia,
  };
}

// Job: se a previsao achar uma janela ideal, avisa uma vez por dia (RF09)
async function verificarJanelaIdeal() {
  const p = await gerarPrevisao();
  if (!p.suficiente || p.melhorDia.pontuacao < 80) return null;

  const dd = `${p.melhorDia.dia.slice(8, 10)}/${p.melhorDia.dia.slice(5, 7)}`;
  const title = `Janela ideal de colheita identificada — ${dd}`;
  if (await Alerta.exists({ tipo: 'janela_ideal', title })) return null;
  return criarAlerta({ tipo: 'janela_ideal', device: 'REDE', place: 'Perímetro irrigado', title });
}

module.exports = { pontuarDia, classificar, gerarPrevisao, verificarJanelaIdeal };
