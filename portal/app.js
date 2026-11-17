// =============================================
// PORTAL ATLAS — app.js (Painel do Aluno)
// =============================================
// Funções utilitárias carregadas de utils.js
// Não há fallbacks duplicados aqui

let PERFIL = null;
let CONFIGS = null;
let ANO = anoLetivo();

// =============================================
// INICIALIZAÇÃO
// =============================================

async function init() {
  try {
    const sessao = await getSessao();
    if (!sessao) { window.location.href = 'index.html'; return; }

    PERFIL = await getPerfil();
    if (!PERFIL || PERFIL.tipo !== 'aluno') { window.location.href = 'index.html'; return; }

    CONFIGS = await getConfigs(ANO);

    document.getElementById('user-welcome').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`;
    atualizarStatusGeral();
    await atualizarStatusCards();
  } catch (erro) {
    console.error('❌ Erro ao inicializar app:', erro);
    mostrarToast('Erro ao carregar. Recarregando...', 'erro');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  }
}

function atualizarStatusGeral() {
  const el = document.getElementById('status-geral');
  const algumAberto =
    periodoAtivo(CONFIGS.tutoria?.data_inscricao_inicio, CONFIGS.tutoria?.data_inscricao_fim) ||
    periodoAtivo(CONFIGS.eletiva?.data_inscricao_inicio, CONFIGS.eletiva?.data_inscricao_fim) ||
    periodoAtivo(CONFIGS.clubinho?.data_inscricao_inicio, CONFIGS.clubinho?.data_inscricao_fim) ||
    periodoAtivo(CONFIGS.clubinho?.data_criacao_inicio, CONFIGS.clubinho?.data_criacao_fim);

  el.textContent = algumAberto ? '🟢 Inscrições abertas' : '🔴 Fora do período';
  el.className = `user-badge ${algumAberto ? 'badge--sucesso' : 'badge--fechado'}`;
}

async function atualizarStatusCards() {
  const [vinculo, matricula, membro] = await Promise.all([
    getVinculoTutoria(PERFIL.id, ANO),
    getMatriculaEletiva(PERFIL.id, ANO),
    getMembroClubinho(PERFIL.id, ANO),
  ]);

  setStatusCard('status-tutoria', vinculo ? `✓ ${vinculo.colaboradores.nome}` : null,
    periodoAtivo(CONFIGS.tutoria?.data_inscricao_inicio, CONFIGS.tutoria?.data_inscricao_fim));

  setStatusCard('status-eletiva', matricula ? `✓ ${matricula.eletivas.titulo}` : null,
    periodoAtivo(CONFIGS.eletiva?.data_inscricao_inicio, CONFIGS.eletiva?.data_inscricao_fim));

  const inscricaoAberta = periodoAtivo(CONFIGS.clubinho?.data_inscricao_inicio, CONFIGS.clubinho?.data_inscricao_fim);
  const criacaoAberta = periodoAtivo(CONFIGS.clubinho?.data_criacao_inicio, CONFIGS.clubinho?.data_criacao_fim);
  setStatusCard('status-clubinho', membro ? `✓ ${membro.clubinhos.nome}` : null, inscricaoAberta || criacaoAberta);
}

function setStatusCard(elId, texto, periodoAberto) {
  const el = document.getElementById(elId);
  if (texto) {
    el.textContent = texto;
    el.className = 'card-status card-status--ok';
  } else if (periodoAberto) {
    el.textContent = 'Aberto para inscrição';
    el.className = 'card-status card-status--aberto';
  } else {
    el.textContent = 'Fechado';
    el.className = 'card-status card-status--fechado';
  }
}

// =============================================
// MODAL
// =============================================

function abrirModal(tipo) {
  document.getElementById('modal-container').style.display = 'flex';
  const body = document.getElementById('modal-body');
  body.innerHTML = '<div class="loading">Carregando...</div>';

  const titulos = { tutoria: 'Tutoria', eletivas: 'Eletivas', clubinhos: 'Clubinhos' };
  document.getElementById('modal-title').textContent = titulos[tipo];

  if (tipo === 'tutoria') renderTutoria();
  else if (tipo === 'eletivas') renderEletivas();
  else if (tipo === 'clubinhos') renderClubbinhos();
}

function fecharModal() {
  document.getElementById('modal-container').style.display = 'none';
}

document.getElementById('modal-container').addEventListener('click', e => {
  if (e.target.id === 'modal-container') fecharModal();
});

// =============================================
// TUTORIA
// =============================================

async function renderTutoria() {
  const body = document.getElementById('modal-body');
  const config = CONFIGS.tutoria;
  const inscricaoAberta = periodoAtivo(config?.data_inscricao_inicio, config?.data_inscricao_fim);

  if (!inscricaoAberta) {
    body.innerHTML = bloqueado('📖', 'Período de tutoria fechado.',
      config ? `Inscrições: ${formatarData(config.data_inscricao_inicio)} a ${formatarData(config.data_inscricao_fim)}` : 'Sem período configurado.');
    return;
  }

  try {
    const [tutores, vinculo] = await Promise.all([
      getTutores(),
      getVinculoTutoria(PERFIL.id, ANO),
    ]);

    const vagasPorTutor = config.vagas_por_tutor;

    // Conta vagas por tutor
    const contagensPromises = tutores.map(t => contarAlunosPorTutor(t.id, ANO));
    const contagens = await Promise.all(contagensPromises);

    const selecionadoId = vinculo?.colaborador_id || null;

    body.innerHTML = `
      ${vinculo ? `<div class="alert alert--info">Tutor atual: <strong>${vinculo.colaboradores.nome}</strong>. Você pode alterar enquanto o período estiver aberto.</div>` : ''}
      <div class="lista-itens">
        ${tutores.map((t, i) => {
          const vagas = vagasPorTutor - contagens[i];
          const cheio = vagas <= 0 && t.id !== selecionadoId;
          const selecionado = t.id === selecionadoId;
          return `
            <div class="item-card ${selecionado ? 'item-card--selecionado' : ''} ${cheio ? 'item-card--desabilitado' : ''}">
              <h3>${t.nome}</h3>
              <p class="vagas-info">${cheio ? 'Sem vagas' : `${vagas} vaga${vagas !== 1 ? 's' : ''} disponível${vagas !== 1 ? 'is' : ''}`}</p>
              <button class="btn ${selecionado ? 'btn-success' : 'btn-primary'}"
                ${cheio ? 'disabled' : ''}
                onclick="confirmarTutor('${t.id}', '${t.nome}')">
                ${selecionado ? '✓ Selecionado' : 'Escolher'}
              </button>
            </div>`;
        }).join('')}
      </div>`;
  } catch (e) {
    body.innerHTML = erroGenerico();
  }
}

async function confirmarTutor(tutorId, tutorNome) {
  try {
    await escolherTutor(PERFIL.id, tutorId, ANO);
    mostrarToast(`Tutor ${tutorNome} selecionado com sucesso!`);
    fecharModal();
    await atualizarStatusCards();
  } catch (e) {
    mostrarToast('Erro ao selecionar tutor. Tente novamente.', 'erro');
  }
}

// =============================================
// ELETIVAS
// =============================================

async function renderEletivas() {
  const body = document.getElementById('modal-body');
  const config = CONFIGS.eletiva;
  const inscricaoAberta = periodoAtivo(config?.data_inscricao_inicio, config?.data_inscricao_fim);

  if (!inscricaoAberta) {
    body.innerHTML = bloqueado('💡', 'Período de eletivas fechado.',
      config ? `Inscrições: ${formatarData(config.data_inscricao_inicio)} a ${formatarData(config.data_inscricao_fim)}` : 'Sem período configurado.');
    return;
  }

  try {
    const [eletivas, matricula] = await Promise.all([
      getEletivas(ANO, true),
      getMatriculaEletiva(PERFIL.id, ANO),
    ]);

    const vagasPorEletiva = config.vagas_por_eletiva;
    const contagensPromises = eletivas.map(e => contarMatriculasPorEletiva(e.id, ANO));
    const contagens = await Promise.all(contagensPromises);

    const selecionadoId = matricula?.eletiva_id || null;

    body.innerHTML = `
      ${matricula ? `<div class="alert alert--info">Eletiva atual: <strong>${matricula.eletivas.titulo}</strong>. Você pode alterar enquanto o período estiver aberto.</div>` : ''}
      <div class="lista-itens">
        ${eletivas.map((e, i) => {
          const vagasConfig = e.vagas || vagasPorEletiva;
          const vagas = vagasConfig - contagens[i];
          const cheio = vagas <= 0 && e.id !== selecionadoId;
          const selecionado = e.id === selecionadoId;
          return `
            <div class="item-card ${selecionado ? 'item-card--selecionado' : ''} ${cheio ? 'item-card--desabilitado' : ''}">
              <h3>${e.titulo}</h3>
              ${e.descricao ? `<p>${e.descricao}</p>` : ''}
              <p class="vagas-info">Prof. ${e.colaboradores?.nome || '—'} · ${cheio ? 'Sem vagas' : `${vagas} vaga${vagas !== 1 ? 's' : ''}`}</p>
              <button class="btn ${selecionado ? 'btn-success' : 'btn-primary'}"
                ${cheio ? 'disabled' : ''}
                onclick="confirmarEletiva('${e.id}', '${e.titulo.replace(/'/g, "\\'")}')">
                ${selecionado ? '✓ Inscrito' : 'Inscrever-se'}
              </button>
            </div>`;
        }).join('')}
      </div>`;
  } catch (e) {
    body.innerHTML = erroGenerico();
  }
}

async function confirmarEletiva(eletivaId, titulo) {
  try {
    await matricularEletiva(PERFIL.id, eletivaId, ANO);
    mostrarToast(`Inscrito em "${titulo}"!`);
    fecharModal();
    await atualizarStatusCards();
  } catch (e) {
    mostrarToast('Erro ao se inscrever. Tente novamente.', 'erro');
  }
}

// =============================================
// CLUBINHOS
// =============================================

async function renderClubbinhos() {
  const body = document.getElementById('modal-body');
  const config = CONFIGS.clubinho;
  const inscricaoAberta = periodoAtivo(config?.data_inscricao_inicio, config?.data_inscricao_fim);
  const criacaoAberta = periodoAtivo(config?.data_criacao_inicio, config?.data_criacao_fim);

  if (!inscricaoAberta && !criacaoAberta) {
    body.innerHTML = bloqueado('🤝', 'Período de clubinhos fechado.',
      config ? `Inscrições: ${formatarData(config.data_inscricao_inicio)} a ${formatarData(config.data_inscricao_fim)}` : 'Sem período configurado.');
    return;
  }

  try {
    const [clubinhos, membro] = await Promise.all([
      getClubbinhos(ANO, true),
      getMembroClubinho(PERFIL.id, ANO),
    ]);

    const vagasPorClubinho = config.vagas_por_clubinho;
    const contagensPromises = clubinhos.map(c => contarMembrosPorClubinho(c.id, ANO));
    const contagens = await Promise.all(contagensPromises);

    const selecionadoId = membro?.clubinho_id || null;

    body.innerHTML = `
      ${membro ? `<div class="alert alert--info">Clubinho atual: <strong>${membro.clubinhos.nome}</strong>.</div>` : ''}
      ${criacaoAberta ? `
        <div class="secao-criar">
          <h3>Criar novo clubinho</h3>
          <div class="field"><label>Nome</label><input type="text" id="novo-clube-nome" placeholder="Nome do clubinho"></div>
          <div class="field"><label>Descrição</label><textarea id="novo-clube-desc" placeholder="Sobre o clubinho..." rows="3"></textarea></div>
          <button class="btn btn-primary" onclick="criarNovoClubinho()">Enviar para aprovação</button>
        </div>
        <hr class="divider">
      ` : ''}
      ${inscricaoAberta ? `
        <h3 style="margin-bottom:16px">Clubinhos disponíveis</h3>
        <div class="lista-itens">
          ${clubinhos.length === 0 ? '<p class="vazio">Nenhum clubinho disponível no momento.</p>' :
            clubinhos.map((c, i) => {
              const vagasConfig = c.vagas || vagasPorClubinho;
              const vagas = vagasConfig - contagens[i];
              const cheio = vagas <= 0 && c.id !== selecionadoId;
              const selecionado = c.id === selecionadoId;
              const lider = c.lider_id === PERFIL.id;
              return `
                <div class="item-card ${selecionado ? 'item-card--selecionado' : ''} ${cheio ? 'item-card--desabilitado' : ''}">
                  <h3>${c.nome} ${lider ? '<span class="badge-lider">Líder</span>' : ''}</h3>
                  ${c.descricao ? `<p>${c.descricao}</p>` : ''}
                  <p class="vagas-info">${cheio ? 'Sem vagas' : `${vagas} vaga${vagas !== 1 ? 's' : ''}`} · Válido até ${formatarData(c.validade_ate)}</p>
                  ${!lider ? `<button class="btn ${selecionado ? 'btn-success' : 'btn-primary'}"
                    ${cheio ? 'disabled' : ''}
                    onclick="confirmarClubinho('${c.id}', '${c.nome.replace(/'/g, "\\'")}')">
                    ${selecionado ? '✓ Participando' : 'Entrar'}
                  </button>` : ''}
                </div>`;
            }).join('')}
        </div>
      ` : ''}`;
  } catch (e) {
    body.innerHTML = erroGenerico();
  }
}

async function criarNovoClubinho() {
  const nome = document.getElementById('novo-clube-nome').value.trim();
  const desc = document.getElementById('novo-clube-desc').value.trim();

  if (!nome) { mostrarToast('Informe o nome do clubinho.', 'erro'); return; }

  try {
    await criarClubinho(PERFIL.id, nome, desc, ANO, CONFIGS.clubinho);
    mostrarToast('Clubinho enviado para aprovação da coordenação!');
    fecharModal();
  } catch (e) {
    mostrarToast('Erro ao criar clubinho. Tente novamente.', 'erro');
  }
}

async function confirmarClubinho(clubinhoId, nome) {
  try {
    await entrarClubinho(PERFIL.id, clubinhoId, ANO);
    mostrarToast(`Você entrou em "${nome}"!`);
    fecharModal();
    await atualizarStatusCards();
  } catch (e) {
    mostrarToast('Erro ao entrar no clubinho. Tente novamente.', 'erro');
  }
}

// =============================================
// HELPERS DE RENDERIZAÇÃO
// =============================================

function bloqueado(icone, titulo, subtitulo) {
  return `
    <div class="alert-blocked">
      <span>${icone}</span>
      <h3>${titulo}</h3>
      <p>${subtitulo}</p>
    </div>`;
}

function erroGenerico() {
  return `<div class="alert alert--erro">Erro ao carregar dados. Tente novamente.</div>`;
}

// =============================================
// START
// =============================================

init();