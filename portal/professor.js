// =============================================
// PORTAL ATLAS — professor.js
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
    if (!PERFIL || PERFIL.tipo !== 'professor') { window.location.href = 'index.html'; return; }

    CONFIGS = await getConfigs(ANO);
    document.getElementById('user-welcome').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`;
  } catch (erro) {
    console.error('❌ Erro ao inicializar professor:', erro);
    mostrarToast('Erro ao carregar. Recarregando...', 'erro');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  }
}

function abrirModal(tipo) {
  document.getElementById('modal-container').style.display = 'flex';
  document.getElementById('modal-body').innerHTML = '<div class="loading">Carregando...</div>';

  const titulos = { 'minhas-eletivas': 'Minhas Eletivas', 'nova-eletiva': 'Propor Nova Eletiva' };
  document.getElementById('modal-title').textContent = titulos[tipo];

  if (tipo === 'minhas-eletivas') renderMinhasEletivas();
  else if (tipo === 'nova-eletiva') renderNovaEletiva();
}

function fecharModal() {
  document.getElementById('modal-container').style.display = 'none';
}

document.getElementById('modal-container').addEventListener('click', e => {
  if (e.target.id === 'modal-container') fecharModal();
});

// =============================================
// MINHAS ELETIVAS
// =============================================

async function renderMinhasEletivas() {
  const body = document.getElementById('modal-body');
  try {
    const { data, error } = await db
      .from('eletivas')
      .select('*, eletiva_matriculas(count)')
      .eq('professor_id', PERFIL.id)
      .eq('ano_letivo', ANO)
      .order('titulo');

    if (error) throw error;

    if (!data.length) {
      body.innerHTML = '<p class="vazio">Você ainda não tem eletivas cadastradas.</p>';
      return;
    }

    const statusLabel = { pendente: '⏳ Aguardando aprovação', aprovada: '✅ Aprovada', reprovada: '❌ Reprovada' };

    body.innerHTML = `
      <div class="lista-itens">
        ${data.map(e => `
          <div class="item-card">
            <h3>${e.titulo}</h3>
            ${e.descricao ? `<p>${e.descricao}</p>` : ''}
            <p class="vagas-info">${statusLabel[e.status]} · ${e.eletiva_matriculas?.[0]?.count || 0} inscrito(s)</p>
          </div>`).join('')}
      </div>`;
  } catch {
    body.innerHTML = '<div class="alert alert--erro">Erro ao carregar eletivas.</div>';
  }
}

// =============================================
// NOVA ELETIVA
// =============================================

function renderNovaEletiva() {
  const body = document.getElementById('modal-body');
  const config = CONFIGS.eletiva;
  const criacaoAberta = periodoAtivo(config?.data_criacao_inicio, config?.data_criacao_fim);

  if (!criacaoAberta) {
    body.innerHTML = `
      <div class="alert-blocked">
        <span>💡</span>
        <h3>Período de propostas encerrado.</h3>
        <p>${config ? `Criação: ${formatarData(config.data_criacao_inicio)} a ${formatarData(config.data_criacao_fim)}` : 'Sem período configurado.'}</p>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="field"><label>Título da eletiva</label><input type="text" id="elet-titulo" placeholder="Ex: Robótica Aplicada"></div>
    <div class="field"><label>Descrição</label><textarea id="elet-desc" rows="4" placeholder="Descreva a eletiva..."></textarea></div>
    <button class="btn btn-primary" onclick="submitEletiva()">Enviar para aprovação</button>`;
}

async function submitEletiva() {
  const titulo = document.getElementById('elet-titulo').value.trim();
  const desc = document.getElementById('elet-desc').value.trim();

  if (!titulo) { mostrarToast('Informe o título da eletiva.', 'erro'); return; }

  try {
    await window.submitEletiva(titulo, desc, PERFIL.id, ANO);
    mostrarToast('Eletiva enviada para aprovação!');
    fecharModal();
  } catch (e) {
    console.error('Erro ao enviar eletiva:', e);
    mostrarToast(`Erro: ${e.message || 'Erro ao enviar eletiva.'}`, 'erro');
  }
}

init();