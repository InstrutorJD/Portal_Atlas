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
  usuarios: [
    { id: '1', nome: 'Professor Teste', email: 'professor@atlas.com', tipo: 'professor', is_tutor: true },
    { id: '2', nome: 'Coordenador Teste', email: 'coordenador@atlas.com', tipo: 'coordenador', is_coordenador: true },
    { id: '3', nome: 'Aluno Teste', email: 'aluno@atlas.com', tipo: 'aluno' }
  ],
  colaboradores: [
    { id: '1', nome: 'Professor Teste', email: 'professor@atlas.com', is_professor: true, is_tutor: true, is_coordenador: false },
    { id: '2', nome: 'Coordenador Teste', email: 'coordenador@atlas.com', is_professor: false, is_tutor: false, is_coordenador: true }
  ],
  alunos: [
    { id: '3', nome: 'Aluno Teste', email: 'aluno@atlas.com' }
  ],
  configuracoes: [],
  tutoria_config: { ano_letivo: 2026, max_alunos: 10 },
  eletiva_config: { ano_letivo: 2026, max_vagas: 20 },
  clubinho_config: { ano_letivo: 2026, ativo: true },
  tutores: [],
  tutoria_matriculas: [],
  eletivas: [
    { id: '1', titulo: 'Eletiva 1', descricao: 'Descrição', professor_id: '1', ano_letivo: 2026 },
    { id: '2', titulo: 'Eletiva 2', descricao: 'Descrição', professor_id: '1', ano_letivo: 2026 }
  ],
  eletiva_matriculas: [],
  clubinhos: [
    { id: '1', titulo: 'Clube 1', descricao: 'Descrição', lider_id: '3', ano_letivo: 2026, status: 'ativo' }
  ],
  clubinho_membros: [
    { id: '1', clubinho_id: '1', aluno_id: '3', ano_letivo: 2026 }
  ]
};

// =============== AUTENTICAÇÃO CORRIGIDA ===============
// Aceita o e-mail completo ou só o início dele (ex.: "ana.quevedo1")
async function resolverEmailLogin(login) {
  const valor = String(login || '').trim().toLowerCase();
  if (valor.includes('@')) return valor;

  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.rpc('email_por_login', { p_login: valor });
    if (error) console.warn('⚠️ Erro ao buscar login:', error.message);
    if (!data) throw new Error('Login não encontrado. Use o início do seu e-mail (antes do @).');
    return data;
  }
  const usuario = _DB.usuarios.find(u => u.email.toLowerCase().split('@')[0] === valor);
  return usuario ? usuario.email : valor;
}

