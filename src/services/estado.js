const env = require('../config/env');

// Calcula o estado do dispositivo do jeito que o front espera:
//   down = sem comunicacao | warn = fora da faixa | ok = tudo certo
function calcularEstado(disp, agora = new Date()) {
  const em = disp.ultimaLeitura?.em;
  if (!em) return { state: 'down', lastSeenSec: null };

  const lastSeenSec = Math.max(0, Math.round((agora - new Date(em)) / 1000));
  if (lastSeenSec > env.limites.offlineSeg) return { state: 'down', lastSeenSec };

  const t = disp.ultimaLeitura.temperatura;
  const u = disp.ultimaLeitura.umidade;
  const foraTemp = t != null && t > (disp.faixaTemp?.max ?? env.limites.tempMax);
  const foraUmid = u != null && (u < env.limites.umidMin || u > env.limites.umidMax);
  return { state: foraTemp || foraUmid ? 'warn' : 'ok', lastSeenSec };
}

// Formato Device do front (lib/types.ts)
function dispositivoParaFront(disp, agora = new Date()) {
  const { state, lastSeenSec } = calcularEstado(disp, agora);
  const offline = state === 'down';
  return {
    id: disp._id,
    place: disp.place,
    regiao: disp.regiao,
    state,
    temp: offline ? null : disp.ultimaLeitura.temperatura,
    hum: offline ? null : disp.ultimaLeitura.umidade,
    lastSeenSec,
    sensors: disp.sensors,
    fonte: disp.fonte,
  };
}

module.exports = { calcularEstado, dispositivoParaFront };
