# 🗄️ TESTES DE BANCO DE DADOS - Portal Atlas

## 📌 Visão Geral

Suite completa de testes para validar:
- ✅ Conexão com Supabase
- ✅ Todas as funções de requisição ao banco
- ✅ Tratamento de erros
- ✅ Segurança (RLS, Policies)
- ✅ Performance (queries otimizadas)
- ✅ Integridade de dados
- ✅ Fallback/Mock mode

---

## 🧪 Os 12 Testes

### TESTE 1: Verificar Conexão Supabase

**O que testa:**
- Status `SUPABASE_ENABLED`
- Existência do cliente Supabase
- Credenciais carregadas
- Modo ativo (real ou mock)

**Crítico porque:**
- Se não conectar, todo sistema falha
- Precisa de fallback para modo offline

**Falhas possíveis:**
```
❌ Cliente Supabase existe → Credenciais não carregadas
❌ URL/KEY inconsistentes → Config.js não sendo lido
❌ CDN do Supabase não carregou → Biblioteca faltando
```

**Solução:**
```javascript
// Verificar em console
console.log('SUPABASE_ENABLED:', SUPABASE_ENABLED);
console.log('URL:', SUPABASE_URL);
console.log('Cliente:', supabaseClient);
```

---

### TESTE 2: Função Login - Validação

**O que testa:**
- Função `login()` existe
- É assíncrona
- Recebe 2 parâmetros (email, senha)
- Tem tratamento de erro
- Salva em localStorage

**Crítico porque:**
- Login é ponto de entrada
- Erro aqui bloqueia acesso a todo sistema

**Falhas possíveis:**
```
❌ login() não é async → Não pode fazer await
❌ Sem try-catch → Erro não tratado
❌ Não salva em localStorage → Sessão perdida ao recarregar
❌ Busca perfil no banco → Aluno não encontrado = erro
```

**Teste prático:**
```javascript
// Simular login bem-sucedido
await login('teste@email.com', 'senha123');

// Verificar se sessão foi salva
const sessao = JSON.parse(localStorage.getItem('portal_atlas_sessao'));
console.assert(sessao !== null, 'Sessão foi salva');
console.assert(sessao.user.email === 'teste@email.com', 'Email correto');
```

---

### TESTE 3: Função getPerfil - Validação

**O que testa:**
- Função `getPerfil()` existe
- É assíncrona
- Busca sessão armazenada
- Busca dados do banco quando necessário
- Retorna null em erro

**Crítico porque:**
- Determina que tipo de usuário é
- Bloqueia acesso se perfil for inválido

**Falhas possíveis:**
```
❌ getPerfil() é síncrona → Retorna undefined antes de buscar BD
❌ Sem fallback → Retorna erro em vez de null
❌ Busca banco sempre → Muita lentidão
```

**Teste prático:**
```javascript
// Sem sessão
localStorage.removeItem('portal_atlas_sessao');
const perfil1 = await getPerfil();
console.assert(perfil1 === null, 'Retorna null sem sessão');

// Com sessão
localStorage.setItem('portal_atlas_sessao', JSON.stringify({
  user: { email: 'aluno@test.com' },
  perfil: { nome: 'João', tipo: 'aluno' }
}));
const perfil2 = await getPerfil();
console.assert(perfil2.tipo === 'aluno', 'Usa perfil da sessão');
```

---

### TESTE 4: Função getConfigs - Validação

**O que testa:**
- Função `getConfigs(ano)` existe
- É assíncrona
- Recebe parâmetro ano
- Usa Promise.all para paralelizar
- Retorna estrutura completa

**Crítico porque:**
- Define períodos de inscrição
- Se falhar, ninguém consegue se inscrever

**Falhas possíveis:**
```
❌ Sem Promise.all → Faz 3 queries sequenciais em vez de paralelas
❌ Campo nulo → Retorna null em vez de objeto vazio
❌ Sem try-catch → Erro mata a requisição
```

**Teste prático:**
```javascript
const configs = await getConfigs(2026);
console.assert(configs.tutoria !== undefined, 'Retorna tutoria');
console.assert(configs.eletiva !== undefined, 'Retorna eletiva');
console.assert(configs.clubinho !== undefined, 'Retorna clubinho');
```

---

### TESTE 5: Tratamento de Erros

**O que testa:**
- Cada função tem try-catch
- Erros são logados ou relançados
- Não há erros silenciosos

**Crítico porque:**
- Usuário não vê o que falhou
- Bug fica escondido

**Falhas possíveis:**
```
❌ função() sem try-catch → Erro mata a requisição
❌ Erro silencioso → console.error mas continua
❌ Erro genérico → Usuário não sabe o que fazer
```

**Teste prático:**
```javascript
// Simular erro de banco
try {
  await login('email-invalido', 'senha');
  console.error('❌ Login deveria ter falhado');
} catch (e) {
  console.log('✅ Erro foi capturado:', e.message);
}
```

---

