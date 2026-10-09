// Funcoes pequenas e puras usadas em varios lugares (faceis de testar).
const env = require('./config/env');

class ErroApp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// "2026-10-08 16:42:10" no fuso de Recife (o locale sv-SE ja devolve nesse formato)
function emRecife(data) {
  return new Date(data).toLocaleString('sv-SE', { timeZone: env.tz });
}
const chaveDia = (data) => emRecife(data).slice(0, 10); // "2026-10-08"
const chaveHora = (data) => emRecife(data).slice(0, 13); // "2026-10-08 16"
const horaDoDia = (data) => Number(emRecife(data).slice(11, 13)); // 16

// Rotulo curto usado no front: "09:12", "ontem" ou "05/10"
function rotuloTempo(data, agora = new Date()) {
  const hoje = chaveDia(agora);
  const ontem = chaveDia(new Date(agora.getTime() - 24 * 3600 * 1000));
  const dia = chaveDia(data);
  if (dia === hoje) return emRecife(data).slice(11, 16);
  if (dia === ontem) return 'ontem';
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

const arredondar = (v, casas = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

// Converte "12.5" ou 12.5 em numero; vazio / lixo vira null
function paraNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

module.exports = { ErroApp, emRecife, chaveDia, chaveHora, horaDoDia, rotuloTempo, arredondar, paraNumero, limitar };
