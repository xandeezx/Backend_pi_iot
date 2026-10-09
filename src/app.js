const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const rotas = require('./routes');
const { naoEncontrado, tratarErros } = require('./middlewares/erro');

// Cria o app Express. Fica separado do server.js para os testes importarem sem abrir porta.
const app = express();

// Atras de proxy (Render, Railway...) o IP real vem no header; precisamos disso para o rate limit
if (env.producao) app.set('trust proxy', 1);

app.use(helmet()); // headers de seguranca
app.use(cors({ origin: env.frontUrl }));
app.use(express.json({ limit: '100kb' }));
if (!env.teste) app.use(morgan('dev'));

app.use('/api', rotas);
app.use(naoEncontrado);
app.use(tratarErros);

module.exports = app;
