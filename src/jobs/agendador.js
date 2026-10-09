// Tarefas que rodam sozinhas em segundo plano (poller do ThingSpeak, simulador, alertas...).
// Usa setInterval simples; num sistema maior trocariamos por fila/cron de verdade.
const env = require('../config/env');
const { sincronizarTodos } = require('../services/thingspeak');
const { simularTodos } = require('../services/simulador');
const { verificarOffline } = require('../services/alertas');
const { simularMercado } = require('../services/mercado');
const { verificarJanelaIdeal } = require('../services/previsao');

const timers = [];

// Roda 'fn' a cada 'ms'. Se a execucao anterior ainda nao terminou, pula (evita acumular).
function repetir(nome, ms, fn) {
  let rodando = false;
  const executar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await fn();
    } catch (erro) {
      console.error(`[agendador] ${nome}: ${erro.message}`);
    } finally {
      rodando = false;
    }
  };
  executar(); // ja roda uma vez na partida
  const t = setInterval(executar, ms);
  t.unref(); // nao segura o processo aberto sozinho
  timers.push(t);
}

function iniciarAgendador() {
  // RF01/RF02: busca dados novos do canal ThingSpeak
  repetir('thingspeak', env.thingspeak.intervaloSeg * 1000, sincronizarTodos);

  // RNF07: dispositivos simulados
  if (env.simulador.ativo) repetir('simulador', env.simulador.intervaloSeg * 1000, simularTodos);

  // RF09: dispositivo sem leitura vira alerta
  repetir('offline', 60 * 1000, () => verificarOffline());

  // RF03/RF09: preco do dia + janela ideal de colheita
  repetir('mercado', 60 * 60 * 1000, async () => {
    await simularMercado();
    await verificarJanelaIdeal();
  });

  console.log(`[agendador] ativo (ThingSpeak a cada ${env.thingspeak.intervaloSeg}s, simulador ${env.simulador.ativo ? 'ligado' : 'desligado'})`);
}

function pararAgendador() {
  timers.splice(0).forEach(clearInterval);
}

module.exports = { iniciarAgendador, pararAgendador };
