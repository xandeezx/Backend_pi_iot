// Popula o banco com dados iniciais: usuarios, dispositivos, historico simulado e precos de mercado.
//   npm run seed           -> tudo (inclui 30 dias de historico simulado)
//   npm run seed:limpo     -> sem historico
// Pode rodar mais de uma vez: nao duplica o que ja existe.
const { conectarBanco, desconectarBanco } = require('../src/config/db');
const env = require('../src/config/env');
const Usuario = require('../src/models/Usuario');
const Dispositivo = require('../src/models/Dispositivo');
const Leitura = require('../src/models/Leitura');
const { gerarHistorico } = require('../src/services/simulador');
const { gerarHistoricoMercado } = require('../src/services/mercado');

const comHistorico = !process.argv.includes('--sem-historico');
const temCanalReal = !!env.thingspeak.channelId;

// Mesmos 7 dispositivos que o front mostra. O ESP32-001 e o dispositivo real (se houver canal configurado).
const DISPOSITIVOS = [
  { _id: 'ESP32-001', place: 'Bebedouro A', regiao: 'Núcleo Bebedouro', sensors: 'DHT11', firmware: 'v1.4.2',
    fonte: temCanalReal ? 'thingspeak' : 'simulado', channelId: env.thingspeak.channelId, simulacao: { baseTemp: 26.5, baseUmid: 68 } },
  { _id: 'ESP32-002', place: 'Bebedouro C', regiao: 'Núcleo Bebedouro', sensors: 'DHT22 · Solo', firmware: 'v1.4.2', simulacao: { baseTemp: 26, baseUmid: 57 } }, // umidade cai abaixo de 50% no pico da tarde
  { _id: 'ESP32-003', place: 'Nilo Coelho', regiao: 'Nilo Coelho', sensors: 'DHT22 · LDR · Solo', firmware: 'v1.4.2', simulacao: { baseTemp: 29.5, baseUmid: 64 } }, // passa de 32 C no pico da tarde
  { _id: 'ESP32-004', place: 'Maniçoba', regiao: 'Maniçoba / Curaçá', sensors: 'DHT22 · LDR', firmware: 'v1.3.9', simulacao: { baseTemp: 28, baseUmid: 60, offline: true } },
  { _id: 'ESP32-005', place: 'Curaçá', regiao: 'Maniçoba / Curaçá', sensors: 'DHT22 · Solo', firmware: 'v1.4.2', simulacao: { baseTemp: 25.5, baseUmid: 72 } },
  { _id: 'ESP32-006', place: 'Packing house', regiao: 'Packing house', sensors: 'DHT22 · Porta', firmware: 'v1.4.1', faixaTemp: { min: 12, max: 20 }, simulacao: { baseTemp: 15.5, baseUmid: 64 } },
  { _id: 'ESP32-007', place: 'Bebedouro B', regiao: 'Núcleo Bebedouro', sensors: 'DHT22 · Solo', firmware: 'v1.4.2', simulacao: { baseTemp: 27, baseUmid: 64 } },
];

const USUARIOS_DEMO = [
  { nome: 'Administrador', email: env.admin.email, senha: env.admin.senha, perfil: 'admin' },
  { nome: 'Produtor Demo', email: 'produtor@pi.local', senha: 'Produtor@123', perfil: 'produtor' },
  { nome: 'Analista Demo', email: 'analista@pi.local', senha: 'Analista@123', perfil: 'analista' },
];

async function main() {
  await conectarBanco();

  for (const u of USUARIOS_DEMO) {
    // Em producao so cria o admin; os usuarios demo ficam so no ambiente de desenvolvimento
    if (env.producao && u.perfil !== 'admin') continue;
    if (await Usuario.exists({ email: u.email })) continue;
    await Usuario.create({ nome: u.nome, email: u.email, perfil: u.perfil, senhaHash: await Usuario.gerarHash(u.senha) });
    console.log(`usuario criado: ${u.email} (${u.perfil})`);
  }

  for (const d of DISPOSITIVOS) {
    if (!(await Dispositivo.exists({ _id: d._id }))) {
      await Dispositivo.create(d);
      console.log(`dispositivo criado: ${d._id} (${d.fonte || 'simulado'})`);
    }
  }

  if (comHistorico) {
    // Historico falso so para dispositivos simulados que ainda nao tem leituras
    for (const d of await Dispositivo.find({ fonte: 'simulado' })) {
      if (await Leitura.exists({ dispositivo: d._id })) continue;
      const n = await gerarHistorico(d, 30);
      console.log(`historico simulado: ${d._id} (${n} leituras)`);
    }
    await gerarHistoricoMercado(30);
    console.log('historico de mercado simulado gerado');
  }

  if (!temCanalReal) console.log('\nAviso: THINGSPEAK_CHANNEL_ID vazio -> ESP32-001 ficou como simulado. Configure o .env e rode o seed em um banco limpo para usar o canal real.');
  await desconectarBanco();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