### TESTE 6: Funções de Contagem

**O que testa:**
- `contarAlunosPorTutor()`
- `contarMatriculasPorEletiva()`
- `contarMembrosPorClubinho()`
- Todas retornam números
- Fallback = 0 em erro

**Crítico porque:**
- Verifica vagas disponíveis
- Se retornar erro, aluno consegue se inscrever 2x

**Falhas possíveis:**
```
❌ Retorna undefined → Comparações falham
❌ Sem fallback → Erro mata requisição
❌ Conta errada → Eletiva fica com 11/10 vagas
```

**Teste prático:**
```javascript
const contagem = await contarMatriculasPorEletiva('eletiva-123');
console.assert(typeof contagem === 'number', 'Retorna número');
console.assert(contagem >= 0, 'Nunca retorna negativo');
```

---

### TESTE 7: Operações de Escrita (INSERT)

**O que testa:**
- Funções que inserem dados: `escolherTutor()`, `matricularEletiva()`, etc.
- Todas são assíncronas
- Validam erros antes de confirmar
- Retornam dados após sucesso

**Crítico porque:**
- Grava dados permanentes no banco
- Erro aqui corrói dados

**Falhas possíveis:**
```
❌ Insere sem validação → Dados duplicados
❌ Sem validação de erro → Dados incompletos
❌ Não retorna ID → Não consegue referenciar depois
```

**Teste prático:**
```javascript
const resultado = await escolherTutor('aluno-123', 'tutor-456', 2026);
console.assert(resultado !== null, 'Retorna dados');
console.assert(resultado.aluno_id === 'aluno-123', 'Dados corretos');
```

---

### TESTE 8: Consultas com Joins

**O que testa:**
- Funções que buscam dados relacionados
- `getVinculoTutoria()`, `getMatriculaEletiva()`, etc.
- Fazem select com join
- Filtram por ID
- Retornam um único registro

**Crítico porque:**
- Precisa de dados completos (nome do tutor, título da eletiva)
- Se não traz relacionado, falta contexto

**Falhas possíveis:**
```
❌ Sem join → Retorna só ID, sem nome
❌ Array em vez de single → Trata como lista vazia
❌ Sem filtro → Traz dados de outros alunos
```

**Teste prático:**
```javascript
const vinculo = await getVinculoTutoria('aluno-123', 2026);
console.assert(vinculo.colaboradores !== undefined, 'Traz dados do tutor');
console.assert(vinculo.colaboradores.nome !== undefined, 'Nome do tutor disponível');
```

---

### TESTE 9: Segurança (RLS e Policies)

**O que testa:**
- Row Level Security ativado
- Policies de acesso criadas
- Senhas não são logadas
- Tokens salvos com segurança
- Logout limpa session

**Crítico porque:**
- Aluno não pode ver dados de outro aluno
- Professor não pode aprovar sua própria eletiva
- Admin pode gerenciar tudo

**Falhas possíveis:**
```
❌ RLS não ativado → Aluno vê dados de todos
❌ Policy errada → Aluno consegue editar dados
❌ Senha no console.log() → Exposta em dev tools
❌ Token em sessionStorage → Exposto em XSS
```

**Teste prático:**
```javascript
// Verificar que RLS está em banco.sql
const sql = await fetch('banco.sql').then(r => r.text());
console.assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS ativado');
console.assert(sql.includes('CREATE POLICY'), 'Policies definidas');
```

---

### TESTE 10: Performance

**O que testa:**
- `getConfigs()` usa Promise.all
- Funções de contagem usam `head: true`
- Não há loops com await (N+1)
- `maybeSingle()` retorna um registro

**Crítico porque:**
- Sistema lento frustra usuários
- Muitas queries = timeout

**Falhas possíveis:**
```
❌ 3 queries sequenciais em vez de paralelo → 3x mais lento
❌ head: false → Baixa 1000 registros pra contar
❌ Loop com await → 100 queries em 100ms
```

**Teste prático:**
```javascript
const inicio = performance.now();
const configs = await getConfigs(2026);
const duracao = performance.now() - inicio;

console.log(`Tempo: ${duracao}ms`);
console.assert(duracao < 2000, 'Deve ser < 2 segundos');
```

---

### TESTE 11: Integridade de Dados

**O que testa:**
- Campos obrigatórios são validados
- Email é tratado como único
- `ano_letivo` é validado em operações
- Há integridade referencial

**Crítico porque:**
- Dados corrompidos quebram o sistema
- Duplicatas causam bugs estranhos

**Falhas possíveis:**
```
❌ Nome vazio permitido → Campo vazio no relatório
❌ Email duplicado → 2 alunos com mesmo email
❌ Sem ano_letivo → Dados de 2025 misturados com 2026
```

**Teste prático:**
```javascript
// Tentar criar colaborador sem email
try {
  await criarColaborador('João Silva', null, 'professor');
  console.error('❌ Deveria validar email');
} catch (e) {
  console.log('✅ Email validado:', e.message);
}
```

