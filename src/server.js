const app = require('./app');
const env = require('./config/env');
const { conectarBanco } = require('./config/db');
const Usuario = require('./models/Usuario');
const { iniciarAgendador } = require('./jobs/agendador');

// Primeiro acesso: se nao existe nenhum usuario, cria o admin definido no .env
async function garantirAdmin() {
  if (await Usuario.exists({})) return;
  await Usuario.create({
    nome: 'Administrador',
    email: env.admin.email,
    perfil: 'admin',
    senhaHash: await Usuario.gerarHash(env.admin.senha),
  });
  console.log(`[setup] usuario admin criado: ${env.admin.email} (troque a senha!)`);
}

async function iniciar() {
  await conectarBanco();
  await garantirAdmin();
  app.listen(env.porta, () => console.log(`[api] rodando em http://localhost:${env.porta}/api`));
  iniciarAgendador();
}

iniciar().catch((erro) => {
  console.error('Falha ao iniciar:', erro.message);
  process.exit(1);
});
