// =============================================
// PORTAL ATLAS — supabase.js
// Camada de autenticação e dados com Supabase real + fallback mock
// =============================================

// =============== CONFIGURAÇÃO ===============
// Credenciais são carregadas em ordem de prioridade:
// 1. window.VITE_SUPABASE_URL e window.VITE_SUPABASE_ANON_KEY (setadas via config.js)
// 2. localStorage['supabase_url'] e localStorage['supabase_key'] (dev local)
// 3. Fallback: modo mock

const SUPABASE_URL = 
  window.VITE_SUPABASE_URL || 
  localStorage.getItem('supabase_url') || 
  null;

const SUPABASE_KEY = 
  window.VITE_SUPABASE_ANON_KEY || 
  localStorage.getItem('supabase_key') || 
  null;

let SUPABASE_ENABLED = false;
let supabaseClient = null; // Alterado de 'supabase' para 'supabaseClient' para evitar conflito com o CDN

// Tentar inicializar Supabase
if (SUPABASE_URL && SUPABASE_KEY && typeof window.supabase !== 'undefined') {
  try {
    // window.supabase vem do script do CDN
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    SUPABASE_ENABLED = true;
    console.log('✅ Supabase conectado:', SUPABASE_URL);
  } catch (e) {
    console.warn('⚠️ Erro ao conectar Supabase, usando mock:', e.message);
    SUPABASE_ENABLED = false;
  }
} else {
  console.log('ℹ️ Modo mock ativado (credenciais não encontradas)');
}

// =============== DADOS MOCK (fallback) ===============
const _DB = {
  usuarios: [],
  configuracoes: [],
  tutores: [],
  tutoria_matriculas: [],
  eletivas: [],
  eletiva_matriculas: [],
  clubinhos: [],
  clubinho_membros: []
};

// =============== AUTENTICAÇÃO CORRIGIDA ===============
async function login(email, senha) {
  if (SUPABASE_ENABLED) {
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      
      // Buscar o perfil para garantir que o usuário existe no banco de dados e salvar localmente
      const perfil = await buscarPerfilNoBanco(email);
      if (!perfil) throw new Error('Usuário não encontrado nas tabelas de Alunos ou Colaboradores.');
      
      const sessao = { 
        user: { id: data.user.id, email: data.user.email }, 
        access_token: data.session?.access_token || '',
        perfil,
        criada_em: Date.now()  // ✅ ADICIONADO: timestamp para validar expiração
      };
      
      localStorage.setItem('portal_atlas_sessao', JSON.stringify(sessao));
      return sessao;
    } catch (e) {
      console.error('Erro de autenticação:', e.message);
      throw e;
    }
  } else {
    // Modo mock
    console.log('🔑 Tentando login mock para:', email);
    const sessao = { 
      user: { email }, 
      perfil: { nome: 'Usuário Teste', tipo: 'aluno' },
      criada_em: Date.now()  // ✅ ADICIONADO: timestamp para validar expiração
    };
    localStorage.setItem('portal_atlas_sessao', JSON.stringify(sessao));
    return sessao;
  }
}

async function logout() {
  if (SUPABASE_ENABLED) {
    try { await supabaseClient.auth.signOut(); } catch (e) { console.warn(e); }
  }
  localStorage.removeItem('portal_atlas_sessao');
  window.location.href = 'index.html';
}

async function getSessao() {
  try {
    const sessao = JSON.parse(localStorage.getItem('portal_atlas_sessao'));
    if (!sessao) return null;
    
    // ✅ CORRIGIDO: Validar expiração da sessão (24 horas)
    const agora = Date.now();
    const TIMEOUT_SESSAO = 24 * 60 * 60 * 1000; // 24 horas em ms
    
    if (sessao.criada_em && agora - sessao.criada_em > TIMEOUT_SESSAO) {
      console.warn('⏰ Sessão expirada');
      localStorage.removeItem('portal_atlas_sessao');
      return null;
    }
    
    return sessao;
  } catch(e) {
    console.error('Erro ao ler sessão:', e);
    return null;
  }
}

// Função auxiliar para buscar nas tabelas corretas do seu SQL
async function buscarPerfilNoBanco(email) {
  // 1. Tenta buscar na tabela de alunos
  const { data: aluno } = await supabaseClient
    .from('alunos')
    .select('id, nome, email')
    .eq('email', email)
    .maybeSingle();
    
  if (aluno) {
    return { id: aluno.id, email: aluno.email, tipo: 'aluno', nome: aluno.nome };
  }
  
  // 2. Se não achar, tenta buscar na tabela de colaboradores
  const { data: colab } = await supabaseClient
    .from('colaboradores')
    .select('id, nome, email, is_professor, is_coordenador, is_tutor')
    .eq('email', email)
    .maybeSingle();
    
  if (colab) {
    return { 
      id: colab.id, 
      email: colab.email, 
      tipo: colab.is_coordenador ? 'coordenador' : colab.is_professor ? 'professor' : 'colaborador',
      nome: colab.nome,
      is_professor: colab.is_professor,
      is_coordenador: colab.is_coordenador,
      is_tutor: colab.is_tutor
    };
  }
  
  return null;
}

