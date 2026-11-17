#!/usr/bin/env node

/**
 * =============================================
 * EXECUTOR DE TESTES - Node.js
 * Portal Atlas - Testes de Sistema e BD
 * =============================================
 * 
 * Executa todos os 22 testes:
 * - 10 testes de lógica (teste-sistema.js)
 * - 12 testes de BD (teste-banco-dados.js)
 * 
 * Uso: node run-tests.js
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
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_6CSIytivWiqL37QXz7lYzQ_rwZom6Vi'
};

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

// Mock de Supabase (modo offline)
global.SUPABASE_ENABLED = false;
global.SUPABASE_URL = global.window.VITE_SUPABASE_URL;
global.SUPABASE_KEY = global.window.VITE_SUPABASE_ANON_KEY;
global.supabaseClient = null;

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
  sistema: { executados: 0, passou: 0, falhou: 0, testes: [] },
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
  error: console.error
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

// =============================================
// CARREGAR E INJETAR CÓDIGO
// =============================================

function carregarArquivo(nomeArquivo) {
  const caminhoArquivo = path.join(__dirname, nomeArquivo);
  if (!fs.existsSync(caminhoArquivo)) {
    console.error(`❌ Arquivo não encontrado: ${caminhoArquivo}`);
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
consoleOriginal.log('🚀 INICIANDO EXECUTOR DE TESTES');
consoleOriginal.log('='.repeat(70) + '\n');

// Carregar utils.js
const utilsCode = carregarArquivo('utils.js');
injetarCodigo(utilsCode, 'utils.js');

// Carregar supabase.js
const supabaseCode = carregarArquivo('supabase.js');
injetarCodigo(supabaseCode, 'supabase.js');

// =============================================
// EXECUTAR TESTES DE SISTEMA
// =============================================

consoleOriginal.log('\n' + '='.repeat(70));
consoleOriginal.log('🧪 EXECUTANDO TESTES DE SISTEMA (10 testes)');
consoleOriginal.log('='.repeat(70) + '\n');

try {
  const sistemaCode = carregarArquivo('teste-sistema.js');
  
  // Injetar e executar
  eval(sistemaCode);
  
  // Executar todos os testes de sistema
  if (typeof executarTodosTestes === 'function') {
    executarTodosTestes();
  }
  
  // Capturar resultados
  if (typeof TESTES !== 'undefined') {
    resultados.sistema = {
      executados: TESTES.executados,
      passou: TESTES.passou,
      falhou: TESTES.falhou,
      testes: TESTES.resultados || [],
      erros: TESTES.detalhes_erros || []
    };
  }
} catch (erro) {
  consoleOriginal.error('❌ Erro ao executar testes de sistema:', erro.message);
  consoleOriginal.error(erro.stack);
}

// =============================================
// EXECUTAR TESTES DE BD
// =============================================

consoleOriginal.log('\n' + '='.repeat(70));
consoleOriginal.log('🗄️  EXECUTANDO TESTES DE BANCO DE DADOS (12 testes)');
consoleOriginal.log('='.repeat(70) + '\n');

try {
  const bdCode = carregarArquivo('teste-banco-dados.js');
  
  // Limpar contexto anterior
  if (typeof TESTES !== 'undefined') {
    delete global.TESTES;
  }
  
  // Injetar e executar
  eval(bdCode);
  
  // Executar todos os testes de BD
  if (typeof executarTodosTestes_BD === 'function') {
    executarTodosTestes_BD();
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
  executados: resultados.sistema.executados + resultados.bd.executados,
  passou: resultados.sistema.passou + resultados.bd.passou,
  falhou: resultados.sistema.falhou + resultados.bd.falhou
};

// =============================================
// EXIBIR RESUMO
// =============================================

consoleOriginal.log('\n' + '='.repeat(70));
consoleOriginal.log('📊 RESUMO DOS TESTES');
consoleOriginal.log('='.repeat(70) + '\n');

function exibirResumo() {
  const { sistema, bd, total } = resultados;
  
  const taxaSistema = sistema.executados > 0 
    ? ((sistema.passou / sistema.executados) * 100).toFixed(1)
    : 0;
  
  const taxaBD = bd.executados > 0 
    ? ((bd.passou / bd.executados) * 100).toFixed(1)
    : 0;
  
  const taxaTotal = total.executados > 0 
    ? ((total.passou / total.executados) * 100).toFixed(1)
    : 0;
  
  consoleOriginal.log(`
┌─────────────────────────────────────────────────────────────┐
│              TESTES DE SISTEMA (10 TESTES)                  │
├─────────────────────────────────────────────────────────────┤
│ Total:     ${sistema.executados.toString().padStart(3, ' ')} testes                           │
│ ✅ Passou: ${sistema.passou.toString().padStart(3, ' ')} testes                           │
│ ❌ Falhou: ${sistema.falhou.toString().padStart(3, ' ')} testes                           │
│ Taxa:      ${taxaSistema}%                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           TESTES DE BANCO DE DADOS (12 TESTES)              │
├─────────────────────────────────────────────────────────────┤
│ Total:     ${bd.executados.toString().padStart(3, ' ')} testes                           │
│ ✅ Passou: ${bd.passou.toString().padStart(3, ' ')} testes                           │
│ ❌ Falhou: ${bd.falhou.toString().padStart(3, ' ')} testes                           │
│ Taxa:      ${taxaBD}%                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   RESUMO TOTAL (22 TESTES)                  │
├─────────────────────────────────────────────────────────────┤
│ Total:     ${total.executados.toString().padStart(3, ' ')} testes                           │
│ ✅ Passou: ${total.passou.toString().padStart(3, ' ')} testes                           │
│ ❌ Falhou: ${total.falhou.toString().padStart(3, ' ')} testes                           │
│ Taxa:      ${taxaTotal}%                              │
└─────────────────────────────────────────────────────────────┘
  `);
}

exibirResumo();

// =============================================
// SALVAR RESULTADOS EM ARQUIVO JSON
// =============================================

const nomeArquivoResultados = 'resultados-testes.json';
const caminhoResultados = path.join(__dirname, nomeArquivoResultados);

fs.writeFileSync(caminhoResultados, JSON.stringify(resultados, null, 2), 'utf8');
consoleOriginal.log(`\n📁 Resultados salvos em: ${nomeArquivoResultados}`);

// =============================================
// GERAR RELATÓRIO DETALHADO
// =============================================

const nomeArquivoRelatorio = 'relatorio-testes.txt';
const caminhoRelatorio = path.join(__dirname, nomeArquivoRelatorio);

let relatorio = `
╔═══════════════════════════════════════════════════════════╗
║           RELATÓRIO COMPLETO DE TESTES                   ║
║          Portal Atlas - ${new Date().toLocaleDateString('pt-BR')}            ║
╚═══════════════════════════════════════════════════════════╝

RESUMO GERAL
═══════════════════════════════════════════════════════════

Total de Testes:  ${resultados.total.executados}
✅ Passou:        ${resultados.sistema.passou + resultados.bd.passou}
❌ Falhou:        ${resultados.sistema.falhou + resultados.bd.falhou}
Taxa de Sucesso:  ${((resultados.total.passou / resultados.total.executados) * 100).toFixed(1)}%

TESTES DE SISTEMA (10 testes)
═══════════════════════════════════════════════════════════

${resultados.sistema.testes.map((teste, idx) => 
  `${idx + 1}. [${teste.condicao ? '✅' : '❌'}] ${teste.mensagem} (${teste.severidade})`
).join('\n')}

TESTES DE BD (12 testes)
═══════════════════════════════════════════════════════════

${resultados.bd.testes.map((teste, idx) => 
  `${idx + 1}. [${teste.condicao ? '✅' : '❌'}] ${teste.mensagem} (${teste.severidade})`
).join('\n')}

FALHAS CRÍTICAS
═══════════════════════════════════════════════════════════

${([...resultados.sistema.erros || [], ...resultados.bd.erros || []]
  .filter(e => e.severidade === 'CRÍTICA')
  .map(e => `• ${e.mensagem}\n  ${e.detalhes}`)
  .join('\n')) || 'Nenhuma falha crítica detectada'}

FALHAS ALTAS
═══════════════════════════════════════════════════════════

${([...resultados.sistema.erros || [], ...resultados.bd.erros || []]
  .filter(e => e.severidade === 'ALTA')
  .map(e => `• ${e.mensagem}\n  ${e.detalhes}`)
  .join('\n')) || 'Nenhuma falha alta detectada'}

FALHAS MÉDIAS
═══════════════════════════════════════════════════════════

${([...resultados.sistema.erros || [], ...resultados.bd.erros || []]
  .filter(e => e.severidade === 'MÉDIA')
  .map(e => `• ${e.mensagem}\n  ${e.detalhes}`)
  .join('\n')) || 'Nenhuma falha média detectada'}

═══════════════════════════════════════════════════════════
Gerado em: ${new Date().toLocaleString('pt-BR')}
`;

fs.writeFileSync(caminhoRelatorio, relatorio, 'utf8');
consoleOriginal.log(`📄 Relatório salvo em: ${nomeArquivoRelatorio}\n`);

consoleOriginal.log('='.repeat(70));
consoleOriginal.log('✅ TESTES CONCLUÍDOS');
consoleOriginal.log('='.repeat(70) + '\n');

function getNomeTeste(i) {
  const nomes = [
    'conexaoSupabase',
    'funcaoLogin',
    'funcaoPerfil',
    'funcaoConfigs',
    'tratamentoErros',
    'funcoesContagem',
    'operacoesEscrita',
    'consultasRelacionadas',
    'seguranca',
    'performance',
    'integridadeDados',
    'fallbackMock'
  ];
  return nomes[i - 1] || 'teste' + i;
}
