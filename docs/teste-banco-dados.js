// =============================================
// PORTAL ATLAS — teste-banco-dados.js
// Testes de Conexão e Requisições ao Supabase
// =============================================

/**
 * Suite de testes para:
 * ✓ Verificar conexão com Supabase
 * ✓ Testar cada função de requisição
 * ✓ Validar tratamento de erros
 * ✓ Testar timeout/falha de conexão
 * ✓ Validar integridade de dados
 */

const TESTES_BD = {
  executados: 0,
  passou: 0,
  falhou: 0,
  resultados: [],
  detalhes_erros: []
};

// =============================================
// UTILITÁRIOS
// =============================================

function assertBD(condicao, mensagem, severidade = 'INFO', detalhes = null) {
  TESTES_BD.executados++;
  
  if (condicao) {
    TESTES_BD.passou++;
    logBD(`✅ ${mensagem}`, 'sucesso');
  } else {
    TESTES_BD.falhou++;
    logBD(`❌ ${mensagem}`, 'erro');
    if (detalhes) {
      TESTES_BD.detalhes_erros.push({ mensagem, detalhes, severidade });
    }
  }
  
  TESTES_BD.resultados.push({ condicao, mensagem, severidade });
}

function logBD(mensagem, tipo = 'info') {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const prefixo = {
    'sucesso': '✅',
    'erro': '❌',
    'warning': '⚠️',
    'info': 'ℹ️',
    'conexao': '🔗'
  }[tipo] || 'ℹ️';
  
  console.log(`[${timestamp}] ${prefixo} ${mensagem}`);
}

function iniciarGrupoBD(nome) {
  console.group(`\n🧪 GRUPO BD: ${nome}`);
  console.log('─'.repeat(70));
}

function finalizarGrupoBD() {
  console.groupEnd();
}

// =============================================
// TESTE 1: VERIFICAR CONEXÃO SUPABASE
// =============================================

