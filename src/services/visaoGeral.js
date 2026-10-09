const Dispositivo = require('../models/Dispositivo');
const { mediasPor } = require('./agregacoes');
const Alerta = require('../models/Alerta');
const { media } = require('./estatisticas');
const { calcularEstado } = require('./estado');
const { alertaParaFront } = require('./alertas');
const { arredondar, emRecife } = require('../utils');

// Pega o ultimo valor e a variacao em relacao ao anterior
function metrica(serie, campo) {
  const vals = serie.map((s) => s[campo]);
  const atual = vals.length ? vals[vals.length - 1] : null;
  const anterior = vals.length > 1 ? vals[vals.length - 2] : null;
  return { atual, delta: atual !== null && anterior !== null ? arredondar(atual - anterior) : null, serie: vals };
}

/** Dados da tela "Visao Geral" do front. */
async function montarVisaoGeral() {
  const agora = new Date();
  const dispositivos = await Dispositivo.find({ ativo: true });
  const estados = dispositivos.map((d) => ({ d, ...calcularEstado(d, agora) }));

  // Serie das ultimas 24h: media de todos os dispositivos, hora a hora
  const linhas = await mediasPor('hora', { medidoEm: { $gte: new Date(agora.getTime() - 24 * 3600 * 1000) } });
  const serie = linhas.map((l, i) => ({
    hora: i === linhas.length - 1 ? `agora · ${emRecife(agora).slice(11, 16)}` : `${l.chave.slice(11, 13)}h`,
    temp: arredondar(l.temperatura.media),
    hum: arredondar(l.umidade.media),
  }));

  // Condicao por regiao (so conta dispositivos online)
  const porRegiao = {};
  for (const e of estados) {
    const r = (porRegiao[e.d.regiao] ||= { name: e.d.regiao, total: 0, offline: 0, temps: [], lo: e.d.faixaTemp.min, hi: e.d.faixaTemp.max });
    r.total++;
    if (e.state === 'down') r.offline++;
    else if (e.d.ultimaLeitura.temperatura != null) r.temps.push(e.d.ultimaLeitura.temperatura);
  }
  const regions = Object.values(porRegiao)
    .filter((r) => r.temps.length > 0)
    .map((r) => ({
      name: r.name,
      sub: `${r.total} ${r.total === 1 ? 'dispositivo' : 'dispositivos'}${r.offline ? ` · ${r.offline} sem comunicação` : ''}`,
      v: arredondar(media(r.temps)),
      lo: r.lo,
      hi: r.hi,
    }));

  const online = estados.filter((e) => e.state !== 'down' && e.d.ultimaLeitura.temperatura != null);
  const maisQuente = online.sort((a, b) => b.d.ultimaLeitura.temperatura - a.d.ultimaLeitura.temperatura)[0];

  const abertos = await Alerta.find({ status: { $in: ['pendente', 'reconhecido', 'tratamento'] } }).sort({ createdAt: -1 }).limit(3);

  return {
    atualizadoEm: agora,
    atualizadoEmLabel: emRecife(agora).slice(11, 16),
    horas: serie.map((s) => s.hora),
    temperatura: metrica(serie, 'temp'),
    umidade: metrica(serie, 'hum'),
    luminosidade: null, // o hardware atual (DHT11) nao tem sensor de luz
    maxRegional: maisQuente ? { id: maisQuente.d._id, temp: maisQuente.d.ultimaLeitura.temperatura } : null,
    rede: {
      total: estados.length,
      online: estados.filter((e) => e.state === 'ok').length,
      warn: estados.filter((e) => e.state === 'warn').length,
      down: estados.filter((e) => e.state === 'down').length,
    },
    regions,
    atencao: abertos.map((a) => alertaParaFront(a, agora)),
  };
}

module.exports = { montarVisaoGeral };