---

### TESTE 12: Fallback/Mock

**O que testa:**
- Existe objeto `_DB` para modo mock
- Tem estrutura de tabelas
- Cada função tem fallback `if (SUPABASE_ENABLED)`
- Sistema funciona offline

**Crítico porque:**
- Se Supabase cair, sistema continua
- Desenvolvimento offline funciona

**Falhas possíveis:**
```
❌ Sem _DB → Modo mock quebrado
❌ Função sem SUPABASE_ENABLED → Não funciona offline
❌ Mock sem todos dados → Falta contexto
```

**Teste prático:**
```javascript
// Desativar Supabase
SUPABASE_ENABLED = false;

// Modo mock deve funcionar
const tutores = await getTutores();
console.assert(Array.isArray(tutores), 'Retorna array em modo mock');
```

---

## 🚀 Como Executar

### Opção 1: Interface Web (Recomendado)
```bash
open teste-completo.html
```
- Clique em "🗄️ Banco de Dados"
- Clique "▶️ Executar Testes de BD"
- Veja resultados em tempo real

### Opção 2: Console do Navegador
```javascript
// Abrir DevTools (F12)
// Cola no console:
executarTodosTestes_BD();
```

### Opção 3: Teste Individual
```javascript
// No console:
teste1_conexaoSupabase();
teste2_funcaoLogin();
// etc...
```

---

## 📊 Interpretar Resultados

### Status de Conexão

**🟢 Supabase Conectado**
```
✅ Cliente Supabase existe
✅ URL e KEY carregadas
✅ Modo: 🟢 SUPABASE
```
→ Conexão real funcionando

**🔴 Modo Mock**
```
⚠️  Modo MOCK ativado
❌ Conexão real não disponível
```
→ Usando dados locais (offline)

---

### Exemplos de Falhas

**CRÍTICA: Sem Tratamento de Erro**
```
❌ Função login() sem try-catch
❌ Função getPerfil() sem try-catch
```
→ **Ação:** Corrigir imediatamente

**ALTA: Query Lenta**
```
⚠️  getConfigs() não usa Promise.all
```
→ **Ação:** Paralelizar queries

**MÉDIA: Sem head: true**
```
⚠️  contarMatriculasPorEletiva() baixa todos registros
```
→ **Ação:** Adicionar `head: true`

---

## 🔧 Correções Comuns

### Problema: "Sem Supabase Conectado"

**Causa:** Credenciais não carregadas

**Solução:**
```javascript
// Verificar em config.js
window.VITE_SUPABASE_URL = 'https://...supabase.co';
window.VITE_SUPABASE_ANON_KEY = 'eyJ...';

// Recarregar página
location.reload();
```

---

### Problema: "Erro em Login"

**Causa:** Perfil não encontrado no banco

**Solução:**
```sql
-- Verificar se usuário existe
SELECT * FROM alunos WHERE email = 'teste@email.com';
SELECT * FROM colaboradores WHERE email = 'teste@email.com';

-- Se não existir, inserir
INSERT INTO alunos (nome, email, serie, ano_nascimento)
VALUES ('Teste', 'teste@email.com', 'A1', 2010);
```

---

### Problema: "Query Muito Lenta"

**Causa:** Sem paralelização ou sem `head: true`

**Solução:**
```javascript
// ❌ Errado (sequencial)
const t = await getConfig(2026);
const e = await getConfig(2026);

// ✅ Correto (paralelo)
const [t, e] = await Promise.all([
  getConfig(2026),
  getConfig(2026)
]);
```

---

## 📋 Checklist

- [ ] Testes 1-5 (Conexão, Login, Perfil) ✅ Passando
- [ ] Testes 6-8 (Contagem, Escrita, Joins) ✅ Passando
- [ ] Teste 9 (Segurança) ✅ Passando
- [ ] Teste 10 (Performance) < 2s
- [ ] Testes 11-12 (Integridade, Mock) ✅ Passando

---

## 📞 Referência Rápida

| Teste | Arquivo | Função |
|-------|---------|--------|
| 1 | supabase.js | Inicialização |
| 2 | supabase.js | login() |
| 3 | supabase.js | getPerfil() |
| 4 | supabase.js | getConfigs() |
| 5 | supabase.js | Tratamento erro |
| 6 | supabase.js | contar*() |
| 7 | supabase.js | *() INSERT |
| 8 | supabase.js | get*() com joins |
| 9 | banco.sql | RLS/Policies |
| 10 | supabase.js | Performance |
| 11 | banco.sql | Constraints |
| 12 | supabase.js | SUPABASE_ENABLED |

---

## 🎯 Próximos Passos

1. ✅ Executar testes
2. ⏳ Corrigir falhas por severidade (crítica → alta → média)
3. ⏳ Re-executar até 95%+ sucesso
4. ⏳ Integrar no CI/CD

---

**Última atualização:** 2026-06-01  
**Versão:** 1.0
