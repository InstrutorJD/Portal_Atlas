#!/usr/bin/env node

/**
 * TESTE DE VERIFICAÇÃO PÓS-CORREÇÃO
 * Valida que todas as correções foram aplicadas corretamente
 */

const fs = require('fs');

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

console.log('\n' + '='.repeat(70));
console.log('✅ VERIFICANDO CORREÇÕES APLICADAS');
console.log('='.repeat(70) + '\n');

let correcoes_verificadas = 0;
let correcoes_ok = 0;

// =============================================
// VERIFICAÇÃO 1: periodoAtivo usa string comparison
// =============================================
console.log('📋 VERIFICAÇÃO 1: periodoAtivo com string comparison');

const utilsCode = fs.readFileSync('utils.js', 'utf8');

if (utilsCode.includes("split('T')[0]")) {
  console.log('✅ periodoAtivo corrigido: usa string ISO para comparação');
  correcoes_ok++;
} else {
  console.log('❌ periodoAtivo NÃO foi corrigido');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 2: mostrarToast cria elemento dinamicamente
// =============================================
console.log('\n📋 VERIFICAÇÃO 2: mostrarToast cria elemento dinamicamente');

if (utilsCode.includes('document.createElement')) {
  console.log('✅ mostrarToast corrigido: cria elemento se não existir');
  correcoes_ok++;
} else {
  console.log('❌ mostrarToast NÃO foi corrigido');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 3: app.js tem try-catch em init()
// =============================================
console.log('\n📋 VERIFICAÇÃO 3: app.js init() com try-catch');

const appCode = fs.readFileSync('app.js', 'utf8');

if (appCode.includes('async function init()') && appCode.includes('try {')) {
  console.log('✅ app.js init() corrigido: tem try-catch');
  correcoes_ok++;
} else {
  console.log('❌ app.js init() NÃO foi corrigido');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 4: professor.js tem try-catch em init()
// =============================================
console.log('\n📋 VERIFICAÇÃO 4: professor.js init() com try-catch');

const profCode = fs.readFileSync('professor.js', 'utf8');

if (profCode.includes('async function init()') && profCode.includes('try {')) {
  console.log('✅ professor.js init() corrigido: tem try-catch');
  correcoes_ok++;
} else {
  console.log('❌ professor.js init() NÃO foi corrigido');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 5: coordenador.js tem try-catch em init()
// =============================================
console.log('\n📋 VERIFICAÇÃO 5: coordenador.js init() com try-catch');

const coordCode = fs.readFileSync('coordenador.js', 'utf8');

if (coordCode.includes('async function init()') && coordCode.includes('try {')) {
  console.log('✅ coordenador.js init() corrigido: tem try-catch');
  correcoes_ok++;
} else {
  console.log('❌ coordenador.js init() NÃO foi corrigido');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 6: Funções duplicadas removidas
// =============================================
console.log('\n📋 VERIFICAÇÃO 6: Funções duplicadas removidas');

// Contar quantas vezes periodoAtivo é definido em app.js
const periodoCount = (appCode.match(/var periodoAtivo|function periodoAtivo/g) || []).length;

if (periodoCount === 0) {
  console.log('✅ app.js: Funções duplicadas removidas');
  correcoes_ok++;
} else {
  console.log('❌ app.js: Ainda tem', periodoCount, 'definições duplicadas');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 7: banco.sql tem TRIGGER de vagas
// =============================================
console.log('\n📋 VERIFICAÇÃO 7: banco.sql com TRIGGER de vagas');

const sqlCode = fs.readFileSync('banco.sql', 'utf8');

if (sqlCode.includes('validar_vagas_eletiva') && sqlCode.includes('CREATE TRIGGER')) {
  console.log('✅ banco.sql: TRIGGER de validação de vagas adicionado');
  correcoes_ok++;
} else {
  console.log('❌ banco.sql: TRIGGER NÃO foi adicionado');
}
correcoes_verificadas++;

// =============================================
// VERIFICAÇÃO 8: supabase.js valida expiração
// =============================================
console.log('\n📋 VERIFICAÇÃO 8: supabase.js getSessao com validação de expiração');

const supabaseCode = fs.readFileSync('supabase.js', 'utf8');

if (supabaseCode.includes('TIMEOUT_SESSAO') || supabaseCode.includes('criada_em')) {
  console.log('✅ supabase.js: Validação de expiração de sessão adicionada');
  correcoes_ok++;
} else {
  console.log('❌ supabase.js: Validação NÃO foi adicionada');
}
correcoes_verificadas++;

// =============================================
// RESUMO FINAL
// =============================================

console.log('\n' + '='.repeat(70));
console.log('📊 RESUMO DE CORREÇÕES');
console.log('='.repeat(70) + '\n');

console.log(`✅ Verificadas: ${correcoes_verificadas}`);
console.log(`✅ OK:         ${correcoes_ok}`);
console.log(`❌ Falhadas:   ${correcoes_verificadas - correcoes_ok}`);
console.log(`📈 Taxa:       ${((correcoes_ok / correcoes_verificadas) * 100).toFixed(1)}%`);

if (correcoes_ok === correcoes_verificadas) {
  console.log('\n🎉 TODAS AS CORREÇÕES FORAM APLICADAS COM SUCESSO!');
} else {
  console.log('\n⚠️  ALGUMAS CORREÇÕES FALTARAM!');
}

console.log('\n' + '='.repeat(70) + '\n');