async function getPerfil() {
  const sessao = await getSessao();
  if (!sessao) return null;
  if (sessao.perfil) return sessao.perfil;
  
  if (SUPABASE_ENABLED && sessao.user?.email) {
    return await buscarPerfilNoBanco(sessao.user.email);
  }
  
  return { nome: 'Aluno Atlas', tipo: 'aluno', id: 'mock-aluno' };
}

// =============== FUNÇÕES DE NEGÓCIO ===============
function anoLetivo() {
  return new Date().getFullYear();
}

async function getConfigs(ano) {
  if (SUPABASE_ENABLED) {
    const t = supabaseClient.from('tutoria_config').select('*').eq('ano_letivo', ano).maybeSingle();
    const e = supabaseClient.from('eletiva_config').select('*').eq('ano_letivo', ano).maybeSingle();
    const c = supabaseClient.from('clubinho_config').select('*').eq('ano_letivo', ano).maybeSingle();
    
    const [tut, ele, club] = await Promise.all([t, e, c]);
    return { tutoria: tut.data, eletiva: ele.data, clubinho: club.data };
  }
  return { tutoria: null, eletiva: null, clubinho: null };
}

async function getTutores() {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('usuarios').select('*').eq('tipo', 'professor').eq('is_tutor', true);
    return data || [];
  }
  return [];
}

async function getVinculoTutoria(alunoId, ano) {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('tutoria_matriculas').select('*, usuarios(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
    return data;
  }
  return null;
}

async function contarAlunosPorTutor(tutorId, ano) {
  if (SUPABASE_ENABLED) {
    const { count } = await supabaseClient.from('tutoria_matriculas').select('*', { count: 'exact', head: true }).eq('tutor_id', tutorId).eq('ano_letivo', ano);
    return count || 0;
  }
  return 0;
}

async function escolherTutor(alunoId, tutorId, ano) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('tutoria_matriculas').insert([{ aluno_id: alunoId, tutor_id: tutorId, ano_letivo: ano }]);
    if (error) throw error;
    return data;
  }
  return true;
}

async function getEletivas(ano) {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('eletivas').select('*, usuarios(*)').eq('ano_letivo', ano);
    return data || [];
  }
  return [];
}

async function getMatriculaEletiva(alunoId, ano) {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('eletiva_matriculas').select('*, eletivas(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
    return data;
  }
  return null;
}

async function contarMatriculasPorEletiva(eletivaId) {
  if (SUPABASE_ENABLED) {
    const { count } = await supabaseClient.from('eletiva_matriculas').select('*', { count: 'exact', head: true }).eq('eletiva_id', eletivaId);
    return count || 0;
  }
  return 0;
}

async function matricularEletiva(alunoId, eletivaId, ano) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('eletiva_matriculas').insert([{ aluno_id: alunoId, eletiva_id: eletivaId, ano_letivo: ano }]);
    if (error) throw error;
    return data;
  }
  return true;
}

async function getClubbinhos(ano) {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('clubinhos').select('*, usuarios(*)').eq('ano_letivo', ano);
    return data || [];
  }
  return [];
}

async function getMembroClubinho(alunoId, ano) {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('clubinho_membros').select('*, clubinhos(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
    return data;
  }
  return null;
}

async function contarMembrosPorClubinho(clubinhoId) {
  if (SUPABASE_ENABLED) {
    const { count } = await supabaseClient.from('clubinho_membros').select('*', { count: 'exact', head: true }).eq('clubinho_id', clubinhoId);
    return count || 0;
  }
  return 0;
}

async function criarClubinho(titulo, descricao, liderId, ano) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('clubinhos').insert([{ titulo, descricao, lider_id: liderId, ano_letivo: ano, status: 'pendente' }]).select().single();
    if (error) throw error;
    await supabaseClient.from('clubinho_membros').insert([{ clubinho_id: data.id, aluno_id: liderId, ano_letivo: ano }]);
    return data;
  }
  return true;
}

async function entrarClubinho(alunoId, clubinhoId, ano) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('clubinho_membros').insert([{ aluno_id: alunoId, clubinho_id: clubinhoId, ano_letivo: ano }]);
    if (error) throw error;
    return data;
  }
  return true;
}

