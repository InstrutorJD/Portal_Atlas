#!/usr/bin/env node

/**
 * =============================================
 * EXECUTOR DE TESTES DE BD - Node.js
 * Portal Atlas - Testes de Banco de Dados
 * =============================================
 */

const fs = require('fs');
const path = require('path');

// =============================================
// SETUP: Simular ambiente do browser
// =============================================

// Mock de document
global.document = {
  getElementById(id) {
    return global._mockElements[id] || null;
  },
  createElement(tag) {
    const elem = { 
      id: null, 
      className: '', 
      textContent: '', 
      style: {}, 
      remove() { delete global._mockElements[this.id]; } 
    };
    return elem;
  },
  body: {
    appendChild(elem) {
      if (elem.id) {
        global._mockElements[elem.id] = elem;
      }
    }
  }
};

global._mockElements = {};

global.window = {
  VITE_SUPABASE_URL: 'https://cmtszlqotkexoxxhjftk.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_6CSIytivWiqL37QXz7lYzQ_rwZom6Vi',
  SUPABASE_ENABLED: false,
  SUPABASE_URL: 'https://cmtszlqotkexoxxhjftk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_6CSIytivWiqL37QXz7lYzQ_rwZom6Vi',
  supabaseClient: null
};

// Make window accessible directly
global.SUPABASE_ENABLED = global.window.SUPABASE_ENABLED;
global.SUPABASE_URL = global.window.SUPABASE_URL;
global.SUPABASE_KEY = global.window.SUPABASE_KEY;
global.supabaseClient = global.window.supabaseClient;

global.localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = String(value);
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Mock do objeto _DB
global._DB = {
  usuarios: [
    { id: '1', email: 'aluno@example.com', user_type: 'aluno', nome: 'Aluno Teste' },
    { id: '2', email: 'prof@example.com', user_type: 'professor', nome: 'Professor Teste' },
    { id: '3', email: 'coord@example.com', user_type: 'coordenador', nome: 'Coordenador Teste' }
  ],
  tutoria: [],
  eletivas: [
    { id: '1', nome: 'Eletiva 1', vagas: 5, ano_letivo: 2026 },
    { id: '2', nome: 'Eletiva 2', vagas: 3, ano_letivo: 2026 }
  ],
  clubes: []
};

// =============================================
// COLECTOR DE RESULTADOS
// =============================================

const resultados = {
  bd: { executados: 0, passou: 0, falhou: 0, testes: [] },
  total: { executados: 0, passou: 0, falhou: 0 }
};

// =============================================
// FUNÇÕES PARA CAPTURAR OUTPUT
// =============================================

let logAtual = [];
let grupoAtual = null;

const consoleOriginal = {
  log: console.log,
  group: console.group,
  groupEnd: console.groupEnd,
  error: console.error,
  warn: console.warn
};

console.log = function(...args) {
  const msg = args.join(' ');
  logAtual.push(msg);
  consoleOriginal.log(...args);
};

console.group = function(label) {
  grupoAtual = label;
  consoleOriginal.group(label);
};

console.groupEnd = function() {
  grupoAtual = null;
  consoleOriginal.groupEnd();
};

console.warn = function(...args) {
  consoleOriginal.warn(...args);
};

// =============================================
// CARREGAR E INJETAR CÓDIGO
// =============================================

function carregarArquivo(nomeArquivo) {
  const caminhoArquivo = path.join(__dirname, nomeArquivo);
  if (!fs.existsSync(caminhoArquivo)) {
    consoleOriginal.error(`❌ Arquivo não encontrado: ${caminhoArquivo}`);
    return '';
  }
  return fs.readFileSync(caminhoArquivo, 'utf8');
}

function injetarCodigo(codigo, descricao) {
  try {
    consoleOriginal.log(`\n📥 Injetando: ${descricao}...`);
    eval(codigo);
    consoleOriginal.log(`✅ ${descricao} carregado com sucesso\n`);
    return true;
  } catch (erro) {
    consoleOriginal.error(`❌ Erro ao injetar ${descricao}:`, erro.message);
    return false;
  }
}

// =============================================
// CARREGAR DEPENDÊNCIAS
// =============================================

consoleOriginal.log('\n' + '='.repeat(70));
consoleOriginal.log('🚀 INICIANDO EXECUTOR DE TESTES DE BANCO DE DADOS');
consoleOriginal.log('='.repeat(70) + '\n');

// Carregar utils.js
const utilsCode = carregarArquivo('utils.js');
injetarCodigo(utilsCode, 'utils.js');

// Carregar banco.sql como string para testes de segurança
const bancoSQLContent = carregarArquivo('banco.sql');
global.banco_sql = bancoSQLContent;
consoleOriginal.log('📥 Injetando: banco.sql...');
consoleOriginal.log('✅ banco.sql carregado com sucesso\n');

