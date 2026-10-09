const { mediasPor } = require('./agregacoes');
const Alerta = require('../models/Alerta');
const env = require('../config/env');
const { media, minimo, maximo, tendencia } = require('./estatisticas');
const { arredondar, chaveDia, ErroApp } = require('../utils');

const DIAS_POR_PERIODO = { 7: 7, 30: 30, safra: env.safraDias };

const fmt1 = (v) => v.toFixed(1).replace('.', ',');

// Configuracao de cada variavel (mesmos dominios/unidades que o front usa)
const VARIAVEIS = {
  temperatura: {
    campo: 'temperatura',
    unit: '°C',
    domain: [18, 36],
    fora: (v) => v > env.limites.tempMax,
    formatar: (v) => `${fmt1(v)} °C`,
    tipos: ['temp_alta', 'offline', 'reconectado'],
  },
  umidade: {
    campo: 'umidade',
    unit: '%',
    domain: [30, 100],
    fora: (v) => v < env.limites.umidMin,
    formatar: (v) => `${Math.round(v)}%`,
    tipos: ['umid_baixa', 'umid_alta', 'offline', 'reconectado'],
  },
};

// Textos dos 3 cards de "insights" (tendencia, extremos, fora do padrao)
function gerarInsights(vals, v, dispositivo) {
  const n = vals.length;
  const [d0, d1] = v.domain;
  const tend = tendencia(vals, (d1 - d0) * 0.03);
  const mx = maximo(vals);
  const mn = minimo(vals);
  const fora = vals.filter(v.fora).length;
  return [
    { label: 'TENDÊNCIA', tone: 'accent', text: `Média diária ${tend}, variando entre ${v.formatar(mn)} e ${v.formatar(mx)} nos ${n} dias do período.` },
    { label: 'EXTREMOS', tone: 'muted', text: `Máxima de ${v.formatar(mx)} no dia ${vals.indexOf(mx) + 1}; mínima de ${v.formatar(mn)} no dia ${vals.indexOf(mn) + 1}.` },
    fora > 0
      ? { label: 'FORA DO PADRÃO', tone: 'crit', text: `${fora} ${fora === 1 ? 'dia' : 'dias'} fora da faixa operacional no período${dispositivo === 'todos' ? '' : ` (${dispositivo})`}.` }
      : { label: 'FORA DO PADRÃO', tone: 'ok', text: 'Nenhum dia fora da faixa operacional no período.' },
  ];
}

/**
 * Historico agregado por dia (RF10). Mesmo formato que a tela de Historico do front usa:
 * vals (media diaria), bars (min/max do dia), events (alertas), insights...
 */
async function montarHistorico({ periodo = '30', variavel = 'temperatura', dispositivo = 'todos' }) {
  const dias = DIAS_POR_PERIODO[periodo];
  const v = VARIAVEIS[variavel];
  if (!dias) throw new ErroApp(400, 'periodo invalido (use 7, 30 ou safra)');
  if (!v) throw new ErroApp(400, 'variavel invalida (use temperatura ou umidade)');

  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
  const filtro = { medidoEm: { $gte: desde } };
  if (dispositivo !== 'todos') filtro.dispositivo = dispositivo;

  const linhas = (await mediasPor('dia', filtro)).map((l) => ({ _id: l.chave, ...l[v.campo] }));

  const titulo = `${variavel[0].toUpperCase()}${variavel.slice(1)} · ${periodo === 'safra' ? 'safra' : `${periodo} dias`} · ${dispositivo === 'todos' ? 'todas as regiões' : dispositivo}`;
  const base = { periodo, variavel, dispositivo, title: titulo, domain: v.domain, unit: v.unit };

  if (linhas.length === 0) {
    return { ...base, n: 0, dias: [], vals: [], bars: [], events: [], xLabels: [], insights: [] };
  }

  const diasChave = linhas.map((l) => l._id);
  const vals = linhas.map((l) => arredondar(l.media));
  const bars = linhas.map((l, i) => ({
    lo: arredondar(l.min),
    hi: arredondar(l.max),
    tone: v.fora(vals[i]) ? 'crit' : 'accent',
  }));

  // Eventos = alertas do periodo ligados a essa variavel, posicionados no dia certo do grafico
  const filtroAlerta = { createdAt: { $gte: desde }, tipo: { $in: v.tipos } };
  if (dispositivo !== 'todos') filtroAlerta.device = dispositivo;
  const alertas = await Alerta.find(filtroAlerta).sort({ createdAt: 1 });
  const events = alertas
    .map((a) => ({
      idx: diasChave.indexOf(chaveDia(a.createdAt)),
      label: `${a.title} — ${a.device}`,
      tone: a.severity === 'Crítico' ? 'crit' : 'info',
      device: a.device,
    }))
    .filter((e) => e.idx >= 0);

  const n = vals.length;
  return {
    ...base,
    n,
    dias: diasChave,
    vals,
    bars,
    events,
    xLabels: [`há ${n - 1} dias`, `há ${Math.round((n - 1) / 2)} dias`, 'hoje'],
    insights: gerarInsights(vals, v, dispositivo),
  };
}

module.exports = { montarHistorico, gerarInsights, VARIAVEIS };
