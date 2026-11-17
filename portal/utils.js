// =============================================
// PORTAL ATLAS — utils.js
// Funções utilitárias compartilhadas
// =============================================

/**
 * Verifica se a data atual está dentro de um período (inicio e fim)
 * ✅ CORRIGIDO: Agora compara datas em string ISO para evitar problemas de timezone
 * @param {string|Date} inicio - Data de início (ISO 8601 ou Date)
 * @param {string|Date} fim - Data de fim (ISO 8601 ou Date)
 * @returns {boolean} true se hoje está entre as datas
 */
function periodoAtivo(inicio, fim) {
  if (!inicio || !fim) return false;
  
  // Converter para strings no formato YYYY-MM-DD para evitar timezone issues
  const hojeStr = new Date().toISOString().split('T')[0];
  const inicioStr = String(inicio).split('T')[0];
  const fimStr = String(fim).split('T')[0];
  
  // Comparar como strings (YYYY-MM-DD) - mais seguro que objetos Date
  return inicioStr <= hojeStr && hojeStr <= fimStr;
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
