#!/usr/bin/env node
// =============================================
// Gera assets/imagens/indice.json com a lista das imagens de questões.
// O navegador não consegue listar pastas; o simulador lê este índice para saber
// quais questões com "(tem imagem)" podem ser exibidas.
//
// Uso: node dados/ferramentas/gerar-indice-imagens.js
// Rode sempre que adicionar ou remover imagens em assets/imagens/.
// Padrão de nome: AAAA-questao-NN.png, ou AAAA-questao-NN-ingles.png / -espanhol.png
// para as questões de língua estrangeira.
// =============================================

const fs = require("fs");
const path = require("path");

const IMAGES_DIR = path.join(__dirname, "..", "..", "assets", "imagens");
const VALID_NAME = /^\d{4}-questao-\d{2,3}(?:-ingles|-espanhol)?\.png$/;

const files = fs.readdirSync(IMAGES_DIR).filter((name) => name.endsWith(".png")).sort();
const invalid = files.filter((name) => !VALID_NAME.test(name));
const valid = files.filter((name) => VALID_NAME.test(name));

invalid.forEach((name) => console.warn(`ATENÇÃO: nome fora do padrão, ignorado: ${name}`));
fs.writeFileSync(path.join(IMAGES_DIR, "indice.json"), `${JSON.stringify(valid, null, "\t")}\n`);
console.log(`assets/imagens/indice.json: ${valid.length} imagens`);