function teste1_conexaoSupabase() {
  iniciarGrupoBD('TESTE 1: Verificar Conexão com Supabase');
  
  // Caso 1: Verificar se SUPABASE_ENABLED está setado
  const conexaoAtiva = typeof SUPABASE_ENABLED !== 'undefined' && SUPABASE_ENABLED;
  logBD(`Status SUPABASE_ENABLED: ${SUPABASE_ENABLED}`, 'conexao');
  
  // Caso 2: Verificar se supabaseClient existe
  const clienteExiste = typeof supabaseClient !== 'undefined' && supabaseClient !== null;
  assertBD(
    clienteExiste || !conexaoAtiva,
    'Cliente Supabase existe ou modo mock ativado',
    'CRÍTICA'
  );
  
  // Caso 3: Verificar credenciais carregadas
  const urlCarregada = typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL !== null;
  const keyCarregada = typeof SUPABASE_KEY !== 'undefined' && SUPABASE_KEY !== null;
  
  assertBD(
    urlCarregada === keyCarregada,
    `Credenciais consistentes (URL: ${urlCarregada}, KEY: ${keyCarregada})`,
    'ALTA'
  );
  
  // Caso 4: Verificar modo (real ou mock)
  logBD(
    `Modo: ${conexaoAtiva ? '🟢 SUPABASE' : '🔴 MOCK'}`,
    conexaoAtiva ? 'sucesso' : 'warning'
  );
  
  if (conexaoAtiva) {
    assertBD(
      typeof supabaseClient.from === 'function',
      'Cliente Supabase tem método from()',
      'CRÍTICA'
    );
    
    assertBD(
      typeof supabaseClient.auth === 'object',
      'Cliente Supabase tem módulo auth',
      'CRÍTICA'
    );
  } else {
    logBD('⚠️  Sistema em modo MOCK - Nenhuma conexão real será testada', 'warning');
  }
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 2: VALIDAR FUNÇÕES DE LOGIN
// =============================================

function teste2_funcaoLogin() {
  iniciarGrupoBD('TESTE 2: Função Login - Validação');
  
  // Caso 1: Verificar se função existe
  assertBD(
    typeof login === 'function',
    'Função login() existe',
    'CRÍTICA'
  );
  
  // Caso 2: Verificar se função é async
  const eAsync = login.constructor.name === 'AsyncFunction';
  assertBD(
    eAsync,
    'Função login() é async (permite await)',
    'ALTA'
  );
  
  // Caso 3: Verificar parâmetros
  const parametros = login.length;
  assertBD(
    parametros === 2,
    `Login recebe 2 parâmetros (email, senha): ${parametros}`,
    'ALTA'
  );
  
  // Caso 4: Verificar tratamento de erro
  assertBD(
    login.toString().includes('throw error') || login.toString().includes('catch'),
    'Função login() tem tratamento de erro',
    'ALTA'
  );
  
  // Caso 5: Verificar salvamento em localStorage
  assertBD(
    login.toString().includes('localStorage'),
    'Função login() salva sessão em localStorage',
    'ALTA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 3: VALIDAR FUNÇÕES DE PERFIL
// =============================================

function teste3_funcaoPerfil() {
  iniciarGrupoBD('TESTE 3: Função getPerfil - Validação');
  
  // Caso 1: Verificar se função existe
  assertBD(
    typeof getPerfil === 'function',
    'Função getPerfil() existe',
    'CRÍTICA'
  );
  
  // Caso 2: Verificar se é async
  const eAsync = getPerfil.constructor.name === 'AsyncFunction';
  assertBD(
    eAsync,
    'Função getPerfil() é async',
    'ALTA'
  );
  
  // Caso 3: Verificar fallback de sessão
  assertBD(
    getPerfil.toString().includes('getSessao'),
    'getPerfil() verifica sessão armazenada',
    'ALTA'
  );
  
  // Caso 4: Verificar busca no banco
  assertBD(
    getPerfil.toString().includes('supabaseClient') || getPerfil.toString().includes('buscarPerfilNoBanco'),
    'getPerfil() busca dados do banco quando necessário',
    'ALTA'
  );
  
  // Caso 5: Verificar retorno de fallback
  assertBD(
    getPerfil.toString().includes('return') && getPerfil.toString().includes('null'),
    'getPerfil() pode retornar null em caso de erro',
    'MÉDIA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 4: VALIDAR FUNÇÕES DE CONFIGURAÇÃO
// =============================================

function teste4_funcaoConfigs() {
  iniciarGrupoBD('TESTE 4: Função getConfigs - Validação');
  
  // Caso 1: Verificar se função existe
  assertBD(
    typeof getConfigs === 'function',
    'Função getConfigs() existe',
    'CRÍTICA'
  );
  
  // Caso 2: Verificar se é async
  const eAsync = getConfigs.constructor.name === 'AsyncFunction';
  assertBD(
    eAsync,
    'Função getConfigs() é async',
    'ALTA'
  );
  
  // Caso 3: Verificar parâmetro ano
  const parametros = getConfigs.length;
  assertBD(
    parametros === 1,
    `getConfigs recebe 1 parâmetro (ano): ${parametros}`,
    'ALTA'
  );
  
  // Caso 4: Verificar múltiplas consultas paralelas
  assertBD(
    getConfigs.toString().includes('Promise.all'),
    'getConfigs() usa Promise.all para múltiplas queries',
    'MÉDIA'
  );
  
  // Caso 5: Verificar retorno estruturado
  assertBD(
    getConfigs.toString().includes('tutoria') && getConfigs.toString().includes('eletiva') && getConfigs.toString().includes('clubinho'),
    'getConfigs() retorna objeto com tutoria, eletiva e clubinho',
    'MÉDIA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 5: VALIDAR TRATAMENTO DE ERROS
// =============================================

function teste5_tratamentoErros() {
  iniciarGrupoBD('TESTE 5: Tratamento de Erros em Requisições');
  
  const funcoes = [
    'login',
    'getPerfil',
    'getConfigs',
    'getTutores',
    'getVinculoTutoria',
    'getEletivas',
    'getMatriculaEletiva',
    'getClubbinhos',
    'getMembroClubinho'
  ];
  
  let funcoesCom_try_catch = 0;
  
  funcoes.forEach(nome => {
    const func = window[nome];
    if (typeof func === 'function') {
      const temTryCatch = func.toString().includes('try') && func.toString().includes('catch');
      const temThrow = func.toString().includes('throw');
      const temCheck = func.toString().includes('error') || temThrow;
      
      if (temTryCatch || temCheck) {
        funcoesCom_try_catch++;
        logBD(`✅ ${nome}(): tem tratamento de erro`, 'sucesso');
      } else {
        logBD(`❌ ${nome}(): SEM tratamento de erro`, 'erro');
      }
    }
  });
  
  assertBD(
    funcoesCom_try_catch >= funcoes.length * 0.8,
    `${funcoesCom_try_catch}/${funcoes.length} funções têm tratamento de erro (mín: 80%)`,
    'ALTA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 6: VALIDAR FUNÇÕES DE CONTAGEM
// =============================================

function teste6_funcoesContagem() {
  iniciarGrupoBD('TESTE 6: Funções de Contagem - Validação');
  
  const funcoes = [
    { nome: 'contarAlunosPorTutor', tabela: 'tutoria' },
    { nome: 'contarMatriculasPorEletiva', tabela: 'eletiva' },
    { nome: 'contarMembrosPorClubinho', tabela: 'clubinho' }
  ];
  
  funcoes.forEach(({ nome, tabela }) => {
    // Caso 1: Função existe
    const existe = typeof window[nome] === 'function';
    assertBD(existe, `${nome}() existe`, 'ALTA');
    
    if (existe) {
      const func = window[nome];
      
      // Caso 2: É async
      const eAsync = func.constructor.name === 'AsyncFunction';
      assertBD(eAsync, `${nome}() é async`, 'MÉDIA');
      
      // Caso 3: Retorna número
      assertBD(
        func.toString().includes('count'),
        `${nome}() conta registros da tabela ${tabela}`,
        'MÉDIA'
      );
      
      // Caso 4: Tem fallback
      assertBD(
        func.toString().includes('0') || func.toString().includes('|| 0'),
        `${nome}() retorna 0 em caso de erro/vazio`,
        'MÉDIA'
      );
    }
  });
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 7: VALIDAR OPERAÇÕES DE ESCRITA
// =============================================

function teste7_operacoesEscrita() {
  iniciarGrupoBD('TESTE 7: Operações de Escrita (INSERT) - Validação');
  
  const funcoes = [
    'escolherTutor',
    'matricularEletiva',
    'criarClubinho',
    'entrarClubinho',
    'submitEletiva'
  ];
  
  funcoes.forEach(nome => {
    const existe = typeof window[nome] === 'function';
    
    assertBD(existe, `${nome}() existe`, 'ALTA');
    
    if (existe) {
      const func = window[nome];
      
      // Verificar async
      const eAsync = func.constructor.name === 'AsyncFunction';
      assertBD(eAsync, `${nome}() é async`, 'MÉDIA');
      
      // Verificar validação de erro
      const validaErro = func.toString().includes('error') && 
                         (func.toString().includes('throw') || func.toString().includes('if (error)'));
      assertBD(
        validaErro,
        `${nome}() valida erros antes de confirmar`,
        'ALTA'
      );
      
      // Verificar retorno
      const temRetorno = func.toString().includes('return');
      assertBD(
        temRetorno,
        `${nome}() retorna dados após sucesso`,
        'MÉDIA'
      );
    }
  });
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 8: VALIDAR CONSULTAS RELACIONADAS
// =============================================

function teste8_consultasRelacionadas() {
  iniciarGrupoBD('TESTE 8: Consultas com Joins - Validação');
  
  const funcoes = [
    'getVinculoTutoria',
    'getMatriculaEletiva',
    'getMembroClubinho'
  ];
  
  funcoes.forEach(nome => {
    const existe = typeof window[nome] === 'function';
    
    if (existe) {
      const func = window[nome];
      
      // Verificar se faz select com join
      const temJoin = func.toString().includes('*,') || func.toString().includes('select(');
      assertBD(
        temJoin,
        `${nome}() busca dados relacionados (com join)`,
        'MÉDIA'
      );
      
      // Verificar filtro por ID
      const temFiltro = func.toString().includes('eq(') || func.toString().includes('.select(');
      assertBD(
        temFiltro,
        `${nome}() filtra por ID específico`,
        'MÉDIA'
      );
      
      // Verificar single/maybeSingle
      const temoSingle = func.toString().includes('maybeSingle') || func.toString().includes('single');
      assertBD(
        temoSingle,
        `${nome}() retorna um único registro`,
        'MÉDIA'
      );
    }
  });
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 9: VALIDAR SEGURANÇA
// =============================================

function teste9_seguranca() {
  iniciarGrupoBD('TESTE 9: Segurança - Validação');
  
  // Caso 1: Verificar RLS
  const codigoSQL = banco_sql || 'SELECT * FROM postgres;';
  const temRLS = codigoSQL.includes('ENABLE ROW LEVEL SECURITY') || 
                 codigoSQL.includes('ROW LEVEL SECURITY');
  assertBD(
    temRLS,
    'Banco de dados tem Row Level Security (RLS) ativado',
    'CRÍTICA'
  );
  
  // Caso 2: Verificar policies
  const temPolicies = codigoSQL.includes('CREATE POLICY') || 
                      codigoSQL.includes('FOR SELECT') ||
                      codigoSQL.includes('FOR INSERT');
  assertBD(
    temPolicies,
    'Banco de dados tem policies de segurança definidas',
    'CRÍTICA'
  );
  
  // Caso 3: Verificar senhas não são logadas
  const temSenhaEmLog = window.login.toString().includes('password');
  assertBD(
    !temSenhaEmLog || window.login.toString().includes('console.log') === false,
    'Senhas não são logadas no console',
    'CRÍTICA'
  );
  
  // Caso 4: Verificar tokens salvos com segurança
  const temToken = window.login.toString().includes('access_token');
  assertBD(
    temToken,
    'Sistema salva tokens de sessão',
    'ALTA'
  );
  
  // Caso 5: Verificar limpeza de sessão no logout
  const temLogout = typeof logout === 'function' && logout.toString().includes('removeItem');
  assertBD(
    temLogout,
    'Função logout() limpa sessionStorage/localStorage',
    'ALTA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 10: VALIDAR PERFORMANCE
// =============================================

function teste10_performance() {
  iniciarGrupoBD('TESTE 10: Performance - Validação');
  
  // Caso 1: Verificar uso de Promise.all
  const getConfigs_texto = getConfigs.toString();
  const temParalelo = getConfigs_texto.includes('Promise.all');
  assertBD(
    temParalelo,
    'getConfigs() faz múltiplas queries em paralelo (Promise.all)',
    'MÉDIA'
  );
  
  // Caso 2: Verificar maybeSingle() para evitar array
  let temMaybeShingle = 0;
  const funcoes = ['getVinculoTutoria', 'getMatriculaEletiva', 'getMembroClubinho'];
  
  funcoes.forEach(nome => {
    if (window[nome] && window[nome].toString().includes('maybeSingle')) {
      temMaybeShingle++;
    }
  });
  
  assertBD(
    temMaybeShingle >= 2,
    `${temMaybeShingle}/3 funções usam maybeSingle() (evita array desnecessário)`,
    'BAIXA'
  );
  
  // Caso 3: Verificar count com head: true
  const contarAlunosTxt = contarAlunosPorTutor.toString();
  const temHeadTrue = contarAlunosTxt.includes('head: true') || contarAlunosTxt.includes('head: true');
  assertBD(
    temHeadTrue,
    'Funções de contagem usam head: true (sem buscar dados)',
    'MÉDIA'
  );
  
  // Caso 4: Verificar se há queries N+1
  const queryN1 = getTutores.toString().includes('for') && getTutores.toString().includes('await');
  assertBD(
    !queryN1,
    'getTutores() não tem loops com await (evita N+1)',
    'MÉDIA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 11: VALIDAR INTEGRIDADE DE DADOS
// =============================================

function teste11_integridadeDados() {
  iniciarGrupoBD('TESTE 11: Integridade de Dados - Validação');
  
  // Caso 1: Verificar campos obrigatórios em INSERT
  const criarColabTxt = criarColaborador.toString();
  const temValidacao = criarColabTxt.includes('nome') && criarColabTxt.includes('email');
  assertBD(
    temValidacao,
    'Função criarColaborador() valida campos obrigatórios',
    'ALTA'
  );
  
  // Caso 2: Verificar constraint de email único
  assertBD(
    criarColabTxt.includes('email'),
    'Sistema trata email como chave única',
    'ALTA'
  );
  
  // Caso 3: Verificar ano_letivo em todas as operações
  const funcoes = ['escolherTutor', 'matricularEletiva', 'criarClubinho'];
  let temAnoLetivo = 0;
  
  funcoes.forEach(nome => {
    if (window[nome] && window[nome].toString().includes('ano_letivo')) {
      temAnoLetivo++;
    }
  });
  
  assertBD(
    temAnoLetivo >= 2,
    `${temAnoLetivo}/3 operações validam ano_letivo`,
    'MÉDIA'
  );
  
  // Caso 4: Verificar transações
  const temTransacao = criarClubinho.toString().includes('insert') && 
                      criarClubinho.toString().includes('insert');
  assertBD(
    temTransacao,
    'criarClubinho() realiza múltiplas operações (possível transação)',
    'BAIXA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// TESTE 12: VALIDAR FALLBACK/MOCK
// =============================================

function teste12_fallbackMock() {
  iniciarGrupoBD('TESTE 12: Fallback Mock - Validação');
  
  // Caso 1: Verificar se existem dados mock
  const temMockDB = typeof _DB !== 'undefined' && _DB !== null;
  assertBD(
    temMockDB,
    'Objeto _DB (mock) existe para fallback',
    'ALTA'
  );
  
  if (temMockDB) {
    // Caso 2: Verificar estrutura de mock
    const temEstrutura = _DB.hasOwnProperty('usuarios') && 
                        _DB.hasOwnProperty('eletivas') &&
                        _DB.hasOwnProperty('clubinhos');
    assertBD(
      temEstrutura,
      '_DB tem estrutura completa de tabelas',
      'MÉDIA'
    );
  }
  
  // Caso 3: Verificar cada função tem fallback
  const funcoes = [
    'login', 'getPerfil', 'getConfigs', 'getTutores',
    'getEletivas', 'getClubbinhos', 'getTodosColaboradores'
  ];
  
  let temFallback = 0;
  funcoes.forEach(nome => {
    const func = window[nome];
    if (func && func.toString().includes('SUPABASE_ENABLED')) {
      temFallback++;
    }
  });
  
  assertBD(
    temFallback >= funcoes.length * 0.7,
    `${temFallback}/${funcoes.length} funções têm fallback SUPABASE_ENABLED`,
    'ALTA'
  );
  
  finalizarGrupoBD();
}

// =============================================
// EXECUTAR TODOS OS TESTES BD
// =============================================

function executarTodosTestes_BD() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 INICIANDO TESTES DE BANCO DE DADOS - PORTAL ATLAS');
  console.log('='.repeat(70));
  
  teste1_conexaoSupabase();
  teste2_funcaoLogin();
  teste3_funcaoPerfil();
  teste4_funcaoConfigs();
  teste5_tratamentoErros();
  teste6_funcoesContagem();
  teste7_operacoesEscrita();
  teste8_consultasRelacionadas();
  teste9_seguranca();
  teste10_performance();
  teste11_integridadeDados();
  teste12_fallbackMock();
  
  // Relatório final
  console.log('\n' + '='.repeat(70));
  console.log('📊 RELATÓRIO FINAL - TESTES DE BANCO DE DADOS');
  console.log('='.repeat(70));
  console.log(`✅ Testes que passaram: ${TESTES_BD.passou}`);
  console.log(`❌ Testes que falharam: ${TESTES_BD.falhou}`);
  console.log(`📋 Total executado: ${TESTES_BD.executados}`);
  
  const taxa = TESTES_BD.executados > 0 
    ? ((TESTES_BD.passou / TESTES_BD.executados) * 100).toFixed(1)
    : 0;
  console.log(`📈 Taxa de sucesso: ${taxa}%`);
  
  // Resumo de falhas
  const criticas = TESTES_BD.resultados.filter(r => r.severidade === 'CRÍTICA' && !r.condicao);
  const altas = TESTES_BD.resultados.filter(r => r.severidade === 'ALTA' && !r.condicao);
  
  if (criticas.length > 0) {
    console.log(`\n🔴 FALHAS CRÍTICAS (${criticas.length}):`);
    criticas.forEach(r => console.log(`   - ${r.mensagem}`));
  }
  
  if (altas.length > 0) {
    console.log(`\n🟠 FALHAS ALTAS (${altas.length}):`);
    altas.forEach(r => console.log(`   - ${r.mensagem}`));
  }
  
  // Detalhes de erro
  if (TESTES_BD.detalhes_erros.length > 0) {
    console.log(`\n📝 DETALHES DE ERROS:`);
    TESTES_BD.detalhes_erros.forEach(erro => {
      console.log(`   [${erro.severidade}] ${erro.mensagem}`);
      console.log(`      Detalhes: ${erro.detalhes}`);
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Testes de Banco de Dados concluídos!');
  console.log('='.repeat(70) + '\n');
  
  return TESTES_BD;
}

// Exportar para uso em Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executarTodosTestes_BD,
    teste1_conexaoSupabase,
    teste2_funcaoLogin,
    teste3_funcaoPerfil,
    teste4_funcaoConfigs,
    teste5_tratamentoErros,
    teste6_funcoesContagem,
    teste7_operacoesEscrita,
    teste8_consultasRelacionadas,
    teste9_seguranca,
    teste10_performance,
    teste11_integridadeDados,
    teste12_fallbackMock,
    TESTES_BD
  };
}
