const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const LogAcesso = require('../models/LogAcesso');
const { autenticar, permitir } = require('../middlewares/auth');
const { limitar, ErroApp } = require('../utils');

router.use(autenticar);

// GET /api/relatorios/seguranca?dias=7  (admin) - acessos e incidentes (RF11)
router.get('/seguranca', permitir('admin'), async (req, res) => {
  const dias = limitar(parseInt(req.query.dias, 10) || 7, 1, 90);
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);

  const porTipo = await LogAcesso.aggregate([
    { $match: { em: { $gte: desde } } },
    { $group: { _id: '$tipo', total: { $sum: 1 } } },
  ]);
  const totais = { login_ok: 0, login_falha: 0, token_invalido: 0, acesso_negado: 0 };
  for (const l of porTipo) totais[l._id] = l.total;

  // IPs com mais tentativas de login que falharam
  const porIp = await LogAcesso.aggregate([
    { $match: { em: { $gte: desde }, tipo: 'login_falha' } },
    { $group: { _id: '$ip', tentativas: { $sum: 1 } } },
    { $sort: { tentativas: -1 } },
    { $limit: 5 },
  ]);

  const incidentes = await LogAcesso.find({ em: { $gte: desde }, tipo: { $ne: 'login_ok' } })
    .sort({ em: -1 })
    .limit(20)
    .select('-__v');

  res.json({
    periodoDias: dias,
    geradoEm: new Date(),
    totais,
    ipsComMaisFalhas: porIp.map((i) => ({ ip: i._id, tentativas: i.tentativas })),
    incidentesRecentes: incidentes,
  });
});

// GET /api/relatorios/qualidade  (admin/analista) - resultado dos testes automatizados (RF11)
// O arquivo e gerado por: npm run test:report
router.get('/qualidade', permitir('admin', 'analista'), async (_req, res) => {
  const arquivo = path.join(__dirname, '..', '..', 'reports', 'test-results.json');
  if (!fs.existsSync(arquivo)) {
    throw new ErroApp(404, 'Relatorio ainda nao gerado. Rode "npm run test:report" no backend.');
  }
  const r = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  res.json({
    geradoEm: new Date(r.startTime),
    sucesso: r.success,
    suites: { total: r.numTotalTestSuites, aprovadas: r.numPassedTestSuites, falhas: r.numFailedTestSuites },
    testes: { total: r.numTotalTests, aprovados: r.numPassedTests, falhas: r.numFailedTests },
    arquivos: r.testResults.map((t) => ({
      arquivo: path.basename(t.name),
      status: t.status,
      testes: t.assertionResults.map((a) => ({ nome: a.fullName, status: a.status })),
    })),
  });
});

module.exports = router;
