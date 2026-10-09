// Testes unitarios: funcoes puras, nao precisam de banco.
process.env.NODE_ENV = 'test';

const { podeTransicionar, transicionar, estaAberto } = require('../src/services/maquinaAlertas');
const { media, regressaoLinear, tendencia } = require('../src/services/estatisticas');
const { tratarLeitura } = require('../src/services/ingestao');
const { mapearFeed } = require('../src/services/thingspeak');
const { pontuarDia, classificar } = require('../src/services/previsao');
const { gerarInsights, VARIAVEIS } = require('../src/services/historico');
const { calcularEstado } = require('../src/services/estado');
const { valorSimulado } = require('../src/services/simulador');
const { chaveDia, rotuloTempo, arredondar, paraNumero } = require('../src/utils');

describe('maquina de estados dos alertas', () => {
  test('fluxo completo: pendente -> reconhecido -> tratamento -> resolvido', () => {
    let s = 'pendente';
    expect(podeTransicionar(s, 'reconhecer', null)).toBe(true);
    s = transicionar(s, 'reconhecer');
    expect(s).toBe('reconhecido');
    s = transicionar(s, 'registrar');
    expect(s).toBe('tratamento');
    s = transicionar(s, 'resolver');
    expect(s).toBe('resolvido');
    expect(estaAberto(s)).toBe(false);
  });

  test('registrar acao exige categoria', () => {
    expect(podeTransicionar('reconhecido', 'registrar', null)).toBe(false);
    expect(podeTransicionar('reconhecido', 'registrar', 'Equipe acionada')).toBe(true);
  });

  test('nao pula etapas nem reabre alerta fechado', () => {
    expect(podeTransicionar('pendente', 'resolver', null)).toBe(false);
    expect(podeTransicionar('resolvido', 'falso', null)).toBe(false);
    expect(transicionar('resolvido', 'reconhecer')).toBe('resolvido');
  });

  test('acao desconhecida e recusada', () => {
    expect(podeTransicionar('pendente', 'apagar', null)).toBe(false);
  });
});

describe('estatisticas', () => {
  test('media', () => {
    expect(media([2, 4, 6])).toBe(4);
    expect(media([])).toBeNull();
  });

  test('regressao linear acha a reta exata', () => {
    const { a, b } = regressaoLinear([10, 12, 14, 16]);
    expect(b).toBeCloseTo(2);
    expect(a).toBeCloseTo(10);
  });

  test('tendencia', () => {
    expect(tendencia([1, 1, 5, 5], 1)).toBe('em alta');
    expect(tendencia([5, 5, 1, 1], 1)).toBe('em queda');
    expect(tendencia([3, 3.1, 3, 3.1], 1)).toBe('estável');
  });
});

describe('limpeza de leituras (RF05)', () => {
  test('aceita leitura boa e arredonda', () => {
    const r = tratarLeitura({ temperatura: '28.44', umidade: '67.0', maxima: '29', minima: '', media: null });
    expect(r.valida).toBe(true);
    expect(r.dados).toEqual({ temperatura: 28.4, umidade: 67, maxima: 29, minima: null, media: null });
  });

  test.each([
    [{ temperatura: null, umidade: 50 }],
    [{ temperatura: 'abc', umidade: 50 }],
    [{ temperatura: 0, umidade: 0 }],
    [{ temperatura: 200, umidade: 50 }],
    [{ temperatura: 25, umidade: 130 }],
  ])('descarta leitura invalida %j', (bruta) => {
    expect(tratarLeitura(bruta).valida).toBe(false);
  });
});

describe('ThingSpeak', () => {
  test('mapeia os campos do canal (field1..field5)', () => {
    const feed = { created_at: '2026-10-08T12:00:00Z', entry_id: 7, field1: '30.1', field2: '55', field3: '31', field4: '29', field5: '30.2' };
    expect(mapearFeed(feed)).toEqual({
      temperatura: '30.1', umidade: '55', maxima: '31', minima: '29', media: '30.2',
      medidoEm: '2026-10-08T12:00:00Z', entryId: 7,
    });
  });
});

describe('previsao', () => {
  test('condicao ideal com mercado neutro da nota alta', () => {
    expect(pontuarDia({ temp: 25, umid: 65, fatorMercado: 1 })).toBeGreaterThanOrEqual(90);
  });
  test('muito quente derruba a nota', () => {
    expect(pontuarDia({ temp: 38, umid: 65, fatorMercado: 1 })).toBeLessThan(60);
  });
  test('classificacao', () => {
    expect(classificar(85)).toBe('Janela ideal');
    expect(classificar(65)).toBe('Condições boas');
    expect(classificar(30)).toBe('Aguardar');
  });
});

describe('historico: insights', () => {
  test('aponta dias fora da faixa de temperatura', () => {
    const i = gerarInsights([30, 33, 34, 31], VARIAVEIS.temperatura, 'todos');
    expect(i).toHaveLength(3);
    expect(i[2].tone).toBe('crit');
    expect(i[2].text).toContain('2 dias');
  });
});

describe('estado do dispositivo', () => {
  const agora = new Date('2026-10-08T15:00:00Z');
  const base = { faixaTemp: { min: 22, max: 32 } };
  test('ok / warn / down', () => {
    const recente = new Date(agora - 30 * 1000);
    expect(calcularEstado({ ...base, ultimaLeitura: { temperatura: 28, umidade: 65, em: recente } }, agora).state).toBe('ok');
    expect(calcularEstado({ ...base, ultimaLeitura: { temperatura: 35, umidade: 65, em: recente } }, agora).state).toBe('warn');
    expect(calcularEstado({ ...base, ultimaLeitura: { temperatura: 28, umidade: 30, em: recente } }, agora).state).toBe('warn');
    expect(calcularEstado({ ...base, ultimaLeitura: { temperatura: 28, umidade: 65, em: new Date(agora - 3600 * 1000) } }, agora).state).toBe('down');
    expect(calcularEstado({ ...base, ultimaLeitura: {} }, agora).state).toBe('down');
  });
});

describe('simulador e utils', () => {
  test('simulador faz a tarde mais quente que a madrugada', () => {
    const disp = { simulacao: { baseTemp: 28, baseUmid: 65 } };
    const tarde = valorSimulado(disp, new Date('2026-10-08T18:00:00Z'), false); // 15h em Recife
    const madrugada = valorSimulado(disp, new Date('2026-10-08T06:00:00Z'), false); // 03h
    expect(tarde.temperatura).toBeGreaterThan(madrugada.temperatura);
    expect(tarde.umidade).toBeLessThan(madrugada.umidade);
  });

  test('datas no fuso de Recife', () => {
    expect(chaveDia(new Date('2026-10-08T02:00:00Z'))).toBe('2026-10-07'); // 23h do dia anterior em Recife
    const agora = new Date('2026-10-08T15:00:00Z');
    expect(rotuloTempo(new Date('2026-10-08T12:12:00Z'), agora)).toBe('09:12');
    expect(rotuloTempo(new Date('2026-10-07T15:00:00Z'), agora)).toBe('ontem');
  });

  test('conversoes', () => {
    expect(arredondar(1.26)).toBe(1.3);
    expect(paraNumero('')).toBeNull();
    expect(paraNumero('4.5')).toBe(4.5);
  });
});