async function getTodosColaboradores() {
  if (SUPABASE_ENABLED) {
    const { data } = await supabaseClient.from('usuarios').select('*').in('tipo', ['professor', 'coordenador']);
    return data || [];
  }
  return [];
}

async function criarColaborador(nome, email, tipo) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('usuarios').insert([{ nome, email, tipo, is_tutor: tipo === 'professor' }]);
    if (error) throw error;
    return data;
  }
  return true;
}

async function submitEletiva(titulo, descricao, professorId, ano) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('eletivas').insert([{ titulo, descricao, professor_id: professorId, ano_letivo: ano, status: 'pendente' }]);
    if (error) throw error;
    return data;
  }
  return true;
}

// =============== CONFIGURAÇÕES (COORDENADOR) ===============
async function salvarConfig(tabela, dados) {
  console.log(`🔍 salvarConfig chamada - SUPABASE_ENABLED=${SUPABASE_ENABLED}, tabela=${tabela}`);
  
  if (!SUPABASE_ENABLED) {
    console.warn(`⚠️ Supabase não está habilitado. Modo MOCK.`);
    return true; // Retorna sucesso em modo mock
  }
  
  if (!supabaseClient) {
    throw new Error('Cliente Supabase não inicializado');
  }
  
  try {
    console.log(`📝 Salvando ${tabela}...`, dados);
    
    // Busca config existente
    const { data: existente, error: erroSel } = await supabaseClient
      .from(tabela)
      .select('id')
      .eq('ano_letivo', dados.ano_letivo)
      .single();

    if (erroSel && erroSel.code !== 'PGRST116') {
      console.error(`❌ Erro ao buscar config existente:`, erroSel);
      throw erroSel;
    }

    if (existente) {
      console.log(`🔄 Atualizando registro id=${existente.id}`);
      // UPDATE
      const { error: erroUpd } = await supabaseClient
        .from(tabela)
        .update(dados)
        .eq('id', existente.id);
      if (erroUpd) {
        console.error(`❌ Erro ao atualizar:`, erroUpd);
        throw erroUpd;
      }
      console.log(`✅ Registro atualizado`);
    } else {
      console.log(`➕ Inserindo novo registro`);
      // INSERT
      const { error: erroIns } = await supabaseClient
        .from(tabela)
        .insert([dados]);
      if (erroIns) {
        console.error(`❌ Erro ao inserir:`, erroIns);
        throw erroIns;
      }
      console.log(`✅ Registro inserido`);
    }
    return true;
  } catch (e) {
    console.error(`❌ Erro ao salvar ${tabela}:`, e);
    throw new Error(`${tabela}: ${e.message || JSON.stringify(e)}`);
  }
}

// Expõe a instância do cliente adaptada como 'window.db' para os scripts secundários (coordenador.js, professor.js)
window.db = supabaseClient;

// =============== EXPORTS GLOBAIS ===============
window.login = login;
window.logout = logout;
window.getSessao = getSessao;
window.getPerfil = getPerfil;
window.getConfigs = getConfigs;
window.anoLetivo = anoLetivo;
window.getTutores = getTutores;
window.getVinculoTutoria = getVinculoTutoria;
window.contarAlunosPorTutor = contarAlunosPorTutor;
window.escolherTutor = escolherTutor;
window.getEletivas = getEletivas;
window.getMatriculaEletiva = getMatriculaEletiva;
window.contarMatriculasPorEletiva = contarMatriculasPorEletiva;
window.matricularEletiva = matricularEletiva;
window.getClubbinhos = getClubbinhos;
window.getMembroClubinho = getMembroClubinho;
window.contarMembrosPorClubinho = contarMembrosPorClubinho;
window.criarClubinho = criarClubinho;
window.entrarClubinho = entrarClubinho;
window.getTodosColaboradores = getTodosColaboradores;
window.criarColaborador = criarColaborador;
window.submitEletiva = submitEletiva;
window.salvarConfig = salvarConfig;
window.SUPABASE_ENABLED = SUPABASE_ENABLED;

// =============== REDIRECIONAMENTO POR PERFIL (CORRIGIDO) ===============
window.redirecionarPorPerfil = async function() {
  const perfil = await getPerfil();
  if (!perfil) { window.location.href = 'index.html'; return; }
  
  console.log("Redirecionando perfil do tipo:", perfil.tipo);
  
  // Sincronizado exatamente com as strings de tipo do seu banco/sistema anterior
  if (perfil.tipo === 'coordenador' || perfil.tipo === 'coordenacao') {
    window.location.href = 'coordenador.html';
  } else if (perfil.tipo === 'professor') {
    window.location.href = 'professor.html';
  } else if (perfil.tipo === 'aluno') {
    window.location.href = 'dashboard.html';
  } else {
    window.location.href = 'index.html';
  }
};