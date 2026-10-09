// Testes de integracao: sobem o app de verdade (supertest) com um MongoDB de teste.
const request = require('supertest');
const { conectarTeste, limparBanco, desconectarTeste } = require('./setup');

const app = require('../src/app');
const Usuario = require('../src/models/Usuario');
const Dispositivo = require('../src/models/Dispositivo');
const Leitura = require('../src/models/Leitura');
const Alerta = require('../src/models/Alerta');
const { verificarOffline } = require('../src/services/alertas');
const { gerarHistorico } = require('../src/services/simulador');
const { gerarHistoricoMercado } = require('../src/services/mercado');

let tokens = {};

async function criarUsuario(perfil) {
  const email = `${perfil}@teste.local`;
  await Usuario.create({ nome: perfil, email, perfil, senhaHash: await Usuario.gerarHash('Senha@1234') });
  const r = await request(app).post('/api/auth/login').send({ email, senha: 'Senha@1234' });
  return r.body.token;
}
const auth = (perfil) => ({ Authorization: `Bearer ${tokens[perfil]}` });

const novoDispositivo = (extra = {}) =>
  Dispositivo.create({ _id: 'ESP32-T1', place: 'Teste', regiao: 'Regiao T', fonte: 'simulado', ...extra });

beforeAll(async () => {
  await conectarTeste();
});
afterAll(desconectarTeste);

beforeEach(async () => {
  await limparBanco();
  tokens = {
    admin: await criarUsuario('admin'),
    produtor: await criarUsuario('produtor'),
    analista: await criarUsuario('analista'),
  };
});

describe('autenticacao e RBAC (RF08, RF12)', () => {
  test('login com senha errada devolve 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@teste.local', senha: 'errada' });
    expect(r.status).toBe(401);
  });

  test('rota protegida sem token devolve 401', async () => {
    expect((await request(app).get('/api/dispositivos')).status).toBe(401);
  });

  test('token falso devolve 401', async () => {
    const r = await request(app).get('/api/dispositivos').set('Authorization', 'Bearer abc.def.ghi');
    expect(r.status).toBe(401);
  });

  test('/auth/me nao vaza o hash da senha', async () => {
    const r = await request(app).get('/api/auth/me').set(auth('produtor'));
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('produtor@teste.local');
    expect(JSON.stringify(r.body)).not.toContain('senhaHash');
  });

  test('produtor nao acessa gerenciamento de usuarios; admin acessa', async () => {
    expect((await request(app).get('/api/usuarios').set(auth('produtor'))).status).toBe(403);
    expect((await request(app).get('/api/usuarios').set(auth('admin'))).status).toBe(200);
  });

  test('admin cria usuario (senha curta e recusada)', async () => {
    const ruim = await request(app).post('/api/usuarios').set(auth('admin')).send({ nome: 'X', email: 'x@x.com', senha: '123' });
    expect(ruim.status).toBe(400);
    const ok = await request(app).post('/api/usuarios').set(auth('admin')).send({ nome: 'Novo', email: 'novo@x.com', senha: 'Senha@1234', perfil: 'analista' });
    expect(ok.status).toBe(201);
    expect(ok.body.perfil).toBe('analista');
  });

  test('relatorio de seguranca conta falhas de login e acessos negados', async () => {
    await request(app).post('/api/auth/login').send({ email: 'admin@teste.local', senha: 'errada' });
    await request(app).get('/api/usuarios').set(auth('produtor')); // 403
    const r = await request(app).get('/api/relatorios/seguranca').set(auth('admin'));
    expect(r.status).toBe(200);
    expect(r.body.totais.login_falha).toBe(1);
    expect(r.body.totais.acesso_negado).toBe(1);
    expect(r.body.totais.login_ok).toBe(3);
    expect((await request(app).get('/api/relatorios/seguranca').set(auth('produtor'))).status).toBe(403);
  });
});

