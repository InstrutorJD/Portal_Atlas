// =============================================
// PORTAL ATLAS — relatorios.js
// Relatórios de alunos inscritos (eletivas, clubinhos, tutoria).
// Usado nas telas do coordenador (vê tudo) e do professor (vê as próprias
// eletivas e os próprios tutorados). Depende de supabase.js e utils.js.
// =============================================

const RELATORIO_TIPOS = {
  geral: 'Geral',
  eletivas: 'Eletivas',
  clubinhos: 'Clubinhos',
  tutoria: 'Tutoria',
};

let RELATORIO_ATUAL = null; // { tipo, grupos } — usado por baixar/imprimir

function escHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function ordenarPorNome(lista) {
  return lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

function alunoDaLinha(aluno, data) {
  return {
    nome: aluno?.nome || '(aluno sem acesso)',
    email: aluno?.email || '',
    serie: aluno?.serie || '',
    data: data ? formatarData(data) : '',
  };
}

// ---------- Busca dos dados ----------
// opcoes.professorId: restringe às eletivas e tutorados desse colaborador.

async function dadosRelatorioEletivas(ano, opcoes) {
  let query = db.from('eletivas')
    .select('id, titulo, colaboradores(nome), eletiva_matriculas(matriculado_em, alunos(nome, email, serie))')
    .eq('ano_letivo', ano)
    .eq('status', 'aprovada')
    .order('titulo');
  if (opcoes.professorId) query = query.eq('professor_id', opcoes.professorId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((e) => ({
    titulo: e.titulo,
    subtitulo: `Prof. ${e.colaboradores?.nome || '—'}`,
    alunos: ordenarPorNome((e.eletiva_matriculas || []).map((m) => alunoDaLinha(m.alunos, m.matriculado_em))),
  }));
}

async function dadosRelatorioClubinhos(ano) {
  const { data, error } = await db.from('clubinhos')
    .select('id, nome, validade_ate, lider:alunos!lider_id(nome), clubinho_membros(entrou_em, alunos(nome, email, serie))')
    .eq('ano_letivo', ano)
    .eq('status', 'aprovado')
    .order('nome');
  if (error) throw error;
  return (data || []).map((c) => ({
    titulo: c.nome,
    subtitulo: `Líder: ${c.lider?.nome || '—'}${c.validade_ate ? ` · válido até ${formatarData(c.validade_ate)}` : ''}`,
    alunos: ordenarPorNome((c.clubinho_membros || []).map((m) => alunoDaLinha(m.alunos, m.entrou_em))),
  }));
}

async function dadosRelatorioTutoria(ano, opcoes) {
  let tutoresQuery = db.from('colaboradores').select('id, nome').eq('is_tutor', true).order('nome');
  let vinculosQuery = db.from('tutoria_vinculos')
    .select('colaborador_id, criado_em, alunos(nome, email, serie)')
    .eq('ano_letivo', ano);
  if (opcoes.professorId) {
    tutoresQuery = tutoresQuery.eq('id', opcoes.professorId);
    vinculosQuery = vinculosQuery.eq('colaborador_id', opcoes.professorId);
  }

  const [tutores, vinculos] = await Promise.all([tutoresQuery, vinculosQuery]);
  if (tutores.error) throw tutores.error;
  if (vinculos.error) throw vinculos.error;

  return (tutores.data || []).map((t) => ({
    titulo: t.nome,
    subtitulo: 'Tutor',
    alunos: ordenarPorNome((vinculos.data || [])
      .filter((v) => v.colaborador_id === t.id)
      .map((v) => alunoDaLinha(v.alunos, v.criado_em))),
  }));
}

async function carregarRelatorio(tipo, ano, opcoes = {}) {
  if (tipo === 'eletivas') return dadosRelatorioEletivas(ano, opcoes);
  if (tipo === 'clubinhos') return dadosRelatorioClubinhos(ano, opcoes);
  if (tipo === 'tutoria') return dadosRelatorioTutoria(ano, opcoes);
  return [];
}

// ---------- Tela ----------
// tipos: quais abas mostrar (ex.: ['eletivas', 'tutoria'] para o professor).

async function renderRelatorio(tipos, tipoAtivo, ano, opcoes = {}) {
  const body = document.getElementById('modal-body');
  const tipo = tipoAtivo || tipos[0];
  const abas = htmlAbasRelatorio(tipos, tipo, ano, opcoes);
  if (tipo === 'geral') return renderRelatorioGeral(abas, ano);

  body.innerHTML = `<div class="relatorio"><div class="relatorio__abas">${abas}</div><div class="loading">Carregando...</div></div>`;

  try {
    const grupos = await carregarRelatorio(tipo, ano, opcoes);
    RELATORIO_ATUAL = { tipo, ano, grupos };
    const total = grupos.reduce((soma, g) => soma + g.alunos.length, 0);

    body.innerHTML = `
      <div class="relatorio">
        <div class="relatorio__abas">${abas}</div>
        <div class="relatorio__resumo">
          <p><strong>${total}</strong> aluno${total !== 1 ? 's' : ''} inscrito${total !== 1 ? 's' : ''}
             em <strong>${grupos.length}</strong> ${RELATORIO_TIPOS[tipo].toLowerCase()} · ${ano}</p>
          <div class="relatorio__acoes">
            <button class="btn btn-outline btn--sm" onclick="baixarRelatorioCSV()" ${total ? '' : 'disabled'}>⬇️ Baixar planilha</button>
            <button class="btn btn-outline btn--sm" onclick="imprimirRelatorio()" ${grupos.length ? '' : 'disabled'}>🖨️ Imprimir</button>
          </div>
        </div>
        ${grupos.length === 0 ? '<p class="vazio">Nada encontrado para este ano.</p>' : htmlGruposRelatorio(grupos)}
      </div>`;
  } catch (e) {
    console.error('Erro ao gerar relatório:', e);
    body.querySelector('.loading').outerHTML = '<div class="alert alert--erro">Erro ao gerar o relatório.</div>';
  }
}

function htmlAbasRelatorio(tipos, tipo, ano, opcoes) {
  return tipos.map((t) => `
    <button class="btn btn--sm ${t === tipo ? 'btn-primary' : 'btn-outline'}"
      onclick='renderRelatorio(${JSON.stringify(tipos)}, "${t}", ${ano}, ${JSON.stringify(opcoes)})'>
      ${RELATORIO_TIPOS[t]}
    </button>`).join('');
}

function htmlGruposRelatorio(grupos) {
  return grupos.map((g) => `
    <section class="relatorio__grupo">
      <h3>${escHtml(g.titulo)} <span class="relatorio__contagem">${g.alunos.length}</span></h3>
      <p class="vagas-info">${escHtml(g.subtitulo)}</p>
      ${g.alunos.length === 0 ? '<p class="vazio">Nenhum aluno inscrito.</p>' : `
        <table class="relatorio__tabela">
          <thead><tr><th>#</th><th>Aluno</th><th>E-mail</th><th>Série</th><th>Inscrição</th></tr></thead>
          <tbody>
            ${g.alunos.map((a, i) => `
              <tr><td>${i + 1}</td><td>${escHtml(a.nome)}</td><td>${escHtml(a.email)}</td><td>${escHtml(a.serie)}</td><td>${escHtml(a.data)}</td></tr>`).join('')}
          </tbody>
        </table>`}
    </section>`).join('');
}

// ---------- Exportar ----------

function baixarRelatorioCSV() {
  if (!RELATORIO_ATUAL) return;
  if (RELATORIO_ATUAL.tipo === 'geral') return baixarRelatorioGeralCSV();
  const { tipo, ano, grupos } = RELATORIO_ATUAL;
  const coluna = { eletivas: 'Eletiva', clubinhos: 'Clubinho', tutoria: 'Tutor' }[tipo];
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const linhas = [[coluna, 'Aluno', 'E-mail', 'Série', 'Data de inscrição'].map(campo).join(';')];
  grupos.forEach((g) => g.alunos.forEach((a) => {
    linhas.push([g.titulo, a.nome, a.email, a.serie, a.data].map(campo).join(';'));
  }));

  // BOM + ";" para o Excel em português abrir com acentos e colunas certas
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-${tipo}-${ano}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function imprimirRelatorio() {
  if (!RELATORIO_ATUAL) return;
  const { tipo, ano, grupos } = RELATORIO_ATUAL;
  const conteudo = tipo === 'geral'
    ? `<p class="vagas-info">Filtro: ${escHtml(FILTROS_GERAL[RELATORIO_ATUAL.filtro].rotulo)}${RELATORIO_ATUAL.serie ? ` · ${escHtml(RELATORIO_ATUAL.serie)}` : ''} · ${RELATORIO_ATUAL.visiveis.length} aluno(s)</p>${htmlTabelaGeral(RELATORIO_ATUAL.visiveis)}`
    : htmlGruposRelatorio(grupos);
  const janela = window.open('', '_blank');
  if (!janela) { mostrarToast('Permita pop-ups para imprimir o relatório.', 'erro'); return; }

  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Relatório de ${RELATORIO_TIPOS[tipo]} ${ano}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h3 { font-size: 15px; margin: 20px 0 2px; }
      .vagas-info, .relatorio__contagem { color: #555; font-size: 12px; }
      .vazio { color: #777; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
      th { background: #f1f1f1; }
      .falta { color: #b91c1c; font-weight: bold; }
      section { break-inside: avoid; }
    </style></head><body>
    <h1>Portal Atlas · Relatório de ${RELATORIO_TIPOS[tipo]} · ${ano}</h1>
    <p class="vagas-info">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    ${conteudo}
    </body></html>`);
  janela.document.close();
  janela.focus();
  janela.print();
}

// =============================================
// RELATÓRIO GERAL (só coordenação): situação de cada aluno
// =============================================

const FILTROS_GERAL = {
  pendentes: { rotulo: 'Com pendência', teste: (a) => !a.tutor || !a.eletiva || !a.clubinho },
  'sem-tutor': { rotulo: 'Sem tutor', teste: (a) => !a.tutor },
  'sem-eletiva': { rotulo: 'Sem eletiva', teste: (a) => !a.eletiva },
  'sem-clubinho': { rotulo: 'Sem clubinho', teste: (a) => !a.clubinho },
  completos: { rotulo: 'Tudo certo', teste: (a) => a.tutor && a.eletiva && a.clubinho },
  todos: { rotulo: 'Todos', teste: () => true },
};

async function dadosRelatorioGeral(ano) {
  const [alunos, vinculos, matriculas, membros, lideres] = await Promise.all([
    db.from('alunos').select('id, nome, email, serie').order('nome'),
    db.from('tutoria_vinculos').select('aluno_id, colaboradores(nome)').eq('ano_letivo', ano),
    db.from('eletiva_matriculas').select('aluno_id, eletivas(titulo)').eq('ano_letivo', ano),
    db.from('clubinho_membros').select('aluno_id, clubinhos(nome)').eq('ano_letivo', ano),
    db.from('clubinhos').select('lider_id, nome').eq('ano_letivo', ano).eq('status', 'aprovado'),
  ]);
  [alunos, vinculos, matriculas, membros, lideres].forEach((r) => { if (r.error) throw r.error; });

  const porAluno = (lista, valor) => new Map((lista.data || []).map((r) => [r.aluno_id, valor(r)]));
  const tutor = porAluno(vinculos, (r) => r.colaboradores?.nome || '(tutor)');
  const eletiva = porAluno(matriculas, (r) => r.eletivas?.titulo || '(eletiva)');
  const clubinho = porAluno(membros, (r) => r.clubinhos?.nome || '(clubinho)');
  // Líder de clubinho aprovado conta como participante, mesmo sem estar em clubinho_membros
  (lideres.data || []).forEach((c) => {
    if (c.lider_id && !clubinho.has(c.lider_id)) clubinho.set(c.lider_id, `${c.nome} (líder)`);
  });

  return ordenarPorNome((alunos.data || []).map((a) => ({
    nome: a.nome,
    email: a.email,
    serie: a.serie || '',
    tutor: tutor.get(a.id) || null,
    eletiva: eletiva.get(a.id) || null,
    clubinho: clubinho.get(a.id) || null,
  })));
}

async function renderRelatorioGeral(abas, ano) {
  const body = document.getElementById('modal-body');
  body.innerHTML = `<div class="relatorio"><div class="relatorio__abas">${abas}</div><div class="loading">Carregando...</div></div>`;
  try {
    const alunos = await dadosRelatorioGeral(ano);
    RELATORIO_ATUAL = { tipo: 'geral', ano, abas, alunos, filtro: 'pendentes', serie: '', visiveis: [] };
    desenharRelatorioGeral();
  } catch (e) {
    console.error('Erro ao gerar relatório geral:', e);
    body.querySelector('.loading').outerHTML = '<div class="alert alert--erro">Erro ao gerar o relatório.</div>';
  }
}

function filtrarRelatorioGeral(campo, valor) {
  RELATORIO_ATUAL[campo] = valor;
  desenharRelatorioGeral();
}

function desenharRelatorioGeral() {
  const r = RELATORIO_ATUAL;
  const daSerie = r.alunos.filter((a) => !r.serie || a.serie === r.serie);
  r.visiveis = daSerie.filter(FILTROS_GERAL[r.filtro].teste);
  const series = [...new Set(r.alunos.map((a) => a.serie).filter(Boolean))].sort();
  const conta = (f) => daSerie.filter(FILTROS_GERAL[f].teste).length;

  document.getElementById('modal-body').innerHTML = `
    <div class="relatorio">
      <div class="relatorio__abas">${r.abas}</div>
      <div class="relatorio__cards">
        ${['sem-tutor', 'sem-eletiva', 'sem-clubinho', 'completos'].map((f) => `
          <button class="relatorio__card ${r.filtro === f ? 'relatorio__card--ativo' : ''}" onclick="filtrarRelatorioGeral('filtro', '${f}')">
            <strong>${conta(f)}</strong><span>${FILTROS_GERAL[f].rotulo}</span>
          </button>`).join('')}
      </div>
      <div class="relatorio__resumo">
        <div class="relatorio__filtros">
          <select onchange="filtrarRelatorioGeral('filtro', this.value)" aria-label="Situação">
            ${Object.entries(FILTROS_GERAL).map(([k, f]) => `<option value="${k}" ${k === r.filtro ? 'selected' : ''}>${f.rotulo} (${conta(k)})</option>`).join('')}
          </select>
          ${series.length > 1 ? `
            <select onchange="filtrarRelatorioGeral('serie', this.value)" aria-label="Série">
              <option value="">Todas as séries</option>
              ${series.map((s) => `<option value="${escHtml(s)}" ${s === r.serie ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
            </select>` : ''}
        </div>
        <div class="relatorio__acoes">
          <button class="btn btn-outline btn--sm" onclick="baixarRelatorioCSV()" ${r.visiveis.length ? '' : 'disabled'}>⬇️ Baixar planilha</button>
          <button class="btn btn-outline btn--sm" onclick="imprimirRelatorio()" ${r.visiveis.length ? '' : 'disabled'}>🖨️ Imprimir</button>
        </div>
      </div>
      <p class="vagas-info"><strong>${r.visiveis.length}</strong> de ${daSerie.length} aluno(s) · ${r.ano}</p>
      ${r.visiveis.length ? `<div class="relatorio__grupo">${htmlTabelaGeral(r.visiveis)}</div>` : '<p class="vazio">Nenhum aluno nesta situação.</p>'}
    </div>`;
}

function htmlTabelaGeral(alunos) {
  const celula = (v) => (v ? escHtml(v) : '<span class="falta">— falta</span>');
  return `
    <table class="relatorio__tabela">
      <thead><tr><th>#</th><th>Aluno</th><th>Série</th><th>Tutor</th><th>Eletiva</th><th>Clubinho</th></tr></thead>
      <tbody>
        ${alunos.map((a, i) => `
          <tr><td>${i + 1}</td><td>${escHtml(a.nome)}<br><small class="vagas-info">${escHtml(a.email)}</small></td><td>${escHtml(a.serie)}</td>
              <td>${celula(a.tutor)}</td><td>${celula(a.eletiva)}</td><td>${celula(a.clubinho)}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

function baixarRelatorioGeralCSV() {
  const r = RELATORIO_ATUAL;
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Aluno', 'E-mail', 'Série', 'Tutor', 'Eletiva', 'Clubinho'].map(campo).join(';')];
  r.visiveis.forEach((a) => linhas.push(
    [a.nome, a.email, a.serie, a.tutor || 'FALTA', a.eletiva || 'FALTA', a.clubinho || 'FALTA'].map(campo).join(';')
  ));
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio-geral-${r.filtro}-${r.ano}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

window.filtrarRelatorioGeral = filtrarRelatorioGeral;
window.renderRelatorio = renderRelatorio;
window.baixarRelatorioCSV = baixarRelatorioCSV;
window.imprimirRelatorio = imprimirRelatorio;
