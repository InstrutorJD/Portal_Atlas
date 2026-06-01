// =============================================
// PORTAL ATLAS — coordenador.js
// =============================================

// Fallback para funções utilitárias (caso utils.js não carregue)
if (typeof periodoAtivo === 'undefined') {
  var periodoAtivo = (inicio, fim) => {
    if (!inicio || !fim) return false;
    const hoje = new Date();
    return new Date(inicio) <= hoje && hoje <= new Date(fim);
  };
}
if (typeof formatarData === 'undefined') {
  var formatarData = (data) => {
    if (!data) return '';
    const d = new Date(data);
    if (isNaN(d)) return '';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
  };
}
if (typeof mostrarToast === 'undefined') {
  var mostrarToast = (mensagem, tipo = 'sucesso') => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = mensagem;
    toast.className = `toast toast--${tipo}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  };
}

let PERFIL = null;
let CONFIGS = null;
let ANO = anoLetivo();

async function init() {
  const sessao = await getSessao();
  if (!sessao) { window.location.href = 'index.html'; return; }

  PERFIL = await getPerfil();
  if (!PERFIL || PERFIL.tipo !== 'coordenador') { window.location.href = 'index.html'; return; }

  CONFIGS = await getConfigs(ANO);
  document.getElementById('user-welcome').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`;
}

function abrirModal(tipo) {
  document.getElementById('modal-container').style.display = 'flex';
  document.getElementById('modal-body').innerHTML = '<div class="loading">Carregando...</div>';

  const titulos = {
    tutores: 'Gerenciar Tutores',
    eletivas: 'Aprovar Eletivas',
    clubinhos: 'Aprovar Clubinhos',
    periodos: 'Períodos e Vagas',
  };
  document.getElementById('modal-title').textContent = titulos[tipo];

  if (tipo === 'tutores') renderTutores();
  else if (tipo === 'eletivas') renderEletivas();
  else if (tipo === 'clubinhos') renderClubbinhos();
  else if (tipo === 'periodos') renderPeriodos();
}

function fecharModal() {
  document.getElementById('modal-container').style.display = 'none';
}

document.getElementById('modal-container').addEventListener('click', e => {
  if (e.target.id === 'modal-container') fecharModal();
});

// =============================================
// TUTORES
// =============================================

async function renderTutores() {
  const body = document.getElementById('modal-body');
  try {
    const colaboradores = await getTodosColaboradores();
    const tutores = colaboradores.filter(c => c.is_tutor);

    body.innerHTML = `
      <div class="secao-criar">
        <h3>Adicionar colaborador</h3>
        <div class="field"><label>Nome</label><input type="text" id="colab-nome" placeholder="Nome completo"></div>
        <div class="field"><label>Cargo</label><input type="text" id="colab-cargo" placeholder="Ex: Professor de Matemática"></div>
        <div class="field"><label>E-mail (opcional — deixe vazio se não terá acesso)</label><input type="email" id="colab-email" placeholder="email@escola.edu.br"></div>
        <div class="field field--check">
          <label><input type="checkbox" id="colab-tutor"> É tutor</label>
          <label><input type="checkbox" id="colab-professor"> É professor (acesso ao portal)</label>
        </div>
        <button class="btn btn-primary" onclick="salvarColaborador()">Adicionar</button>
      </div>
      <hr class="divider">
      <h3 style="margin-bottom:16px">Tutores cadastrados</h3>
      <div class="lista-itens">
        ${tutores.length === 0 ? '<p class="vazio">Nenhum tutor cadastrado.</p>' :
          tutores.map(t => `
            <div class="item-card">
              <h3>${t.nome}</h3>
              <p class="vagas-info">${t.cargo} ${t.email ? `· ${t.email}` : '· sem acesso ao portal'}</p>
            </div>`).join('')}
      </div>`;
  } catch {
    body.innerHTML = '<div class="alert alert--erro">Erro ao carregar colaboradores.</div>';
  }
}

async function salvarColaborador() {
  const nome = document.getElementById('colab-nome').value.trim();
  const cargo = document.getElementById('colab-cargo').value.trim();
  const email = document.getElementById('colab-email').value.trim();
  const isTutor = document.getElementById('colab-tutor').checked;
  const isProfessor = document.getElementById('colab-professor').checked;

  if (!nome || !cargo) { mostrarToast('Preencha nome e cargo.', 'erro'); return; }

  try {
    await criarColaborador(nome, cargo, email || null, isTutor, isProfessor, false);
    mostrarToast('Colaborador adicionado!');
    renderTutores();
  } catch (e) {
    mostrarToast(e.message?.includes('unique') ? 'E-mail já cadastrado.' : 'Erro ao salvar.', 'erro');
  }
}

