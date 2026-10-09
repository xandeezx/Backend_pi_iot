# Backend - Projeto Integrador IoT (4º módulo ADS)

API do **Dashboard de Monitoramento Climático e Logístico para Exportadoras de Frutas** (Petrolina/Juazeiro).
Recebe os dados do ESP32 através do ThingSpeak, guarda tudo no MongoDB, gera alertas e entrega os dados prontos para o front (Next.js).

```
ESP32 + DHT11 --MQTT--> ThingSpeak (canal) <--REST (channel feeds)-- Backend Node/Express --> MongoDB
                                                                          |
                                                                          +--> API REST (JWT) --> Front Next.js
```

O backend **não recebe dados direto do ESP32**: ele consulta o canal do ThingSpeak a cada ~20 s (RF02), como pede o documento de requisitos.

## Stack

Node.js 18+ · Express 5 · MongoDB + Mongoose · JWT + bcrypt · Helmet/CORS/rate-limit · Jest + Supertest

## Como rodar

1. Instale as dependências e crie o `.env`:
   ```bash
   npm install
   cp .env.example .env      # no Windows: copy .env.example .env
   ```
2. Tenha um MongoDB: local (`mongodb://127.0.0.1:27017/pi_iot`) ou um cluster grátis do **MongoDB Atlas**. Coloque a URL em `MONGO_URI`.
3. Troque o `JWT_SECRET` por um valor grande e aleatório:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Popule o banco (usuários, 7 dispositivos, 30 dias de histórico simulado e preços de mercado):
   ```bash
   npm run seed
   ```
5. Suba a API:
   ```bash
   npm run dev      # reinicia sozinho ao salvar
   npm start        # modo normal
   ```
   A API fica em `http://localhost:3333/api`. Teste: `GET /api/health`.

Usuários criados pelo seed (**só para desenvolvimento**):

| Email | Senha | Perfil |
|---|---|---|
| admin@pi.local | Admin@12345 (definida no `.env`) | admin |
| produtor@pi.local | Produtor@123 | produtor |
| analista@pi.local | Analista@123 | analista |

## Ligando o ESP32 real

1. No `.env`, preencha `THINGSPEAK_CHANNEL_ID` (e `THINGSPEAK_READ_KEY` se o canal for privado).
2. Rode `npm run seed` num banco vazio: o `ESP32-001` passa a ser lido do ThingSpeak (os outros seis continuam simulados).
   Se o banco já existe, use `PATCH /api/dispositivos/ESP32-001` com `{ "fonte": "thingspeak", "channelId": "SEU_CANAL" }` (como admin).
3. Os campos do canal seguem o código `DHT11_ThingSpeak_MQTT_MaxMinMedia.ino`:

   | Campo | Conteúdo |
   |---|---|
   | field1 | temperatura (última leitura) |
   | field2 | umidade |
   | field3 | temperatura máxima do ciclo |
   | field4 | temperatura mínima do ciclo |
   | field5 | temperatura média do ciclo |

   Se você usar o `DHT11.ino` simples (só `field1` e `field2`), funciona igual: máxima/mínima/média ficam `null`.
   Se mudar a ordem dos campos, ajuste `thingspeak.campos` em `src/config/env.js`.
4. Não esqueça: o plano gratuito do ThingSpeak aceita 1 mensagem a cada ~15 s. O backend nunca consulta mais rápido que 16 s (RNF11).

Sem hardware? Deixe `SIMULAR=true` e o simulador gera leituras para os dispositivos simulados (RNF07).

## Endpoints

Tudo sob `/api`. Exceto `/health` e `/auth/login`, exige `Authorization: Bearer <token>`.

| Método e rota | Perfis | Descrição |
|---|---|---|
| `GET /health` | público | status da API e do banco |
| `POST /auth/login` | público | `{email, senha}` → `{token, usuario}` |
| `GET /auth/me` | todos | usuário logado |
| `GET/POST /usuarios`, `PATCH/DELETE /usuarios/:id` | admin | gerenciar usuários (RF12) |
| `GET /dispositivos`, `/dispositivos/resumo`, `/dispositivos/:id` | todos | lista, contagens e detalhe |
| `POST/PATCH/DELETE /dispositivos` | admin | cadastro de dispositivos |
| `GET /leituras?dispositivo=&inicio=&fim=&limite=` | todos | leituras brutas |
| `GET /leituras/ultima?dispositivo=` | todos | última leitura |
| `POST /leituras` | admin | leitura manual (testar alertas sem o ESP32) |
| `POST /leituras/sincronizar` | admin | força consulta ao ThingSpeak |
| `GET /visao-geral` | todos | dados da tela Visão Geral |
| `GET /historico?periodo=7\|30\|safra&variavel=temperatura\|umidade&dispositivo=todos` | todos | histórico diário (RF10) |
| `GET /previsao?dispositivo=&produto=` | todos | janela ideal de colheita (RF06) |
| `GET /alertas?status=abertos\|todos\|pendente...&dispositivo=` | todos | lista de alertas |
| `GET /alertas/resumo`, `POST /alertas/marcar-vistos` | todos | badges |
| `PATCH /alertas/:id` `{categoria, nota}` | produtor, admin | categoria e nota |
| `POST /alertas/:id/acao` `{acao}` | produtor, admin | `reconhecer`, `registrar`, `resolver`, `falso` |
| `GET /mercado`, `/mercado/ultimos` | todos | preços de exportação (RF03) |
| `POST /mercado` | analista, admin | cadastrar preço |
| `GET /relatorios/seguranca?dias=7` | admin | acessos e incidentes (RF11) |
| `GET /relatorios/qualidade` | admin, analista | resultado dos testes (RF11) |

