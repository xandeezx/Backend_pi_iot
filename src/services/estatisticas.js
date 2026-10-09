// Funcoes matematicas puras (sem banco) - faceis de testar.

const soma = (arr) => arr.reduce((s, v) => s + v, 0);
const media = (arr) => (arr.length ? soma(arr) / arr.length : null);
const minimo = (arr) => (arr.length ? Math.min(...arr) : null);
const maximo = (arr) => (arr.length ? Math.max(...arr) : null);

// Regressao linear simples (minimos quadrados): y = a + b*x, com x = 0,1,2...
function regressaoLinear(ys) {
  const n = ys.length;
  if (n < 2) return { a: ys[0] ?? 0, b: 0 };
  const xs = ys.map((_, i) => i);
  const mx = media(xs);
  const my = media(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

// Compara a 1a e a 2a metade da serie. 'tolerancia' evita chamar de "alta" uma oscilacao pequena.
function tendencia(vals, tolerancia) {
  if (vals.length < 2) return 'estável';
  const metade = Math.floor(vals.length / 2);
  const diff = media(vals.slice(metade)) - media(vals.slice(0, metade));
  if (diff > tolerancia) return 'em alta';
  if (diff < -tolerancia) return 'em queda';
  return 'estável';
}

module.exports = { soma, media, minimo, maximo, regressaoLinear, tendencia };