// =============================================
// ELETIVAS — APROVAÇÃO
// =============================================

async function renderEletivas() {
  const body = document.getElementById('modal-body');
  try {
    const { data, error } = await db
      .from('eletivas')
      .select('*, colaboradores(nome)')
      .eq('ano_letivo', ANO)
      .order('status')
      .order('titulo');

    if (error) throw error;

    if (!data.length) {
      body.innerHTML = '<p class="vazio">Nenhuma eletiva cadastrada para este ano.</p>';
      return;
    }

    const statusLabel = { pendente: '⏳ Pendente', aprovada: '✅ Aprovada', reprovada: '❌ Reprovada' };

    body.innerHTML = `
      <div class="lista-itens">
        ${data.map(e => `
          <div class="item-card">
            <h3>${e.titulo} <span class="tag">${statusLabel[e.status]}</span></h3>
            ${e.descricao ? `<p>${e.descricao}</p>` : ''}
            <p class="vagas-info">Prof. ${e.colaboradores?.nome || '—'}</p>
            ${e.status === 'pendente' ? `
              <div class="btn-group">
                <button class="btn btn-success" onclick="statusEletiva('${e.id}', 'aprovada')">Aprovar</button>
                <button class="btn btn-outline" onclick="statusEletiva('${e.id}', 'reprovada')">Reprovar</button>
              </div>` : ''}
          </div>`).join('')}
      </div>`;
  } catch {
    body.innerHTML = '<div class="alert alert--erro">Erro ao carregar eletivas.</div>';
  }
}

async function statusEletiva(id, status) {
  try {
    await atualizarStatusEletiva(id, status);
    mostrarToast(`Eletiva ${status === 'aprovada' ? 'aprovada' : 'reprovada'}!`);
    renderEletivas();
  } catch {
    mostrarToast('Erro ao atualizar status.', 'erro');
  }
}

// =============================================
// CLUBINHOS — APROVAÇÃO
// =============================================

async function renderClubbinhos() {
  const body = document.getElementById('modal-body');
  try {
    const { data, error } = await db
      .from('clubinhos')
      .select('*, alunos(nome)')
      .eq('ano_letivo', ANO)
      .order('status')
      .order('nome');

    if (error) throw error;

    if (!data.length) {
      body.innerHTML = '<p class="vazio">Nenhum clubinho cadastrado para este ano.</p>';
      return;
    }

    const statusLabel = { pendente: '⏳ Pendente', aprovado: '✅ Aprovado', reprovado: '❌ Reprovado' };

    body.innerHTML = `
      <div class="lista-itens">
        ${data.map(c => `
          <div class="item-card">
            <h3>${c.nome} <span class="tag">${statusLabel[c.status]}</span></h3>
            ${c.descricao ? `<p>${c.descricao}</p>` : ''}
            <p class="vagas-info">Líder: ${c.alunos?.nome || '—'} · Válido até ${formatarData(c.validade_ate)}</p>
            ${c.status === 'pendente' ? `
              <div class="btn-group">
                <button class="btn btn-success" onclick="statusClubinho('${c.id}', 'aprovado')">Aprovar</button>
                <button class="btn btn-outline" onclick="statusClubinho('${c.id}', 'reprovado')">Reprovar</button>
              </div>` : ''}
          </div>`).join('')}
      </div>`;
  } catch {
    body.innerHTML = '<div class="alert alert--erro">Erro ao carregar clubinhos.</div>';
  }
}

async function statusClubinho(id, status) {
  try {
    await atualizarStatusClubinho(id, status);
    mostrarToast(`Clubinho ${status === 'aprovado' ? 'aprovado' : 'reprovado'}!`);
    renderClubbinhos();
  } catch {
    mostrarToast('Erro ao atualizar status.', 'erro');
  }
}

// =============================================
// PERÍODOS E VAGAS
// =============================================

