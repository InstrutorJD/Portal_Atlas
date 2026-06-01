// =============================================
// PORTAL ATLAS — utils.js
// Funções utilitárias compartilhadas
// =============================================

/**
 * Verifica se a data atual está dentro de um período (inicio e fim)
 * @param {string|Date} inicio - Data de início (ISO 8601 ou Date)
 * @param {string|Date} fim - Data de fim (ISO 8601 ou Date)
 * @returns {boolean} true se hoje está entre as datas
 */
function periodoAtivo(inicio, fim) {
  if (!inicio || !fim) return false;
  const hoje = new Date();
  return new Date(inicio) <= hoje && hoje <= new Date(fim);
}

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 * @param {string|Date} data - Data a formatar
 * @returns {string} Data formatada ou string vazia se inválida
 */
function formatarData(data) {
  if (!data) return '';
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
 * @param {string} mensagem - Texto a exibir
 * @param {string} tipo - 'sucesso' ou 'erro' (padrão: 'sucesso')
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = mensagem;
  toast.className = `toast toast--${tipo}`;
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
