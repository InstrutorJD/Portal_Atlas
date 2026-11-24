// =============================================
// PORTAL ATLAS — coordenador.js
// =============================================
// Funções utilitárias carregadas de utils.js
// Não há fallbacks duplicados aqui

let PERFIL = null;
let CONFIGS = null;
let ANO = anoLetivo();

async function init() {
  try {
    const sessao = await getSessao();
    if (!sessao) { window.location.href = 'index.html'; return; }

    PERFIL = await getPerfil();
    if (!PERFIL || PERFIL.tipo !== 'coordenador') { window.location.href = 'index.html'; return; }

    CONFIGS = await getConfigs(ANO);
    document.getElementById('user-welcome').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`;
  } catch (erro) {
    console.error('❌ Erro ao inicializar coordenador:', erro);
    mostrarToast('Erro ao carregar. Recarregando...', 'erro');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  }
}

function abrirModal(tipo) {
  document.getElementById('modal-container').style.display = 'flex';
  document.getElementById('modal-body').innerHTML = '<div class="loading">Carregando...</div>';

  const titulos = {
    tutores: 'Gerenciar Tutores',
    eletivas: 'Aprovar Eletivas',
    clubinhos: 'Aprovar Clubinhos',
    periodos: 'Períodos e Vagas',
    relatorios: 'Relatórios',
  };
  document.getElementById('modal-title').textContent = titulos[tipo];

  if (tipo === 'tutores') renderTutores();
  else if (tipo === 'eletivas') renderEletivas();
  else if (tipo === 'clubinhos') renderClubbinhos();
  else if (tipo === 'periodos') renderPeriodos();
  else if (tipo === 'relatorios') renderRelatorio(['geral', 'eletivas', 'clubinhos', 'tutoria'], 'geral', ANO);
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
    const colaboradores = (await getTodosColaboradores())
      .filter(c => !c.is_coordenador)
      .sort((a, b) => (b.is_tutor - a.is_tutor) || a.nome.localeCompare(b.nome));

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
      <h3 style="margin-bottom:16px">Colaboradores cadastrados</h3>
      <div class="lista-itens">
        ${colaboradores.length === 0 ? '<p class="vazio">Nenhum colaborador cadastrado.</p>' :
          colaboradores.map(c => `
            <div class="item-card">
              <h3>${c.nome}</h3>
              <p>
                <span class="tag ${c.is_tutor ? '' : 'tag--off'}">${c.is_tutor ? 'Tutor' : 'Não é tutor'}</span>
                ${c.is_professor ? '<span class="tag">Professor</span>' : ''}
              </p>
              <p class="vagas-info">${c.cargo} ${c.email ? `· ${c.email}` : '· sem acesso ao portal'}</p>
              <div class="item-card__acoes">
                <button class="btn btn-outline btn--sm" onclick="alternarTutor('${c.id}', ${!c.is_tutor})">
                  ${c.is_tutor ? 'Remover de tutor' : 'Tornar tutor'}
                </button>
              </div>
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
    mostrarToast(isTutor ? 'Tutor adicionado!' : 'Colaborador adicionado (não marcado como tutor).');
    renderTutores();
  } catch (e) {
    console.error('Erro ao salvar colaborador:', e);
    mostrarToast(/unique|duplicate/i.test(e.message || '') ? 'E-mail já cadastrado.' : 'Erro ao salvar.', 'erro');
  }
}

