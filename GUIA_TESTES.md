# 📖 GUIA DE EXECUÇÃO - TESTES DE SISTEMA

## 🚀 Como Usar

### Opção 1: Interface Web (Recomendado)

1. **Abrir no navegador:**
   ```bash
   # Linux/Mac
   open teste-sistema.html
   
   # Windows
   start teste-sistema.html
   
   # VSCode
   code teste-sistema.html
   # Depois: Ctrl+K Ctrl+O para abrir em navegador
   ```

2. **Clicar em "▶️ Executar Todos os Testes"**

3. **Observar resultados em tempo real** no console

4. **Exportar relatório** com botão "📥 Exportar Resultados"

---

### Opção 2: Console do Navegador

1. Abrir DevTools (F12)
2. Ir para aba "Console"
3. Executar:
   ```javascript
   executarTodosTestes();
   ```

4. Resultados aparecem no console com cores:
   - ✅ Verde = Passou
   - ❌ Vermelho = Falhou
   - ⚠️ Amarelo = Aviso
   - ℹ️ Azul = Info

---

### Opção 3: Testes Individuais

```javascript
// No console do navegador
teste1_periodoAtivo();
teste2_restricaoEletiva();
teste3_duplicacaoTutoria();
teste4_sessaoExpirada();
teste5_vagasNull();
teste6_clubinhoValidade();
teste7_tratamentoErro();
teste8_funcoesDuplicadas();
teste9_toastElement();
teste10_validacaoDatas();
```

---

## 📊 Entender os Resultados

### Estatísticas Básicas
- **Passou**: Testes que validaram comportamento esperado
- **Falhou**: Testes que identificaram falhas lógicas
- **Total**: Número total de testes executados
- **Taxa**: Percentual de sucesso

### Severidade
- 🔴 **CRÍTICA** - Risco alto para o sistema, corrigir imediatamente
- 🟠 **ALTA** - Falha importante, corrigir em breve
- 🟡 **MÉDIA** - Problema moderado, considerar para próximo sprint
- 🟢 **BAIXA** - Melhoria, corrigir quando possível

### Exemplo de Saída
```
✅ GRUPO: TESTE 1: Período Ativo sem Timezone
────────────────────────────────────────────────
✅ Período passado retorna false
✅ Período futuro retorna false
✅ Período hoje (2026-06-01) retorna true
✅ Datas NULL retornam false

⚠️  AVISO: Esta função tem problema de timezone!
Problema: Não considera fuso horário do servidor vs cliente
```

---

## 🐛 Interpretar Falhas Específicas

### Falha 1: Período Ativo sem Timezone
**O que significa:** Diferença entre horário do cliente e servidor  
**Impacto:** Aluno vê período aberto mas servidor nega inscrição (ou vice-versa)  
**Como testar:** Ver TESTES_SISTEMA.md Falha 1

**Solução:**
```javascript
// ❌ Incorreto
new Date(inicio) <= hoje && hoje <= new Date(fim)

// ✅ Correto
const hoje = new Date().toISOString().split('T')[0];
return inicio <= hoje && hoje <= fim;
```

---

### Falha 2: Restrição de Eletiva Inconsistente
**O que significa:** Sistema não valida limite de vagas  
**Impacto:** Eletiva fica com mais alunos que permitido  
**Como testar:** Inserir 11 alunos em eletiva com 10 vagas

**Solução:**
```sql
CREATE TRIGGER tr_validar_vagas_eletiva
BEFORE INSERT ON eletiva_matriculas
FOR EACH ROW EXECUTE FUNCTION validar_vagas_eletiva();
```

---

### Falha 3: Duplicação de Tutoria
**O que significa:** Aluno pode ter múltiplos tutores no mesmo ano  
**Impacto:** Dados inconsistentes, confusão de responsabilidades  
**Como testar:** Inserir 2 linhas com aluno_id igual e ano_letivo igual

**Solução:**
```sql
-- Mudar constraint de aluno_id único para (aluno_id, ano_letivo) único
ALTER TABLE tutoria_vinculos DROP CONSTRAINT tutoria_vinculos_aluno_id_key;
ALTER TABLE tutoria_vinculos ADD UNIQUE (aluno_id, ano_letivo);
```

---

### Falha 4: Sessão não Valida Expiração
**O que significa:** Token expirado continua funcionando  
**Impacto:** Segurança - usuário removido ainda acessa dados  
**Como testar:** Salvar sessão com expires_at no passado

**Solução:**
```javascript
async function getSessao() {
  const sessao = JSON.parse(localStorage.getItem('portal_atlas_sessao'));
  
  if (sessao.expires_at && new Date(sessao.expires_at) < new Date()) {
    localStorage.removeItem('portal_atlas_sessao');
    return null;
  }
  
  return sessao;
}
```

---

## 📋 Checklist para Correção

