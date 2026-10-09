const Dispositivo = require('../models/Dispositivo');
const env = require('../config/env');
const { registrarLeitura } = require('./ingestao');

/**
 * Consulta a API REST do ThingSpeak (channel feeds) - RF02.
 * Doc: GET https://api.thingspeak.com/channels/{id}/feeds.json?results=N&api_key=KEY
 */
async function buscarFeeds(channelId, { results = 30 } = {}) {
  const url = new URL(`${env.thingspeak.baseUrl}/channels/${encodeURIComponent(channelId)}/feeds.json`);
  url.searchParams.set('results', String(results));
  // A Read Key vem do .env (RNF02) e so e enviada se o canal for privado
  if (env.thingspeak.readKey) url.searchParams.set('api_key', env.thingspeak.readKey);

  const resposta = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resposta.ok) throw new Error(`ThingSpeak respondeu HTTP ${resposta.status}`);
  const json = await resposta.json();
  // Canal vazio / chave errada pode devolver -1 em vez de objeto
  return Array.isArray(json?.feeds) ? json.feeds : [];
}

// Transforma um feed do ThingSpeak ({created_at, entry_id, field1...}) em leitura bruta
function mapearFeed(feed) {
  const c = env.thingspeak.campos;
  return {
    temperatura: feed[c.temperatura],
    umidade: feed[c.umidade],
    maxima: feed[c.maxima],
    minima: feed[c.minima],
    media: feed[c.media],
    medidoEm: feed.created_at,
    entryId: feed.entry_id,
  };
}

async function sincronizarDispositivo(disp, { agora = new Date() } = {}) {
  if (!disp.channelId) return { ignorado: 'dispositivo sem channelId' };

  // RNF11: respeita o intervalo minimo do plano gratuito
  if (disp.ultimoSync && agora - new Date(disp.ultimoSync) < env.thingspeak.intervaloSeg * 1000) {
    return { ignorado: 'intervalo minimo entre consultas' };
  }
  await Dispositivo.updateOne({ _id: disp._id }, { $set: { ultimoSync: agora } });
  disp.ultimoSync = agora;

  // Primeira vez busca mais historico; depois so os ultimos (duplicadas sao descartadas pelo indice unico)
  const results = disp.ultimaLeitura?.em ? 30 : 200;
  const feeds = await buscarFeeds(disp.channelId, { results });
  feeds.sort((a, b) => a.entry_id - b.entry_id); // mais antigas primeiro

  const resumo = { recebidas: feeds.length, salvas: 0, duplicadas: 0, invalidas: 0 };
  for (const feed of feeds) {
    const r = await registrarLeitura(disp, mapearFeed(feed), { fonte: 'thingspeak', entryId: feed.entry_id });
    if (r.salva) resumo.salvas++;
    else if (r.motivo === 'duplicada') resumo.duplicadas++;
    else resumo.invalidas++;
  }
  return resumo;
}

async function sincronizarTodos() {
  const dispositivos = await Dispositivo.find({ ativo: true, fonte: 'thingspeak', channelId: { $ne: '' } });
  const resultado = {};
  for (const d of dispositivos) {
    try {
      resultado[d._id] = await sincronizarDispositivo(d);
    } catch (erro) {
      // Falha de rede nao pode derrubar o servidor
      resultado[d._id] = { erro: erro.message };
      console.error(`[thingspeak] ${d._id}: ${erro.message}`);
    }
  }
  return resultado;
}

module.exports = { buscarFeeds, mapearFeed, sincronizarDispositivo, sincronizarTodos };
