const Alerta = require('../models/Alerta');
const Dispositivo = require('../models/Dispositivo');
const { proximoNumero } = require('../models/Contador');
const env = require('../config/env');
const { podeTransicionar, transicionar, estaAberto } = require('./maquinaAlertas');
const { rotuloTempo, ErroApp } = require('../utils');
const { calcularEstado } = require('./estado');

// Cada tipo de alerta tem severidade e titulo fixos
const MODELOS = {
  temp_alta: { severity: 'Crítico', tone: 'down', title: 'Temperatura acima do limite operacional' },
  umid_baixa: { severity: 'Atenção', tone: 'warn', title: 'Umidade abaixo do esperado' },
  umid_alta: { severity: 'Atenção', tone: 'warn', title: 'Umidade acima do esperado' },
  offline: { severity: 'Crítico', tone: 'down', title: 'Dispositivo desconectado' },
  reconectado: { severity: 'Informativo', tone: 'info', title: 'Dispositivo reconectado' },
  janela_ideal: { severity: 'Informativo', tone: 'info', title: 'Janela ideal de colheita identificada' },
};

// Formato AlertRaw do front
function alertaParaFront(a, agora = new Date()) {
  return {
    id: a.codigo,
    tipo: a.tipo,
    severity: a.severity,
    tone: a.tone,
    title: a.title,
    device: a.device,
    place: a.place,
    time: rotuloTempo(a.createdAt, agora),
    criadoEm: a.createdAt,
    status: a.status,
    category: a.category,
    note: a.note,
    visto: a.visto,
  };
}

/**
 * Cria um alerta, a nao ser que ja exista um igual (mesmo tipo + dispositivo) que esteja
 * aberto ou tenha sido criado ha pouco tempo (cooldown). Evita encher a tela de alertas
 * repetidos quando a temperatura fica oscilando em volta do limite.
 */
async function criarAlerta({ tipo, device, place, title }) {
  const modelo = MODELOS[tipo];
  const desde = new Date(Date.now() - env.limites.cooldownAlertaMin * 60 * 1000);

  const existente = await Alerta.findOne({
    tipo,
    device,
    $or: [{ status: { $in: ['pendente', 'reconhecido', 'tratamento'] } }, { createdAt: { $gte: desde } }],
  });
  if (existente) return null;

  const numero = await proximoNumero('alerta');
  return Alerta.create({
    codigo: `AL-${String(numero).padStart(4, '0')}`,
    tipo,
    ...modelo,
    title: title || modelo.title,
    device,
    place,
  });
}

// Chamado a cada leitura nova: confere os limites (RF09)
async function avaliarLeitura(disp, leitura) {
  const { tempMax, umidMin, umidMax } = env.limites;
  const limiteTemp = disp.faixaTemp?.max ?? tempMax;
  const criados = [];
  const push = async (tipo) => {
    const a = await criarAlerta({ tipo, device: disp._id, place: disp.place });
    if (a) criados.push(a);
  };

  if (leitura.temperatura > limiteTemp) await push('temp_alta');
  if (leitura.umidade < umidMin) await push('umid_baixa');
  if (leitura.umidade > umidMax) await push('umid_alta');
  return criados;
}

// Roda de tempos em tempos: dispositivo sem leitura ha muito tempo vira alerta "offline"
async function verificarOffline(agora = new Date()) {
  const dispositivos = await Dispositivo.find({ ativo: true });
  const criados = [];
  for (const d of dispositivos) {
    if (calcularEstado(d, agora).state !== 'down') continue;
    const a = await criarAlerta({ tipo: 'offline', device: d._id, place: d.place });
    if (a) criados.push(a);
  }
  return criados;
}

// Dispositivo voltou: fecha os alertas "offline" abertos e avisa que reconectou
async function tratarReconexao(disp) {
  await Alerta.updateMany(
    { device: disp._id, tipo: 'offline', status: { $in: ['pendente', 'reconhecido', 'tratamento'] } },
    {
      $set: { status: 'resolvido' },
      $push: { historico: { acao: 'auto-resolvido', de: 'aberto', para: 'resolvido', por: 'sistema' } },
    }
  );
  return criarAlerta({ tipo: 'reconectado', device: disp._id, place: disp.place });
}

async function buscarPorCodigo(codigo) {
  const alerta = await Alerta.findOne({ codigo });
  if (!alerta) throw new ErroApp(404, 'Alerta nao encontrado');
  return alerta;
}

// Aplica uma acao do usuario (reconhecer, registrar, resolver, falso)
async function aplicarAcao(codigo, acao, usuario, { categoria, nota } = {}) {
  const alerta = await buscarPorCodigo(codigo);
  if (categoria !== undefined) alerta.category = categoria;
  if (nota !== undefined) alerta.note = nota;

  if (!podeTransicionar(alerta.status, acao, alerta.category)) {
    const msg = acao === 'registrar' && !alerta.category
      ? 'Informe a categoria para registrar a acao'
      : `Nao e possivel "${acao}" quando o alerta esta "${alerta.status}"`;
    throw new ErroApp(409, msg);
  }
  const de = alerta.status;
  alerta.status = transicionar(alerta.status, acao);
  alerta.historico.push({ acao, de, para: alerta.status, por: usuario.email });
  await alerta.save();
  return alerta;
}

module.exports = {
  MODELOS,
  alertaParaFront,
  criarAlerta,
  avaliarLeitura,
  verificarOffline,
  tratarReconexao,
  buscarPorCodigo,
  aplicarAcao,
  estaAberto,
};