function renderPeriodos() {
  const body = document.getElementById('modal-body');
  const t = CONFIGS.tutoria || {};
  const e = CONFIGS.eletiva || {};
  const c = CONFIGS.clubinho || {};

  body.innerHTML = `
    <form onsubmit="return false;">

      <h3 class="secao-titulo">📖 Tutoria</h3>
      <div class="field-grid">
        <div class="field"><label>Vagas por tutor</label><input type="number" id="t-vagas" value="${t.vagas_por_tutor || 5}" min="1"></div>
        <div class="field"><label>Início inscrições</label><input type="date" id="t-ins-ini" value="${t.data_inscricao_inicio || ''}"></div>
        <div class="field"><label>Fim inscrições</label><input type="date" id="t-ins-fim" value="${t.data_inscricao_fim || ''}"></div>
      </div>

      <h3 class="secao-titulo">💡 Eletivas</h3>
      <div class="field-grid">
        <div class="field"><label>Vagas por eletiva</label><input type="number" id="e-vagas" value="${e.vagas_por_eletiva || 10}" min="1"></div>
        <div class="field"><label>Início criação</label><input type="date" id="e-cri-ini" value="${e.data_criacao_inicio || ''}"></div>
        <div class="field"><label>Fim criação</label><input type="date" id="e-cri-fim" value="${e.data_criacao_fim || ''}"></div>
        <div class="field"><label>Início aprovação</label><input type="date" id="e-apr-ini" value="${e.data_aprovacao_inicio || ''}"></div>
        <div class="field"><label>Fim aprovação</label><input type="date" id="e-apr-fim" value="${e.data_aprovacao_fim || ''}"></div>
        <div class="field"><label>Início inscrições</label><input type="date" id="e-ins-ini" value="${e.data_inscricao_inicio || ''}"></div>
        <div class="field"><label>Fim inscrições</label><input type="date" id="e-ins-fim" value="${e.data_inscricao_fim || ''}"></div>
      </div>

      <h3 class="secao-titulo">🤝 Clubinhos</h3>
      <div class="field-grid">
        <div class="field"><label>Vagas por clubinho</label><input type="number" id="c-vagas" value="${c.vagas_por_clubinho || 10}" min="1"></div>
        <div class="field"><label>Duração (meses)</label><input type="number" id="c-dur" value="${c.duracao_meses || 6}" min="1"></div>
        <div class="field"><label>Início criação</label><input type="date" id="c-cri-ini" value="${c.data_criacao_inicio || ''}"></div>
        <div class="field"><label>Fim criação</label><input type="date" id="c-cri-fim" value="${c.data_criacao_fim || ''}"></div>
        <div class="field"><label>Início aprovação</label><input type="date" id="c-apr-ini" value="${c.data_aprovacao_inicio || ''}"></div>
        <div class="field"><label>Fim aprovação</label><input type="date" id="c-apr-fim" value="${c.data_aprovacao_fim || ''}"></div>
        <div class="field"><label>Início inscrições</label><input type="date" id="c-ins-ini" value="${c.data_inscricao_inicio || ''}"></div>
        <div class="field"><label>Fim inscrições</label><input type="date" id="c-ins-fim" value="${c.data_inscricao_fim || ''}"></div>
      </div>

      <button class="btn btn-primary" onclick="salvarPeriodos()">Salvar configurações</button>
    </form>`;
}

async function salvarPeriodos() {
  const v = id => document.getElementById(id).value;

  try {
    console.log('💾 Iniciando salvamento de configurações...');
    
    await Promise.all([
      salvarConfig('tutoria_config', {
        ano_letivo: ANO,
        vagas_por_tutor: parseInt(v('t-vagas')),
        data_criacao_inicio: v('t-ins-ini'),
        data_criacao_fim: v('t-ins-fim'),
        data_inscricao_inicio: v('t-ins-ini'),
        data_inscricao_fim: v('t-ins-fim'),
      }),
      salvarConfig('eletiva_config', {
        ano_letivo: ANO,
        vagas_por_eletiva: parseInt(v('e-vagas')),
        data_criacao_inicio: v('e-cri-ini'),
        data_criacao_fim: v('e-cri-fim'),
        data_aprovacao_inicio: v('e-apr-ini'),
        data_aprovacao_fim: v('e-apr-fim'),
        data_inscricao_inicio: v('e-ins-ini'),
        data_inscricao_fim: v('e-ins-fim'),
      }),
      salvarConfig('clubinho_config', {
        ano_letivo: ANO,
        vagas_por_clubinho: parseInt(v('c-vagas')),
        duracao_meses: parseInt(v('c-dur')),
        data_criacao_inicio: v('c-cri-ini'),
        data_criacao_fim: v('c-cri-fim'),
        data_aprovacao_inicio: v('c-apr-ini'),
        data_aprovacao_fim: v('c-apr-fim'),
        data_inscricao_inicio: v('c-ins-ini'),
        data_inscricao_fim: v('c-ins-fim'),
      }),
    ]);

    CONFIGS = await getConfigs(ANO);
    console.log('✅ Configurações salvas com sucesso!');
    mostrarToast('Configurações salvas!');
  } catch (erro) {
    console.error('❌ Erro ao salvar:', erro);
    mostrarToast(`Erro: ${erro.message || 'Falha ao salvar configurações.'}`, 'erro');
  }
}

init();