describe('ingestao, alertas e estado dos alertas (RF01, RF09)', () => {
  test('leitura quente cria alerta critico, sem duplicar', async () => {
    await novoDispositivo();
    const enviar = (t) => request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: t, umidade: 65 });

    expect((await enviar(34.5)).status).toBe(201);
    await new Promise((r) => setTimeout(r, 15)); // medidoEm diferente (indice unico)
    expect((await enviar(35.1)).status).toBe(201);

    const alertas = await Alerta.find({ tipo: 'temp_alta' });
    expect(alertas).toHaveLength(1);
    expect(alertas[0].severity).toBe('Crítico');
    expect(alertas[0].codigo).toBe('AL-0001');
  });

  test('leitura invalida e descartada', async () => {
    await novoDispositivo();
    const r = await request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: 'abc', umidade: 65 });
    expect(r.status).toBe(400);
    expect(await Leitura.countDocuments()).toBe(0);
  });

  test('fluxo do alerta: reconhecer -> registrar (exige categoria) -> resolver', async () => {
    await novoDispositivo();
    await request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: 36, umidade: 65 });
    const { body: lista } = await request(app).get('/api/alertas?status=abertos').set(auth('produtor'));
    const id = lista[0].id;
    const acao = (a, extra = {}) => request(app).post(`/api/alertas/${id}/acao`).set(auth('produtor')).send({ acao: a, ...extra });

    expect((await acao('resolver')).status).toBe(409); // nao pode pular etapa
    expect((await acao('reconhecer')).body.status).toBe('reconhecido');
    expect((await acao('registrar')).status).toBe(409); // sem categoria
    const reg = await acao('registrar', { categoria: 'Equipe acionada', nota: 'Equipe a caminho' });
    expect(reg.body.status).toBe('tratamento');
    expect(reg.body.note).toBe('Equipe a caminho');
    expect((await acao('resolver')).body.status).toBe('resolvido');

    const alerta = await Alerta.findOne({ codigo: id });
    expect(alerta.historico.map((h) => h.acao)).toEqual(['reconhecer', 'registrar', 'resolver']);
  });

  test('analista so le alertas, nao age', async () => {
    await novoDispositivo();
    await request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: 36, umidade: 65 });
    const lista = await request(app).get('/api/alertas').set(auth('analista'));
    expect(lista.status).toBe(200);
    const r = await request(app).post(`/api/alertas/${lista.body[0].id}/acao`).set(auth('analista')).send({ acao: 'reconhecer' });
    expect(r.status).toBe(403);
  });

  test('badge: marcar-vistos zera os nao vistos', async () => {
    await novoDispositivo();
    await request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: 36, umidade: 65 });
    expect((await request(app).get('/api/alertas/resumo').set(auth('produtor'))).body.naoVistos).toBeGreaterThan(0);
    await request(app).post('/api/alertas/marcar-vistos').set(auth('produtor'));
    expect((await request(app).get('/api/alertas/resumo').set(auth('produtor'))).body.naoVistos).toBe(0);
  });

  test('dispositivo parado vira alerta offline e, ao voltar, fecha o alerta e avisa a reconexao', async () => {
    await novoDispositivo({ ultimaLeitura: { temperatura: 28, umidade: 65, em: new Date(Date.now() - 3600 * 1000) } });
    await verificarOffline();
    expect(await Alerta.countDocuments({ tipo: 'offline' })).toBe(1);

    await request(app).post('/api/leituras').set(auth('admin')).send({ dispositivo: 'ESP32-T1', temperatura: 28, umidade: 65 });
    const offline = await Alerta.findOne({ tipo: 'offline' });
    expect(offline.status).toBe('resolvido');
    expect(await Alerta.countDocuments({ tipo: 'reconectado' })).toBe(1);

    const lista = await request(app).get('/api/dispositivos').set(auth('produtor'));
    expect(lista.body[0].state).toBe('ok');
  });
});

describe('integracao com ThingSpeak (RF02, RNF11)', () => {
  afterEach(() => jest.restoreAllMocks());

  const feedsFalsos = () => {
    const agora = Date.now();
    return {
      feeds: [
        { created_at: new Date(agora - 20000).toISOString(), entry_id: 1, field1: '29.5', field2: '60', field3: '30', field4: '29', field5: '29.5' },
        { created_at: new Date(agora - 1000).toISOString(), entry_id: 2, field1: '30.0', field2: '58', field3: '30.5', field4: '29.5', field5: '30' },
        { created_at: new Date(agora - 500).toISOString(), entry_id: 3, field1: null, field2: null, field3: null, field4: null, field5: null },
      ],
    };
  };

  test('busca o canal, guarda leituras validas e ignora as invalidas', async () => {
    await novoDispositivo({ fonte: 'thingspeak', channelId: '123456' });
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => feedsFalsos() });

    const r = await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    expect(r.status).toBe(200);
    expect(r.body['ESP32-T1']).toEqual({ recebidas: 3, salvas: 2, duplicadas: 0, invalidas: 1 });
    expect(String(spy.mock.calls[0][0])).toContain('/channels/123456/feeds.json');

    const leituras = await Leitura.find().sort({ medidoEm: 1 });
    expect(leituras[1].temperatura).toBe(30);
    expect(leituras[1].maxima).toBe(30.5);
    expect(leituras[1].fonte).toBe('thingspeak');
  });

  test('respeita o intervalo minimo entre consultas (RNF11)', async () => {
    await novoDispositivo({ fonte: 'thingspeak', channelId: '123456' });
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => feedsFalsos() });

    await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    const segunda = await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    expect(segunda.body['ESP32-T1']).toEqual({ ignorado: 'intervalo minimo entre consultas' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('nao duplica leituras quando a janela do ThingSpeak se repete', async () => {
    await novoDispositivo({ fonte: 'thingspeak', channelId: '123456' });
    const resposta = feedsFalsos(); // mesma resposta nas duas consultas (mesmos created_at)
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => resposta });

    await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    await Dispositivo.updateOne({ _id: 'ESP32-T1' }, { ultimoSync: null }); // libera nova consulta
    const r = await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    expect(r.body['ESP32-T1'].duplicadas).toBe(2);
    expect(await Leitura.countDocuments()).toBe(2);
  });

  test('falha de rede nao derruba a API', async () => {
    await novoDispositivo({ fonte: 'thingspeak', channelId: '123456' });
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('sem internet'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await request(app).post('/api/leituras/sincronizar').set(auth('admin'));
    expect(r.status).toBe(200);
    expect(r.body['ESP32-T1'].erro).toBe('sem internet');
  });
});

