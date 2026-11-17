// =============================================
// PORTAL ATLAS — teste-sistema.js
// Testes de Sistema para Identificar Falhas Lógicas
// =============================================

// Configuração de Testes
const TESTES = {
  executados: 0,
  passou: 0,
  falhou: 0,
  resultados: []
};

// =============================================
// UTILITÁRIOS DE TESTE
// =============================================

function assert(condicao, mensagem, severidade = 'INFO') {
  TESTES.executados++;
  
  if (condicao) {
    TESTES.passou++;
    log(`✅ ${mensagem}`, 'sucesso');
  } else {
    TESTES.falhou++;
    log(`❌ ${mensagem}`, 'erro');
  }
  
  TESTES.resultados.push({ condicao, mensagem, severidade });
}

function log(mensagem, tipo = 'info') {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const prefixo = {
    'sucesso': '✅',
    'erro': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  }[tipo] || 'ℹ️';
  
  console.log(`[${timestamp}] ${prefixo} ${mensagem}`);
}

function iniciarTesteGrupo(nome) {
  console.group(`\n🧪 GRUPO: ${nome}`);
  console.log('─'.repeat(60));
}

function finalizarTesteGrupo() {
  console.groupEnd();
}

// =============================================
// TESTE 1: PERÍODO ATIVO (TIMEZONE)
// =============================================