### Críticas (Fazer Agora)
- [ ] Falha 1: Corrigir `periodoAtivo()` 
- [ ] Falha 7: Adicionar try-catch em `init()`

### Altas (Próximo Sprint)
- [ ] Falha 2: Implementar TRIGGER de vagas
- [ ] Falha 3: Ajustar PRIMARY KEY
- [ ] Falha 5: Criar VIEW para vagas
- [ ] Falha 10: Validar datas antes de salvar

### Médias (Próximas Iterações)
- [ ] Falha 4: Implementar expiração de sessão
- [ ] Falha 6: Calcular validade_ate automaticamente
- [ ] Falha 8: Consolidar funções duplicadas

### Baixas (Backog)
- [ ] Falha 9: Melhorar tratamento de Toast

---

## 🔍 Evidências de Cada Falha

### Falha 1: Timezone
**Arquivo afetado:** `utils.js` linhas 9-14, `app.js` linhas 3-14  
**Função:** `periodoAtivo()`  
**Teste:** `teste1_periodoAtivo()`

---

### Falha 2: Vagas Eletiva
**Arquivo afetado:** `banco.sql` linhas 137-143  
**Tabela:** `eletiva_matriculas`  
**Teste:** `teste2_restricaoEletiva()`  
**Query de teste:**
```sql
SELECT COUNT(*) FROM eletiva_matriculas 
WHERE eletiva_id = 'e1' AND ano_letivo = 2026;
-- Esperado: ≤ 10
-- Atual: pode ser > 10
```

---

### Falha 3: Duplicação Tutoria
**Arquivo afetado:** `banco.sql` linhas 85-92  
**Tabela:** `tutoria_vinculos`  
**Constraint:** `UNIQUE(aluno_id)` ← deveria ser `UNIQUE(aluno_id, ano_letivo)`  
**Teste:** `teste3_duplicacaoTutoria()`

---

### Falha 4: Sessão Expirada
**Arquivo afetado:** `supabase.js` linhas 68-77  
**Função:** `getSessao()`  
**Teste:** `teste4_sessaoExpirada()`

---

### Falha 5: Vagas NULL
**Arquivo afetado:** `banco.sql` linhas 115-120  
**Campo:** `eletivas.vagas`  
**Teste:** `teste5_vagasNull()`

---

### Falha 6: Clubinho Validade
**Arquivo afetado:** `banco.sql` linhas 160-168  
**Campo:** `clubinhos.validade_ate`  
**Teste:** `teste6_clubinhoValidade()`

---

### Falha 7: Tratamento de Erro
**Arquivo afetado:** `app.js` linhas 45-52, `professor.js` linhas 39-45, `coordenador.js` linhas 39-45  
**Função:** `init()`  
**Teste:** `teste7_tratamentoErro()`

---

### Falha 8: Funções Duplicadas
**Arquivos afetados:** `app.js`, `professor.js`, `coordenador.js`, `utils.js`  
**Funções:** `periodoAtivo()`, `formatarData()`, `mostrarToast()`  
**Teste:** `teste8_funcoesDuplicadas()`

---

### Falha 9: Toast Element
**Arquivo afetado:** `utils.js` linhas 44-57  
**Função:** `mostrarToast()`  
**Teste:** `teste9_toastElement()`

---

### Falha 10: Validação de Datas
**Arquivo afetado:** Presumivelmente em `coordenador.js` (modal)  
**Função:** Falta implementar  
**Teste:** `teste10_validacaoDatas()`

---

## 📞 Suporte e Dúvidas

### Como debugar um teste?
```javascript
// Ativar debug mode
localStorage.setItem('debug_mode', 'true');

// Executar teste específico
teste1_periodoAtivo();

// Ver detalhes no console
console.table(TESTES.resultados);
```

### Relatório de falhas
```javascript
// Ver todas as falhas encontradas
TESTES.resultados
  .filter(r => !r.condicao)
  .forEach(r => console.log(`${r.severidade}: ${r.mensagem}`));
```

### Gerar evidência para bug report
```javascript
// Copiar tudo do console para relatório
copy(TESTES.resultados);
```

---

## 📈 Métricas

### Linha de Base Esperada
- Passou: 10-15
- Falhou: 10-15
- Taxa de Sucesso: 40-50% (esperado ter falhas)

### Após Correções
- Meta: Taxa de Sucesso > 90%

---

## 🎯 Próximos Passos

1. ✅ Executar testes e registrar falhas (FEITO)
2. ⏳ Abrir PRs para cada falha crítica
3. ⏳ Implementar correções com TDD
4. ⏳ Re-executar testes até 100% sucesso
5. ⏳ Integrar CI/CD com estes testes

---

**Última atualização:** 2026-06-01  
**Versão:** 1.0  
**Status:** ✅ Pronto para uso
