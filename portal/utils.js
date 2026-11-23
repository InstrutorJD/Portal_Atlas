// =============================================
// PORTAL ATLAS — utils.js
// Funções utilitárias compartilhadas
// =============================================

/**
 * Data de hoje no fuso do navegador, no formato YYYY-MM-DD.
 * Não usar toISOString(): ela devolve a data em UTC, que no Brasil (UTC-3)
 * já é o dia seguinte a partir das 21h.
 * @returns {string}
 */
function hojeLocalISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Verifica se a data atual está dentro de um período (inicio e fim, inclusive)
 * As colunas são DATE (YYYY-MM-DD), então a comparação é feita como texto
 * contra a data local de hoje.
 * @param {string} inicio - Data de início (YYYY-MM-DD)
 * @param {string} fim - Data de fim (YYYY-MM-DD)
 * @returns {boolean} true se hoje está entre as datas
 */
function periodoAtivo(inicio, fim) {
  if (!inicio || !fim) return false;
  const hoje = hojeLocalISO();
  const inicioStr = String(inicio).slice(0, 10);
  const fimStr = String(fim).slice(0, 10);
  return inicioStr <= hoje && hoje <= fimStr;
}

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 * @param {string|Date} data - Data a formatar
 * @returns {string} Data formatada ou string vazia se inválida
 */
function formatarData(data) {
  if (!data) return '';
  // "YYYY-MM-DD" sozinho é interpretado como meia-noite UTC e mostraria o dia anterior no Brasil
  const soData = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data);
  if (soData) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  const d = new Date(data);
  if (isNaN(d)) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Retorna o ano letivo (padrão: ano atual)
 * @returns {number} Ano letivo
 */
function anoLetivo() {
  return new Date().getFullYear();
}

/**
 * Mostra um toast (notificação temporária)
 * ✅ CORRIGIDO: Agora cria elemento dinamicamente se não existir
 * @param {string} mensagem - Texto a exibir
 * @param {string} tipo - 'sucesso' ou 'erro' (padrão: 'sucesso')
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
  let toast = document.getElementById('toast');
  
  // Se elemento não existe, criar dinamicamente
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(toast);
  }
  
  toast.textContent = mensagem;
  toast.className = `toast toast--${tipo}`;
  toast.style.display = 'block';
  
  // Cores do toast
  if (tipo === 'sucesso') {
    toast.style.backgroundColor = '#4CAF50';
    toast.style.color = 'white';
  } else if (tipo === 'erro') {
    toast.style.backgroundColor = '#f44336';
    toast.style.color = 'white';
  } else {
    toast.style.backgroundColor = '#2196F3';
    toast.style.color = 'white';
  }
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