async function login(email, senha) {
  email = await resolverEmailLogin(email);
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
      throw e;
    }
  } else {
    // Modo mock: o perfil vem do usuário de demonstração com esse e-mail
    const usuario = _DB.usuarios.find(u => u.email.toLowerCase() === String(email).toLowerCase());
    if (!usuario) {
      throw new Error('Modo de demonstração: use aluno@atlas.com, professor@atlas.com ou coordenador@atlas.com.');
    }
    const sessao = {
      user: { id: usuario.id, email: usuario.email },
      perfil: { ...usuario },
      criada_em: Date.now()  // timestamp para validar expiração
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
    
    // Sessão sem criada_em (formato antigo) também é tratada como expirada
    if (!sessao.criada_em || agora - sessao.criada_em > TIMEOUT_SESSAO) {
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
  const { data: aluno, error: erroAluno } = await supabaseClient
    .from('alunos')
    .select('id, nome, email')
    .eq('email', email)
    .maybeSingle();

  if (erroAluno) console.warn('⚠️ Erro ao buscar em alunos:', erroAluno.message);

  if (aluno) {
    return { id: aluno.id, email: aluno.email, tipo: 'aluno', nome: aluno.nome };
  }

  // 2. Se não achar, tenta buscar na tabela de colaboradores
  const { data: colab, error: erroColab } = await supabaseClient
    .from('colaboradores')
    .select('id, nome, email, is_professor, is_coordenador, is_tutor')
    .eq('email', email)
    .maybeSingle();

  if (erroColab) console.warn('⚠️ Erro ao buscar em colaboradores:', erroColab.message);

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

  console.error(`❌ Perfil não encontrado para email: ${email}. Verifique as tabelas alunos/colaboradores no Supabase.`);
  return null;
}

async function getPerfil() {
  try {
    const sessao = await getSessao();
    if (!sessao) return null;
    if (sessao.perfil) return sessao.perfil;
    
    if (SUPABASE_ENABLED && sessao.user?.email) {
      return await buscarPerfilNoBanco(sessao.user.email);
    }
    
    return { nome: 'Aluno Atlas', tipo: 'aluno', id: 'mock-aluno' };
  } catch (e) {
    console.error('Erro ao buscar perfil:', e.message);
    return null;
  }
}

// =============== FUNÇÕES DE NEGÓCIO ===============
function anoLetivo() {
  return new Date().getFullYear();
}

async function getConfigs(ano) {
  try {
    if (SUPABASE_ENABLED) {
      const t = supabaseClient.from('tutoria_config').select('*').eq('ano_letivo', ano).maybeSingle();
      const e = supabaseClient.from('eletiva_config').select('*').eq('ano_letivo', ano).maybeSingle();
      const c = supabaseClient.from('clubinho_config').select('*').eq('ano_letivo', ano).maybeSingle();
      
      const [tut, ele, club] = await Promise.all([t, e, c]);
      return { tutoria: tut.data, eletiva: ele.data, clubinho: club.data };
    }
    return { tutoria: null, eletiva: null, clubinho: null };
  } catch (e) {
    console.error('Erro ao buscar configurações:', e.message);
    return { tutoria: null, eletiva: null, clubinho: null };
  }
}

async function getTutores() {
  try {
    if (SUPABASE_ENABLED) {
      const { data } = await supabaseClient.from('colaboradores').select('*').eq('is_tutor', true);
      return data || [];
    }
    return [];
  } catch (e) {
    console.error('Erro ao buscar tutores:', e.message);
    return [];
  }
}

async function getVinculoTutoria(alunoId, ano) {
  try {
    if (SUPABASE_ENABLED) {
      const { data } = await supabaseClient.from('tutoria_vinculos').select('*, colaboradores(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
      return data;
    }
    return null;
  } catch (e) {
    console.error('Erro ao buscar vínculo de tutoria:', e.message);
    return null;
  }
}

async function contarAlunosPorTutor(tutorId, ano) {
  if (SUPABASE_ENABLED) {
    const { count } = await supabaseClient.from('tutoria_vinculos').select('*', { count: 'exact', head: true }).eq('colaborador_id', tutorId).eq('ano_letivo', ano);
    return count || 0;
  }
  return 0;
}

async function escolherTutor(alunoId, tutorId, ano) {
  if (SUPABASE_ENABLED) {
    const { data: existente } = await supabaseClient.from('tutoria_vinculos').select('id').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
    if (existente) {
      const { error } = await supabaseClient.from('tutoria_vinculos').update({ colaborador_id: tutorId }).eq('id', existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('tutoria_vinculos').insert([{ aluno_id: alunoId, colaborador_id: tutorId, ano_letivo: ano }]);
      if (error) throw error;
    }
    return true;
  }
  return true;
}

async function getEletivas(ano, soAprovadas = false) {
  try {
    if (SUPABASE_ENABLED) {
      let query = supabaseClient.from('eletivas').select('*, colaboradores(*)').eq('ano_letivo', ano);
      if (soAprovadas) query = query.eq('status', 'aprovada');
      const { data } = await query;
      return data || [];
    }
    return [];
  } catch (e) {
    console.error('Erro ao buscar eletivas:', e.message);
    return [];
  }
}

async function getMatriculaEletiva(alunoId, ano) {
  try {
    if (SUPABASE_ENABLED) {
      const { data } = await supabaseClient.from('eletiva_matriculas').select('*, eletivas(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
      return data;
    }
    return null;
  } catch (e) {
    console.error('Erro ao buscar matrícula de eletiva:', e.message);
    return null;
  }
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
    // 1 eletiva por aluno por ano: troca a inscrição se já existir
    const { data: existente } = await supabaseClient.from('eletiva_matriculas').select('eletiva_id').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
    if (existente?.eletiva_id === eletivaId) return true;
    const { error } = existente
      ? await supabaseClient.from('eletiva_matriculas').update({ eletiva_id: eletivaId, matriculado_em: new Date().toISOString() }).eq('aluno_id', alunoId).eq('ano_letivo', ano)
      : await supabaseClient.from('eletiva_matriculas').insert([{ aluno_id: alunoId, eletiva_id: eletivaId, ano_letivo: ano }]);
    if (error) throw error;
    return true;
  }
  return true;
}

async function getClubbinhos(ano, soAprovados = false) {
  try {
    if (SUPABASE_ENABLED) {
      let query = supabaseClient.from('clubinhos').select('*').eq('ano_letivo', ano);
      if (soAprovados) query = query.eq('status', 'aprovado');
      const { data } = await query;
      return data || [];
    }
    return [];
  } catch (e) {
    console.error('Erro ao buscar clubinhos:', e.message);
    return [];
  }
}

async function getMembroClubinho(alunoId, ano) {
  try {
    if (SUPABASE_ENABLED) {
      const { data } = await supabaseClient.from('clubinho_membros').select('*, clubinhos(*)').eq('aluno_id', alunoId).eq('ano_letivo', ano).maybeSingle();
      return data;
    }
    return null;
  } catch (e) {
    console.error('Erro ao buscar membro de clubinho:', e.message);
    return null;
  }
}

async function contarMembrosPorClubinho(clubinhoId) {
  if (SUPABASE_ENABLED) {
    const { count } = await supabaseClient.from('clubinho_membros').select('*', { count: 'exact', head: true }).eq('clubinho_id', clubinhoId);
    return count || 0;
  }
  return 0;
}

async function criarClubinho(liderId, nome, descricao, ano, config) {
  if (SUPABASE_ENABLED) {
    let validadeAte = null;
    if (config?.duracao_meses) {
      // Data local (não UTC). O banco também calcula validade_ate se vier nula.
      const d = new Date();
      d.setMonth(d.getMonth() + config.duracao_meses);
      validadeAte = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const { data, error } = await supabaseClient.from('clubinhos').insert([{ nome, descricao, lider_id: liderId, ano_letivo: ano, status: 'pendente', validade_ate: validadeAte }]).select().single();
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
    const { data } = await supabaseClient.from('colaboradores').select('*');
    return data || [];
  }
  return [];
}

async function atualizarColaborador(id, campos) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('colaboradores').update(campos).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Sem permissão para alterar este colaborador.');
  }
  return true;
}

async function criarColaborador(nome, cargo, email, isTutor, isProfessor, isCoordenador) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('colaboradores').insert([{
      nome,
      cargo,
      email: email || null,
      is_tutor: isTutor,
      is_professor: isProfessor,
      is_coordenador: isCoordenador
    }]);
    if (error) throw error;
    return data;
  }
  return true;
}

async function atualizarStatusEletiva(id, status) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('eletivas').update({ status }).eq('id', id);
    if (error) throw error;
    return data;
  }
  return true;
}