// Carregar supabase.js
const supabaseCode = carregarArquivo('supabase.js');
injetarCodigo(supabaseCode, 'supabase.js');

// Copiar funções de window para o escopo global
consoleOriginal.log('🔍 Copiando funções para o escopo global...');
const funcoes = [
  'login', 'logout', 'getSessao', 'getPerfil', 'getConfigs', 
  'getTutores', 'getVinculoTutoria', 'getEletivas', 'getMatriculaEletiva',
  'getClubbinhos', 'getMembroClubinho', 'contarAlunosPorTutor',
  'contarMatriculasPorEletiva', 'contarMembrosPorClubinho',
  'criarColaborador', 'submitEletiva', 'salvarConfig',
  'buscarPerfilNoBanco', 'getTodosColaboradores', 
  'redirecionarPorPerfil', 'escolherTutor', 'criarClubinho',
  'entrarClubinho', 'matricularEletiva'
];

funcoes.forEach(func => {
  if (typeof window[func] !== 'undefined') {
    global[func] = window[func];
    consoleOriginal.log(`  ✅ ${func}: ${typeof global[func]}`);
  }
});

// Copiar globais importantes
global.banco_sql = global.banco_sql || bancoSQLContent;
global.SUPABASE_ENABLED = window.SUPABASE_ENABLED;
global.SUPABASE_URL = window.SUPABASE_URL;
global.SUPABASE_KEY = window.SUPABASE_KEY;
global.supabaseClient = window.supabaseClient;
global._DB = window._DB || global._DB;

// Também copiar _DB para window para garantir que os testes vejam
if (typeof global._DB !== 'undefined') {
  window._DB = global._DB;
}

consoleOriginal.log('');

// =============================================
// EXECUTAR TESTES DE BD
// =============================================

consoleOriginal.log('\n' + '='.repeat(70));
consoleOriginal.log('🗄️  EXECUTANDO TESTES DE BANCO DE DADOS (12 testes)');
consoleOriginal.log('='.repeat(70) + '\n');

try {
  const bdCode = carregarArquivo('teste-banco-dados.js');
  
  // DEBUG: Verificar _DB
  consoleOriginal.log('\n🔍 DEBUG _DB:');
  consoleOriginal.log('  - global._DB existe:', typeof global._DB !== 'undefined');
  consoleOriginal.log('  - window._DB existe:', typeof window._DB !== 'undefined');
  if (typeof window._DB !== 'undefined') {
    consoleOriginal.log('  - window._DB.usuarios:', Array.isArray(window._DB.usuarios));
    consoleOriginal.log('  - window._DB.eletivas:', Array.isArray(window._DB.eletivas));
    consoleOriginal.log('  - window._DB.clubinhos:', Array.isArray(window._DB.clubinhos));
  }
  consoleOriginal.log('');
  
  // Injetar e executar
  eval(bdCode);
  
  // Executar todos os testes de BD
  if (typeof executarTodosTestes_BD === 'function') {
    executarTodosTestes_BD();
  } else {
    consoleOriginal.error('❌ Função executarTodosTestes_BD não encontrada!');
  }
  
  // Capturar resultados
  if (typeof TESTES_BD !== 'undefined') {
    resultados.bd = {
      executados: TESTES_BD.executados,
      passou: TESTES_BD.passou,
      falhou: TESTES_BD.falhou,
      testes: TESTES_BD.resultados || [],
      erros: TESTES_BD.detalhes_erros || []
    };
  }
} catch (erro) {
  consoleOriginal.error('❌ Erro ao executar testes de BD:', erro.message);
  consoleOriginal.error(erro.stack);
}

// =============================================
// COMPILAR RESULTADOS
// =============================================

resultados.total = {
  executados: resultados.bd.executados,
  passou: resultados.bd.passou,
  falhou: resultados.bd.falhou
};

// =============================================
// IMPRIMIR RESUMO
// =============================================

console.log('\n' + '='.repeat(70));
console.log('📊 RESUMO DOS TESTES DE BANCO DE DADOS');
console.log('='.repeat(70) + '\n');

console.log(`✅ Testes que passaram: ${resultados.bd.passou}`);
console.log(`❌ Testes que falharam: ${resultados.bd.falhou}`);
console.log(`📋 Total executado: ${resultados.bd.executados}`);

const taxa = resultados.bd.executados > 0 
  ? ((resultados.bd.passou / resultados.bd.executados) * 100).toFixed(1)
  : 0;
console.log(`📈 Taxa de sucesso: ${taxa}%`);

// =============================================
// SALVAR RESULTADOS
// =============================================

const nomeArquivo = 'resultados-testes-bd.json';
fs.writeFileSync(nomeArquivo, JSON.stringify(resultados, null, 2), 'utf8');
console.log(`\n📁 Resultados salvos em: ${nomeArquivo}`);

console.log('\n' + '='.repeat(70));
console.log('✅ TESTES CONCLUÍDOS');
console.log('='.repeat(70));
