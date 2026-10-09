// Maquina de estados dos alertas (mesma regra do front):
// pendente -> reconhecido -> tratamento -> resolvido | falso
const NEXT = {
  reconhecer: 'reconhecido',
  registrar: 'tratamento',
  resolver: 'resolvido',
  falso: 'falso',
};

// De quais estados cada acao pode partir
const PERMITIDO = {
  reconhecer: ['pendente'],
  registrar: ['reconhecido'],
  resolver: ['tratamento'],
  falso: ['pendente', 'reconhecido', 'tratamento'],
};

const ACOES = Object.keys(NEXT);

function podeTransicionar(status, acao, categoria) {
  if (!PERMITIDO[acao]) return false;
  if (!PERMITIDO[acao].includes(status)) return false;
  if (acao === 'registrar') return !!categoria; // registrar acao exige categoria
  return true;
}

function transicionar(status, acao) {
  return PERMITIDO[acao]?.includes(status) ? NEXT[acao] : status;
}

const estaAberto = (status) => status !== 'resolvido' && status !== 'falso';

module.exports = { ACOES, podeTransicionar, transicionar, estaAberto };