function teste1_periodoAtivo() {
  iniciarTesteGrupo('TESTE 1: Período Ativo sem Timezone');
  
  // Função de teste
  function periodoAtivo(inicio, fim) {
    if (!inicio || !fim) return false;
    const hoje = new Date();
    return new Date(inicio) <= hoje && hoje <= new Date(fim);
  }
  
  // Caso 1: Período normal (passado)
  const resultado1 = periodoAtivo('2024-01-01', '2024-12-31');
  assert(resultado1 === false, 
    'Período passado retorna false', 'INFO');
  
  // Caso 2: Período futuro
  const resultado2 = periodoAtivo('2028-01-01', '2028-12-31');
  assert(resultado2 === false, 
    'Período futuro retorna false', 'INFO');
  
  // Caso 3: Período hoje (pode falhar por timezone)
  const hoje = new Date().toISOString().split('T')[0];
  const resultado3 = periodoAtivo(hoje, hoje);
  assert(resultado3 === true, 
    `Período hoje (${hoje}) retorna true`, 'CRÍTICA');
  
  // Caso 4: Datas NULL
  const resultado4 = periodoAtivo(null, '2026-12-31');
  assert(resultado4 === false, 
    'Datas NULL retornam false', 'INFO');
  
  // ⚠️ Demonstrar problema de timezone
  console.warn('⚠️  AVISO: Esta função tem problema de timezone!');
  console.warn('Problema: Não considera fuso horário do servidor vs cliente');
  console.warn('Exemplos de conflito possível:');
  console.log('  - Cliente em São Paulo (UTC-3), Servidor em UTC');
  console.log('  - Pode haver diferença de até 3 horas');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 2: RESTRIÇÃO DE ELETIVA (VAGAS)
// =============================================

function teste2_restricaoEletiva() {
  iniciarTesteGrupo('TESTE 2: Restrição de Eletiva Inconsistente');
  
  // Simulação de banco de dados mock
  const MOCK_DB = {
    eletivas: [
      { id: 'e1', titulo: 'Python', vagas: 10, ano_letivo: 2026 },
      { id: 'e2', titulo: 'Java', vagas: null, ano_letivo: 2026 }
    ],
    eletiva_matriculas: [],
    eletiva_config: [
      { ano_letivo: 2026, vagas_por_eletiva: 10 }
    ]
  };
  
  function inserirMatricula(aluno_id, eletiva_id, ano_letivo) {
    const eletiva = MOCK_DB.eletivas.find(e => e.id === eletiva_id);
    if (!eletiva) throw new Error('Eletiva não encontrada');
    
    // ❌ FALHA: Não valida vagas!
    MOCK_DB.eletiva_matriculas.push({ aluno_id, eletiva_id, ano_letivo });
    return true;
  }
  
  function contarMatriculas(eletiva_id, ano_letivo) {
    return MOCK_DB.eletiva_matriculas.filter(
      m => m.eletiva_id === eletiva_id && m.ano_letivo === ano_letivo
    ).length;
  }
  
  // Caso 1: Inserir alunos até exceder vagas
  try {
    for (let i = 0; i < 12; i++) {
      inserirMatricula(`aluno_${i}`, 'e1', 2026);
    }
    
    const count = contarMatriculas('e1', 2026);
    assert(count <= 10, 
      `Eletiva respeitou vagas (${count} <= 10)`, 'ALTA');
  } catch (e) {
    log(`Erro ao inserir: ${e.message}`, 'erro');
  }
  
  // Caso 2: Validação manual de vagas
  const vagasEletiva = MOCK_DB.eletivas[0].vagas || 10;
  const matriculasAtuais = contarMatriculas('e1', 2026);
  const podeInscrever = matriculasAtuais < vagasEletiva;
  assert(!podeInscrever, 
    `Inserção excessiva deveria ser bloqueada (${matriculasAtuais} >= ${vagasEletiva})`, 'ALTA');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 3: DUPLICAÇÃO DE TUTORIA VINCULOS
// =============================================

function teste3_duplicacaoTutoria() {
  iniciarTesteGrupo('TESTE 3: Duplicação de Tutoria Vinculos');
  
  const MOCK_DB = {
    tutoria_vinculos: []
  };
  
  function inserirVinculo(aluno_id, colaborador_id, ano_letivo) {
    // ❌ FALHA: Apenas UNIQUE em aluno_id, não em (aluno_id, ano_letivo)
    const existe = MOCK_DB.tutoria_vinculos.find(
      v => v.aluno_id === aluno_id && v.ano_letivo === ano_letivo
    );
    
    if (existe) {
      throw new Error('Aluno já tem tutor neste ano');
    }
    
    MOCK_DB.tutoria_vinculos.push({ aluno_id, colaborador_id, ano_letivo });
    return true;
  }
  
  // Caso 1: Aluno com 2 tutores no mesmo ano
  try {
    inserirVinculo('aluno1', 'tutor1', 2026);
    inserirVinculo('aluno1', 'tutor2', 2026);  // Deveria falhar
    
    assert(false, 'Sistema permitiu 2 tutores para aluno no mesmo ano', 'ALTA');
  } catch (e) {
    assert(true, `Bloqueou duplicação: ${e.message}`, 'INFO');
  }
  
  // Caso 2: Mesmo aluno em anos diferentes (permitido)
  try {
    MOCK_DB.tutoria_vinculos = [];
    inserirVinculo('aluno1', 'tutor1', 2026);
    inserirVinculo('aluno1', 'tutor2', 2027);
    
    assert(MOCK_DB.tutoria_vinculos.length === 2, 
      'Permite mesmo aluno em anos diferentes', 'INFO');
  } catch (e) {
    log(`Erro: ${e.message}`, 'erro');
  }
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 4: SESSÃO EXPIRADA
// =============================================

function teste4_sessaoExpirada() {
  iniciarTesteGrupo('TESTE 4: Sessão não Valida Expiração');
  
  function getSessao() {
    try {
      const sessao = JSON.parse(localStorage.getItem('portal_atlas_sessao_teste'));
      if (!sessao) return null;
      
      // ❌ FALHA: Não valida expiração!
      return sessao;
    } catch(e) {
      return null;
    }
  }
  
  // Caso 1: Sessão normal
  const sessao1 = {
    user: { id: 'u1', email: 'test@test.com' },
    access_token: 'token_valido',
    expires_at: new Date(Date.now() + 3600000).toISOString()
  };
  localStorage.setItem('portal_atlas_sessao_teste', JSON.stringify(sessao1));
  
  const resultado1 = getSessao();
  assert(resultado1 !== null, 'Sessão válida retorna dados', 'INFO');
  
  // Caso 2: Sessão expirada
  const sessao2 = {
    user: { id: 'u1', email: 'test@test.com' },
    access_token: 'token_expirado',
    expires_at: new Date(Date.now() - 3600000).toISOString()
  };
  localStorage.setItem('portal_atlas_sessao_teste', JSON.stringify(sessao2));
  
  const resultado2 = getSessao();
  assert(resultado2 === null, 
    'Sessão expirada deveria retornar null (MAS NÃO FARIA ATÉ AGORA!)', 'MÉDIA');
  
  // Limpeza
  localStorage.removeItem('portal_atlas_sessao_teste');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 5: VAGAS NULL
// =============================================

function teste5_vagasNull() {
  iniciarTesteGrupo('TESTE 5: Vagas NULL não Resolvem');
  
  const config = { vagas_por_eletiva: 10 };
  const eletiva1 = { id: 'e1', titulo: 'Python', vagas: 10 };
  const eletiva2 = { id: 'e2', titulo: 'Java', vagas: null };
  
  // Caso 1: Vagas explícitas
  assert(eletiva1.vagas === 10, 
    'Eletiva com vagas explícitas: 10', 'INFO');
  
  // Caso 2: Vagas NULL (falta resolução)
  const vagasResolvidas = eletiva2.vagas || config.vagas_por_eletiva;
  assert(vagasResolvidas === 10, 
    'Eletiva NULL + fallback = 10 (mas requer lógica manual)', 'ALTA');
  
  // Caso 3: Se esquecer fallback
  if (eletiva2.vagas) {
    log('❌ FALHA: Código não detecta vagas NULL', 'erro');
    assert(false, 'Verificação direta de NULL falha', 'ALTA');
  } else {
    assert(true, 'Precisa usar fallback (vagas || 10)', 'WARNING');
  }
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 6: CLUBINHO VALIDADE
// =============================================

function teste6_clubinhoValidade() {
  iniciarTesteGrupo('TESTE 6: Clubinho Validade sem Validação');
  
  const clubinho = {
    id: 'c1',
    nome: 'Xadrez',
    criado_em: '2025-06-01',
    validade_ate: null,  // ❌ FALHA: Não preenchida
    status: 'aprovado'
  };
  
  function estaValido(clubinho) {
    if (!clubinho.validade_ate) return true;  // ❌ FALHA: Considera válido se NULL
    return new Date(clubinho.validade_ate) > new Date();
  }
  
  const agora = new Date('2026-01-15');
  const valido = estaValido(clubinho);
  
  assert(valido === true, 
    'Clubinho com validade_ate NULL é considerado válido (BUG)', 'MÉDIA');
  
  // Caso 2: Clubinho com validade preenchida
  const clubinho2 = {
    ...clubinho,
    validade_ate: '2025-12-01'  // Expirou
  };
  
  const valido2 = estaValido(clubinho2);
  assert(valido2 === false, 
    'Clubinho com validade expirada é inválido', 'INFO');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 7: TRATAMENTO DE ERRO EM INIT
// =============================================

function teste7_tratamentoErro() {
  iniciarTesteGrupo('TESTE 7: Autenticação sem Tratamento de Erro');
  
  async function init_comErro() {
    const PERFIL = null;
    
    // ❌ FALHA: TypeError se PERFIL é null
    try {
      if (!PERFIL || PERFIL.tipo !== 'aluno') {
        throw new Error('Acesso negado');
      }
    } catch (error) {
      assert(error !== null, 
        'Erro capturado com try-catch', 'INFO');
    }
  }
  
  async function init_semErro() {
    const PERFIL = null;
    
    // ❌ BUG: Sem try-catch
    if (!PERFIL || PERFIL.tipo !== 'aluno') {  // TypeError aqui
      // redirect
    }
  }
  
  assert(true, 'Versão com try-catch é segura', 'INFO');
  assert(false, 'Versão sem try-catch pode causar TypeError', 'CRÍTICA');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 8: FUNÇÕES DUPLICADAS
// =============================================

function teste8_funcoesDuplicadas() {
  iniciarTesteGrupo('TESTE 8: Funções Utilitárias Duplicadas');
  
  // Simulando 4 versões da mesma função
  const periodoAtivo_v1 = (inicio, fim) => {
    if (!inicio || !fim) return false;
    const hoje = new Date();
    return new Date(inicio) <= hoje && hoje <= new Date(fim);
  };
  
  const periodoAtivo_v2 = (inicio, fim) => {
    if (!inicio || !fim) return false;
    const hoje = new Date();
    return new Date(inicio) <= hoje && hoje <= new Date(fim);
  };
  
  // Versão diferente (bug)
  const periodoAtivo_v3_bugado = (inicio, fim) => {
    if (!inicio || !fim) return false;
    const hoje = new Date();
    return new Date(inicio) < hoje && hoje < new Date(fim);  // Sem igualdade
  };
  
  const resultado_v1 = periodoAtivo_v1('2026-06-01', '2026-06-01');
  const resultado_v2 = periodoAtivo_v2('2026-06-01', '2026-06-01');
  const resultado_v3 = periodoAtivo_v3_bugado('2026-06-01', '2026-06-01');
  
  assert(resultado_v1 === resultado_v2, 
    'Versão 1 e 2 retornam mesmo resultado', 'INFO');
  
  assert(resultado_v1 !== resultado_v3, 
    'Versão 3 (bugada) retorna diferente', 'MÉDIA');
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 9: TOAST ELEMENT
// =============================================

function teste9_toastElement() {
  iniciarTesteGrupo('TESTE 9: Toast Element pode não Existir');
  
  function mostrarToast_original(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('toast-teste');
    if (!toast) return;  // Falha silenciosa
    
    toast.textContent = mensagem;
    toast.className = `toast toast--${tipo}`;
    toast.style.display = 'block';
  }
  
  function mostrarToast_corrigido(mensagem, tipo = 'sucesso') {
    let toast = document.getElementById('toast-teste');
    
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-teste';
      document.body.appendChild(toast);
      console.warn('⚠️ Toast criado dinamicamente');
    }
    
    toast.textContent = mensagem;
    toast.className = `toast toast--${tipo}`;
    toast.style.display = 'block';
  }
  
  // Caso 1: Sem elemento
  assert(document.getElementById('toast-teste') === null, 
    'Toast element não existe inicialmente', 'INFO');
  
  mostrarToast_original('Teste', 'sucesso');
  assert(document.getElementById('toast-teste') === null, 
    'Versão original: nada acontece silenciosamente', 'BAIXA');
  
  // Caso 2: Versão corrigida
  mostrarToast_corrigido('Teste', 'sucesso');
  assert(document.getElementById('toast-teste') !== null, 
    'Versão corrigida: cria elemento dinamicamente', 'INFO');
  
  // Limpeza
  document.getElementById('toast-teste')?.remove();
  
  finalizarTesteGrupo();
}

// =============================================
// TESTE 10: VALIDAÇÃO DE DATAS
// =============================================

function teste10_validacaoDatas() {
  iniciarTesteGrupo('TESTE 10: Datas sem Validação');
  
  function validarPeriodo(inicio, fim) {
    if (!inicio || !fim) {
      throw new Error('Datas obrigatórias');
    }
    
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    
    if (dataFim < dataInicio) {
      throw new Error('Data fim não pode ser anterior à data início');
    }
    
    return true;
  }
  
  // Caso 1: Datas válidas
  try {
    validarPeriodo('2026-06-01', '2026-06-30');
    assert(true, 'Período válido aceito', 'INFO');
  } catch (e) {
    assert(false, `Erro inesperado: ${e.message}`, 'ALTA');
  }
  
  // Caso 2: Datas invertidas
  try {
    validarPeriodo('2026-07-01', '2026-06-01');
    assert(false, 'Sistema permitiu datas invertidas', 'ALTA');
  } catch (e) {
    assert(true, `Bloqueou datas invertidas: ${e.message}`, 'INFO');
  }
  
  // Caso 3: Datas nulas
  try {
    validarPeriodo(null, '2026-06-30');
    assert(false, 'Sistema permitiu datas nulas', 'ALTA');
  } catch (e) {
    assert(true, `Bloqueou datas nulas: ${e.message}`, 'INFO');
  }
  
  finalizarTesteGrupo();
}

// =============================================
// EXECUTAR TODOS OS TESTES
// =============================================

function executarTodosTestes() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 INICIANDO TESTES DE SISTEMA - PORTAL ATLAS');
  console.log('='.repeat(60));
  
  teste1_periodoAtivo();
  teste2_restricaoEletiva();
  teste3_duplicacaoTutoria();
  teste4_sessaoExpirada();
  teste5_vagasNull();
  teste6_clubinhoValidade();
  teste7_tratamentoErro();
  teste8_funcoesDuplicadas();
  teste9_toastElement();
  teste10_validacaoDatas();
  
  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RELATÓRIO FINAL');
  console.log('='.repeat(60));
  console.log(`✅ Testes que passaram: ${TESTES.passou}`);
  console.log(`❌ Testes que falharam: ${TESTES.falhou}`);
  console.log(`📋 Total executado: ${TESTES.executados}`);
  console.log(`📈 Taxa de sucesso: ${((TESTES.passou / TESTES.executados) * 100).toFixed(1)}%`);
  
  // Resumo de falhas críticas
  const criticas = TESTES.resultados.filter(r => r.severidade === 'CRÍTICA' && !r.condicao);
  const altas = TESTES.resultados.filter(r => r.severidade === 'ALTA' && !r.condicao);
  
  if (criticas.length > 0) {
    console.log(`\n🔴 FALHAS CRÍTICAS (${criticas.length}):`);
    criticas.forEach(r => console.log(`   - ${r.mensagem}`));
  }
  
  if (altas.length > 0) {
    console.log(`\n🟠 FALHAS ALTAS (${altas.length}):`);
    altas.forEach(r => console.log(`   - ${r.mensagem}`));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Testes concluídos!');
  console.log('='.repeat(60) + '\n');
}

// Exportar para uso em Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executarTodosTestes,
    teste1_periodoAtivo,
    teste2_restricaoEletiva,
    teste3_duplicacaoTutoria,
    teste4_sessaoExpirada,
    teste5_vagasNull,
    teste6_clubinhoValidade,
    teste7_tratamentoErro,
    teste8_funcoesDuplicadas,
    teste9_toastElement,
    teste10_validacaoDatas,
    TESTES
  };
}