async function alternarTutor(id, tornarTutor) {
  try {
    await atualizarColaborador(id, { is_tutor: tornarTutor });
    mostrarToast(tornarTutor ? 'Agora é tutor.' : 'Removido dos tutores.');
    renderTutores();
  } catch (e) {
    console.error('Erro ao atualizar colaborador:', e);
    mostrarToast('Erro ao atualizar.', 'erro');
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

  const hoje = new Date();
  const ano  = hoje.getFullYear();
  const mes  = String(hoje.getMonth() + 1).padStart(2, '0');
  const INI  = `${ano}-${mes}-01`;
  const FIM  = `${ano}-${mes}-${new Date(ano, hoje.getMonth() + 1, 0).getDate()}`;

  const range = (iniId, fimId, iniVal, fimVal) => `
    <div class="cfg-periodo__range">
      <div class="cfg-periodo__field">
        <label>Início</label>
        <input type="date" id="${iniId}" value="${iniVal || INI}">
      </div>
      <div class="cfg-periodo__sep">→</div>
      <div class="cfg-periodo__field">
        <label>Fim</label>
        <input type="date" id="${fimId}" value="${fimVal || FIM}">
      </div>
    </div>`;

  body.innerHTML = `
    <div class="cfg-form">

      <!-- TUTORIA -->
      <div class="cfg-card cfg-card--blue">
        <div class="cfg-card__header"><span>📖</span> Tutoria</div>
        <div class="cfg-card__body">
          <div class="cfg-vagas">
            <div class="cfg-vagas__item">
              <label>Vagas por tutor</label>
              <input type="number" id="t-vagas" value="${t.vagas_por_tutor || 5}" min="1">
            </div>
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">📅 Inscrições</div>
            ${range('t-ins-ini', 't-ins-fim', t.data_inscricao_inicio, t.data_inscricao_fim)}
          </div>
        </div>
      </div>

      <!-- ELETIVAS -->
      <div class="cfg-card cfg-card--purple">
        <div class="cfg-card__header"><span>💡</span> Eletivas</div>
        <div class="cfg-card__body">
          <div class="cfg-vagas">
            <div class="cfg-vagas__item">
              <label>Vagas por eletiva</label>
              <input type="number" id="e-vagas" value="${e.vagas_por_eletiva || 10}" min="1">
            </div>
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">✏️ Criação de propostas</div>
            ${range('e-cri-ini', 'e-cri-fim', e.data_criacao_inicio, e.data_criacao_fim)}
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">✅ Aprovação</div>
            ${range('e-apr-ini', 'e-apr-fim', e.data_aprovacao_inicio, e.data_aprovacao_fim)}
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">📅 Inscrições</div>
            ${range('e-ins-ini', 'e-ins-fim', e.data_inscricao_inicio, e.data_inscricao_fim)}
          </div>
        </div>
      </div>

      <!-- CLUBINHOS -->
      <div class="cfg-card cfg-card--green">
        <div class="cfg-card__header"><span>🤝</span> Clubinhos</div>
        <div class="cfg-card__body">
          <div class="cfg-vagas">
            <div class="cfg-vagas__item">
              <label>Vagas por clubinho</label>
              <input type="number" id="c-vagas" value="${c.vagas_por_clubinho || 10}" min="1">
            </div>
            <div class="cfg-vagas__item">
              <label>Duração</label>
              <input type="number" id="c-dur" value="${c.duracao_meses || 6}" min="1">
              <span class="cfg-unit">meses</span>
            </div>
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">✏️ Criação de clubinhos</div>
            ${range('c-cri-ini', 'c-cri-fim', c.data_criacao_inicio, c.data_criacao_fim)}
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">✅ Aprovação</div>
            ${range('c-apr-ini', 'c-apr-fim', c.data_aprovacao_inicio, c.data_aprovacao_fim)}
          </div>
          <div class="cfg-periodo">
            <div class="cfg-periodo__tag">📅 Inscrições</div>
            ${range('c-ins-ini', 'c-ins-fim', c.data_inscricao_inicio, c.data_inscricao_fim)}
          </div>
        </div>
      </div>

      <div class="cfg-save">
        <button class="btn btn-primary" onclick="salvarPeriodos()">💾 Salvar configurações</button>
      </div>

    </div>`;
}

// Retorna a primeira mensagem de erro encontrada, ou null se tudo estiver válido
function validarPeriodos(v) {
  const periodos = [
    ['t-ins-ini', 't-ins-fim', 'Tutoria · Inscrições'],
    ['e-cri-ini', 'e-cri-fim', 'Eletivas · Criação'],
    ['e-apr-ini', 'e-apr-fim', 'Eletivas · Aprovação'],
    ['e-ins-ini', 'e-ins-fim', 'Eletivas · Inscrições'],
    ['c-cri-ini', 'c-cri-fim', 'Clubinhos · Criação'],
    ['c-apr-ini', 'c-apr-fim', 'Clubinhos · Aprovação'],
    ['c-ins-ini', 'c-ins-fim', 'Clubinhos · Inscrições'],
  ];
  for (const [ini, fim, nome] of periodos) {
    if (!v(ini) || !v(fim)) return `${nome}: preencha as datas de início e fim.`;
    if (v(fim) < v(ini)) return `${nome}: a data de fim é anterior à de início.`;
  }

  const numeros = [
    ['t-vagas', 'Vagas por tutor'],
    ['e-vagas', 'Vagas por eletiva'],
    ['c-vagas', 'Vagas por clubinho'],
    ['c-dur', 'Duração do clubinho'],
  ];
  for (const [id, nome] of numeros) {
    const n = Number(v(id));
    if (!Number.isInteger(n) || n < 1) return `${nome}: informe um número inteiro maior que zero.`;
  }
  return null;
}

async function salvarPeriodos() {
  const v = id => document.getElementById(id).value;

  const erro = validarPeriodos(v);
  if (erro) { mostrarToast(erro, 'erro'); return; }

  try {
    console.log('💾 Iniciando salvamento de configurações...');
    
    await Promise.all([
      salvarConfig('tutoria_config', {
        ano_letivo: ANO,
        vagas_por_tutor: parseInt(v('t-vagas')),
        data_criacao_inicio: v('t-ins-ini'),   // tutoria não tem criação separada — usa mesmo período
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