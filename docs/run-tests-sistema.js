#!/usr/bin/env node

/**
 * Executor simplificado apenas para TESTES DE SISTEMA
 * Node.js pode rodar diretamente sem browser
 */

const fs = require('fs');
const path = require('path');

// Setup minimal
global.document = {
  getElementById(id) { return null; },
  createElement(tag) { return { id: null, className: '', textContent: '', style: {}, remove() {} }; },
  body: { appendChild() {} }
};

global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

// Carregar utils.js
const utilsCode = fs.readFileSync('utils.js', 'utf8');
eval(utilsCode);

// Carregar teste-sistema.js  
const sistemaCode = fs.readFileSync('teste-sistema.js', 'utf8');
eval(sistemaCode);

// Executar testes
console.log('\n' + '='.repeat(70));
console.log('🧪 EXECUTANDO TESTES DE SISTEMA');
console.log('='.repeat(70) + '\n');

executarTodosTestes();

// Salvar JSON
const resultado = {
  sistema: {
    executados: TESTES.executados,
    passou: TESTES.passou,
    falhou: TESTES.falhou,
    taxa: ((TESTES.passou / TESTES.executados) * 100).toFixed(1),
    testes: TESTES.resultados,
    erros: TESTES.resultados.filter(t => !t.condicao)
  }
};

fs.writeFileSync('resultado-sistema.json', JSON.stringify(resultado, null, 2));
console.log('\n✅ Resultado salvo em: resultado-sistema.json');