async function atualizarStatusClubinho(id, status) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabaseClient.from('clubinhos').update({ status }).eq('id', id);
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

// =============== RESULTADOS DO SIMULADO ENEM ===============
// Tabela simulado_resultados (criada por dados/atualizacao_supabase.sql).
// Sem Supabase (modo mock) as funções retornam null e o simulador usa só o localStorage.
async function salvarResultadoSimulado(resultado) {
  if (!SUPABASE_ENABLED) return null;
  const perfil = await getPerfil();
  if (!perfil?.id || perfil.tipo !== 'aluno') return null;
  const { error } = await supabaseClient.from('simulado_resultados').insert([{
    id: resultado.id,
    aluno_id: perfil.id,
    modalidade: resultado.modalidade,
    escopo: resultado.escopo,
    duracao_min: resultado.duracaoMin,
    tempo_gasto_seg: resultado.tempoGastoSeg,
    total: resultado.total,
    acertos: resultado.acertos,
    erros: resultado.erros,
    em_branco: resultado.emBranco,
    advertencias: resultado.advertencias,
    motivo_encerramento: resultado.motivo,
    por_area: resultado.porArea,
    respostas: resultado.respostas,
    criado_em: resultado.criadoEm,
  }]);
  if (error) throw error;
  return true;
}

async function listarResultadosSimulado(limite = 20) {
  if (!SUPABASE_ENABLED) return null;
  const perfil = await getPerfil();
  if (!perfil?.id || perfil.tipo !== 'aluno') return null;
  const { data, error } = await supabaseClient
    .from('simulado_resultados')
    .select('id, modalidade, escopo, duracao_min, tempo_gasto_seg, total, acertos, erros, em_branco, advertencias, motivo_encerramento, por_area, criado_em')
    .eq('aluno_id', perfil.id)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data || []).map((linha) => ({
    id: linha.id,
    criadoEm: linha.criado_em,
    modalidade: linha.modalidade,
    escopo: linha.escopo,
    duracaoMin: linha.duracao_min,
    tempoGastoSeg: linha.tempo_gasto_seg,
    total: linha.total,
    acertos: linha.acertos,
    erros: linha.erros,
    emBranco: linha.em_branco,
    advertencias: linha.advertencias,
    motivo: linha.motivo_encerramento,
    porArea: linha.por_area,
  }));
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
window.atualizarColaborador = atualizarColaborador;
window.atualizarStatusEletiva = atualizarStatusEletiva;
window.atualizarStatusClubinho = atualizarStatusClubinho;
window.submitEletiva = submitEletiva;
window.salvarConfig = salvarConfig;
window.salvarResultadoSimulado = salvarResultadoSimulado;
window.listarResultadosSimulado = listarResultadosSimulado;
window.SUPABASE_ENABLED = SUPABASE_ENABLED;
window._DB = _DB;

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