O arquivo `docs/requests.http` tem exemplos prontos (extensão *REST Client* do VS Code).
Para ligar o front, veja `docs/INTEGRACAO-FRONT.md`.

## Requisitos x onde estão no código

| Requisito | Onde |
|---|---|
| RF01 / RF02 - dados do ThingSpeak via REST | `services/thingspeak.js`, `jobs/agendador.js` |
| RF03 - dados de mercado | `services/mercado.js`, `routes/mercado.js` (simulado + cadastro manual) |
| RF04 / RF10 - armazenar e manter histórico | `models/Leitura.js`, `services/historico.js` |
| RF05 - limpeza dos dados | `services/ingestao.js` (`tratarLeitura`: descarta vazio, 0/0, fora da faixa física) |
| RF06 - previsão | `services/previsao.js` (regressão linear simples + fator de mercado) |
| RF07 - dados do dashboard | `services/visaoGeral.js`, `routes/painel.js` |
| RF08 / RF12 - login e perfis | `middlewares/auth.js`, `routes/auth.js`, `routes/usuarios.js` |
| RF09 - alertas | `services/alertas.js`, `services/maquinaAlertas.js` |
| RF11 - relatórios | `routes/relatorios.js`, `models/LogAcesso.js` |
| RNF02 - chaves protegidas | chaves só no `.env` (fora do Git), a Read Key nunca sai na API |
| RNF05 - testes | `tests/` (`npm test`) |
| RNF07 - rodar sem nuvem real | simulador + MongoDB local |
| RNF09 - código modular | `routes` / `services` / `models` separados |
| RNF10 - RBAC leve | o token JWT já leva o perfil: sem consulta ao banco a cada requisição |
| RNF11 - limite do ThingSpeak | intervalo mínimo de 16 s em `config/env.js` |

## Como os alertas funcionam

- Temperatura acima de 32 °C → **Crítico** · umidade abaixo de 50% ou acima de 80% → **Atenção**.
- Dispositivo sem leitura há mais de 5 min → **Crítico** "desconectado". Ao voltar, o alerta é fechado e nasce um "reconectado".
- Previsão com pontuação ≥ 80 → **Informativo** "janela ideal" (uma vez por dia).
- O mesmo alerta (tipo + dispositivo) não se repete enquanto estiver aberto nem nos 30 min seguintes.
- Ciclo de vida: `pendente → reconhecido → tratamento → resolvido` (ou `falso`). "Registrar ação" exige categoria. Cada passo fica no `historico` do alerta (quem fez, quando).

Os limites ficam no `.env` (`TEMP_MAX`, `UMID_MIN`, `UMID_MAX`, `OFFLINE_SEG`).

## Testes

```bash
npm test               # roda tudo
npm run test:report    # gera reports/test-results.json (alimenta GET /relatorios/qualidade)
```

Os testes de integração precisam de um MongoDB. Por padrão usam o `mongodb-memory-server` (baixa um MongoDB temporário na primeira vez).
Se preferir usar o seu: `MONGO_URI_TESTE=mongodb://127.0.0.1:27017/pi_iot_teste npm test` (o banco é apagado a cada execução, **use um banco só de testes**).

## Segurança

- Senhas com bcrypt; o hash nunca aparece nas respostas.
- JWT com expiração (`JWT_EXPIRA`, padrão 8 h). Como o token não consulta o banco, um usuário desativado só perde o acesso quando o token expira.
- Helmet, CORS restrito ao `FRONT_URL`, limite de tamanho do body e limite de tentativas no login.
- Login falho, token inválido e acesso negado vão para o log de segurança.
- Em produção o servidor se recusa a iniciar sem `JWT_SECRET`.
- Criptografia em trânsito: use HTTPS no deploy e conexão `mongodb+srv` (TLS). Em repouso: o MongoDB Atlas já criptografa os discos.

## O que ficou de fora (ou depende de outras frentes)

- **Luminosidade, RSSI e uptime**: o ESP32 atual só tem DHT11. A API devolve `null` nesses campos e o front deve tratar.
- **Limpeza avançada e modelo preditivo (Python/R)**: o backend faz só o básico (RF05/RF06). O formato da `/previsao` pode ser mantido se o time de Data Science trocar o modelo.
- **RNF01 / RNF03 (escala e disponibilidade)**: dependem do deploy (ex.: Render/Railway + MongoDB Atlas). O código não guarda estado em memória, então dá para rodar mais de uma instância, mas o agendador rodaria em cada uma (ver `jobs/agendador.js`).
- **LGPD/GDPR**: guardamos só nome, email e perfil. Falta política de retenção e exclusão de dados.
- Não há recuperação de senha, refresh token nem login social.

## Estrutura

```
src/
  app.js, server.js      app Express e inicialização
  config/                variáveis de ambiente e conexão com o banco
  models/                schemas do Mongoose
  routes/                endpoints
  services/              regras de negócio (ingestão, alertas, histórico, previsão...)
  middlewares/           autenticação/RBAC e tratamento de erros
  jobs/agendador.js      tarefas periódicas
scripts/seed.js          dados iniciais
tests/                   testes unitários e de integração
docs/                    exemplos de requisições e guia de integração com o front
```