describe('dashboard: visao geral, historico, previsao, mercado (RF03, RF06, RF07, RF10)', () => {
  beforeEach(async () => {
    const disp = await novoDispositivo({ simulacao: { baseTemp: 27, baseUmid: 65 } });
    await gerarHistorico(disp, 10);
    await gerarHistoricoMercado(30);
  });

  test('visao geral devolve metricas, regioes e rede', async () => {
    const r = await request(app).get('/api/visao-geral').set(auth('produtor'));
    expect(r.status).toBe(200);
    expect(r.body.temperatura.serie.length).toBeGreaterThan(0);
    expect(r.body.rede).toEqual({ total: 1, online: 1, warn: 0, down: 0 });
    expect(r.body.regions[0].name).toBe('Regiao T');
    expect(r.body.luminosidade).toBeNull();
  });

  test('historico agrega por dia no formato do front', async () => {
    const r = await request(app).get('/api/historico?periodo=7&variavel=temperatura').set(auth('produtor'));
    expect(r.status).toBe(200);
    expect(r.body.vals.length).toBeGreaterThanOrEqual(7);
    expect(r.body.bars[0]).toHaveProperty('lo');
    expect(r.body.bars[0]).toHaveProperty('hi');
    expect(r.body.insights).toHaveLength(3);
    expect(r.body.unit).toBe('°C');
  });

  test('historico valida parametros', async () => {
    expect((await request(app).get('/api/historico?periodo=99').set(auth('produtor'))).status).toBe(400);
    expect((await request(app).get('/api/historico?variavel=luz').set(auth('produtor'))).status).toBe(400);
  });

  test('detalhe do dispositivo traz serie de 24h e campos sem sensor como null', async () => {
    const r = await request(app).get('/api/dispositivos/ESP32-T1').set(auth('produtor'));
    expect(r.status).toBe(200);
    expect(r.body.series.length).toBeGreaterThan(0);
    expect(r.body.lux).toBeNull();
    expect((await request(app).get('/api/dispositivos/NAO-EXISTE').set(auth('produtor'))).status).toBe(404);
  });

  test('previsao projeta os proximos dias com recomendacao', async () => {
    const r = await request(app).get('/api/previsao?produto=manga').set(auth('analista'));
    expect(r.status).toBe(200);
    expect(r.body.suficiente).toBe(true);
    expect(r.body.dias).toHaveLength(3);
    expect(['Janela ideal', 'Condições boas', 'Aguardar']).toContain(r.body.melhorDia.recomendacao);
  });

  test('analista cadastra preco de mercado; produtor nao', async () => {
    const corpo = { produto: 'Manga', destino: 'EUA', precoUsdKg: 1.5 };
    expect((await request(app).post('/api/mercado').set(auth('produtor')).send(corpo)).status).toBe(403);
    const ok = await request(app).post('/api/mercado').set(auth('analista')).send(corpo);
    expect(ok.status).toBe(201);
    expect(ok.body.produto).toBe('manga');
    const ultimos = await request(app).get('/api/mercado/ultimos').set(auth('produtor'));
    const manga = ultimos.body.find((m) => m.produto === 'manga' && m.destino === 'EUA');
    expect(manga.precoUsdKg).toBe(1.5);
  });
});

describe('geral', () => {
  test('health check e rota inexistente', async () => {
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
    expect((await request(app).get('/api/nada')).status).toBe(401); // painel exige login antes
  });
});
