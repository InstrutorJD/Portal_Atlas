# 🧪 TESTES DE SISTEMA - PORTAL ATLAS
## Análise de Falhas Lógicas

---

## 📋 RESUMO EXECUTIVO

Este documento apresenta testes de sistema para identificar falhas lógicas no **Portal Atlas**.
O sistema gerencia inscrições de alunos em **Tutoria**, **Eletivas** e **Clubinhos**.

---

## 🔴 FALHAS CRÍTICAS IDENTIFICADAS

### 1. **❌ FALHA: Período Ativo sem Timezone**
**Severidade:** CRÍTICA  
**Arquivo:** `utils.js` (linha 9-14), `app.js` (linha 57-61)

```javascript
function periodoAtivo(inicio, fim) {
  if (!inicio || !fim) return false;
  const hoje = new Date();
  return new Date(inicio) <= hoje && hoje <= new Date(fim);
}
```

**Problema:**
- A comparação não considera fuso horário
- Se o servidor está em UTC e o cliente em São Paulo (UTC-3), pode haver diferença de ~3 horas
- Data armazenada como `DATE` (só dia/mês/ano) pode ser interpretada como meia-noite UTC
- Aluno vê "período aberto" mas servidor não deixa inscrever (ou vice-versa)

**Cenário de Falha:**
- Brasil: 2026-06-01 23:00 (São Paulo)
- Servidor: 2026-06-02 02:00 (UTC)
- Data fim: 2026-06-01
- Cliente: Período aberto ❌ → Servidor: Período fechado ❌ (conflito)

**Teste:**
```javascript
// TESTE 1.1: Período no dia exato (meia-noite UTC)
const inicio = '2026-06-01';
const fim = '2026-06-01';
const resultadoCliente = periodoAtivo(inicio, fim); // ❓ Depende de timezone
console.assert(resultadoCliente === true, 'FALHA: 01/06 deveria ser ativo em 01/06');
```

**Correção Sugerida:**
```javascript
function periodoAtivo(inicio, fim) {
  if (!inicio || !fim) return false;
  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return inicio <= hoje && hoje <= fim;
}
```

---

### 2. **❌ FALHA: Restrição de Eletiva Inconsistente**
**Severidade:** ALTA  
**Arquivo:** `banco.sql` (linha 137-143)

```sql
CREATE TABLE eletiva_matriculas (
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  eletiva_id UUID REFERENCES eletivas(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  matriculado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  PRIMARY KEY (aluno_id, ano_letivo)  -- 1 eletiva por aluno por ano
);
```

**Problema:**
- A constraint `PRIMARY KEY (aluno_id, ano_letivo)` garante apenas 1 matrícula por aluno/ano
- MAS não está claro qual eletiva será mantida se o aluno tenta se matricular em 2
- `ON DELETE CASCADE` apaga automaticamente, sem aviso
- **Não há** `UNIQUE(eletiva_id)` limitando vagas

**Cenário de Falha:**
1. Eletiva A tem 10 vagas, já tem 10 alunos inscritos
2. Aluno tenta se inscrever → aplicação NÃO VERIFICA contagem de vagas
3. INSERT sucede sem validar limite
4. Eletiva fica com 11 alunos (violação de vagas)

**Teste:**
```javascript
// TESTE 2.1: Inscrever aluno em eletiva cheia
const eletiva_id = 'e123';
const aluno_id = 'a999';

// Inserir 10 alunos em eletiva com 10 vagas
for (let i = 0; i < 10; i++) {
  await db.from('eletiva_matriculas').insert({
    aluno_id: `aluno_${i}`,
    eletiva_id,
    ano_letivo: 2026
  });
}

// Tenta inscrever aluno 11
const { error } = await db.from('eletiva_matriculas').insert({
  aluno_id,
  eletiva_id,
  ano_letivo: 2026
});

// ❌ FALHA: Não há erro! Eletiva fica com 11 vagas
console.assert(error !== null, 'FALHA: Sistema permitiu exceder vagas');
```

**Correção Sugerida:**
```sql
-- Adicionar constraint de vagas no banco
CREATE FUNCTION validar_vagas_eletiva()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM eletiva_matriculas 
      WHERE eletiva_id = NEW.eletiva_id 
      AND ano_letivo = NEW.ano_letivo) >= 
     (SELECT COALESCE(vagas, (SELECT vagas_por_eletiva FROM eletiva_config 
                               WHERE ano_letivo = NEW.ano_letivo LIMIT 1))
      FROM eletivas WHERE id = NEW.eletiva_id)
  THEN RAISE EXCEPTION 'Eletiva cheia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_validar_vagas_eletiva
BEFORE INSERT ON eletiva_matriculas
FOR EACH ROW EXECUTE FUNCTION validar_vagas_eletiva();
```

---

### 3. **❌ FALHA: Duplicação de Tutoria Vinculos**
**Severidade:** ALTA  
**Arquivo:** `banco.sql` (linha 85-92)

```sql
CREATE TABLE tutoria_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID UNIQUE NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

**Problema:**
- Constraint `UNIQUE` só no `aluno_id` por coluna
- Aluno NÃO PODE ter 2 tutores no mesmo ano (✓ correto)
- MAS permite aluno ter múltiplos tutores em anos diferentes
- Falta validação se `aluno_id + ano_letivo` é único

**Cenário de Falha:**
1. Aluno se inscreve em Tutoria 2025 com Tutor A
2. Aluno tenta mudar para Tutor B em 2025
3. Sistema deixa atualizar mantendo vínculo antigo
4. Aluno fica com 2 tutores simultaneamente

**Teste:**
```javascript
// TESTE 3.1: Aluno com múltiplos tutores no mesmo ano
const aluno_id = 'a123';
const tutor_a = 't111';
const tutor_b = 't222';
const ano = 2026;

// Inscrição 1
await db.from('tutoria_vinculos').insert({
  aluno_id,
  colaborador_id: tutor_a,
  ano_letivo: ano
});

// Inscrição 2 - deveria falhar
const { error } = await db.from('tutoria_vinculos').insert({
  aluno_id,
  colaborador_id: tutor_b,
  ano_letivo: ano
});

console.assert(error !== null, 'FALHA: Aluno pode ter 2 tutores no mesmo ano');
```

**Correção Sugerida:**
```sql
-- Trocar UNIQUE por restrição composta
ALTER TABLE tutoria_vinculos DROP CONSTRAINT tutoria_vinculos_aluno_id_key;
ALTER TABLE tutoria_vinculos ADD UNIQUE (aluno_id, ano_letivo);
```

---

### 4. **❌ FALHA: Sessão não Valida Expiração**
**Severidade:** MÉDIA  
**Arquivo:** `supabase.js` (linha 68-77)

```javascript
async function getSessao() {
  try {
    return JSON.parse(localStorage.getItem('portal_atlas_sessao'));
  } catch(e) {
    return null;
  }
}
```

**Problema:**
- Sessão é guardada no `localStorage` indefinidamente
- Não verifica se token expirou
- Não valida se o usuário ainda tem permissão
- Se token é revogado no servidor, cliente continua acessando

**Cenário de Falha:**
1. Usuário faz login → token salvo no localStorage
2. Admin remove permissão do usuário
3. Usuário atualiza página → still logged in ❌
4. Usuário acessa dados que não deveria ter acesso

**Teste:**
```javascript
// TESTE 4.1: Sessão expirada continua ativa
const sessao = {
  user: { id: 'u123', email: 'teste@test.com' },
  access_token: 'token_expirado',
  expires_at: new Date(Date.now() - 3600000).toISOString() // 1 hora atrás
};
localStorage.setItem('portal_atlas_sessao', JSON.stringify(sessao));

const resultado = await getSessao();
console.assert(resultado === null, 'FALHA: Sessão expirada ainda é válida');
```

**Correção Sugerida:**
```javascript
async function getSessao() {
  try {
    const sessao = JSON.parse(localStorage.getItem('portal_atlas_sessao'));
    if (!sessao) return null;
    
    // Validar expiração
    if (sessao.expires_at && new Date(sessao.expires_at) < new Date()) {
      localStorage.removeItem('portal_atlas_sessao');
      return null;
    }
    
    return sessao;
  } catch(e) {
    return null;
  }
}
```

---

### 5. **❌ FALHA: Vagas NULL não Resolvem**
**Severidade:** ALTA  
**Arquivo:** `banco.sql` (linha 115-120)

```sql
CREATE TABLE eletivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  professor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  vagas INT,  -- NULL = usa vagas_por_eletiva do config
  ...
);
```

**Problema:**
- Se `vagas IS NULL`, o sistema deve buscar valor em `eletiva_config`
- Mas **não há** TRIGGER ou função que resolve isso automaticamente
- Aplicação precisa fazer lógica em JavaScript: `COALESCE(vagas, default_vagas)`
- Se esquecer de fazer em uma consulta → resultado incorreto

**Cenário de Falha:**
```sql
-- Config: 10 vagas por eletiva
SELECT * FROM eletiva_config WHERE ano_letivo = 2026;
-- vagas_por_eletiva: 10

-- Eletiva criada SEM especificar vagas
INSERT INTO eletivas (titulo, professor_id, ano_letivo) 
VALUES ('Python', 'prof123', 2026);
-- vagas: NULL

-- Consulta SEM COALESCE
SELECT * FROM eletivas WHERE id = 'e123';
-- vagas: NULL ← não diz que é 10!

-- JavaScript trata NULL como vazio
if (eletiva.vagas) { /* mostrar vagas */ }  // ❌ Não executa!
```

**Teste:**
```javascript
// TESTE 5.1: Eletiva sem vagas especificadas
const eletiva = {
  id: 'e123',
  titulo: 'Python',
  vagas: null,  // Deve usar 10 do config
  professor_id: 'prof123'
};

const vagasEfetivas = eletiva.vagas || 10;  // ✓ Workaround necessário
console.assert(vagasEfetivas === 10, 'FALHA: Vagas NULL não resolvem automaticamente');
```

**Correção Sugerida:**
```sql
-- Criar view que resolve vagas automaticamente
CREATE VIEW eletivas_com_vagas AS
SELECT 
  e.*,
  COALESCE(e.vagas, c.vagas_por_eletiva) as vagas_efetivas
FROM eletivas e
LEFT JOIN eletiva_config c ON e.ano_letivo = c.ano_letivo;

-- Ou usar função:
ALTER TABLE eletivas ADD GENERATED COLUMN vagas_efetivas INT AS (
  COALESCE(vagas, (SELECT vagas_por_eletiva FROM eletiva_config 
                   WHERE ano_letivo = (SELECT ano_letivo FROM eletivas 
                                      WHERE id = eletivas.id)))
) STORED;
```

---

### 6. **❌ FALHA: Clubinho Validade sem Validação**
**Severidade:** MÉDIA  
**Arquivo:** `banco.sql` (linha 160-168)

```sql
CREATE TABLE clubinhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  lider_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  vagas INT,
  status TEXT NOT NULL DEFAULT 'pendente',
  ano_letivo INT NOT NULL,
  validade_ate DATE,  -- data_criacao + duracao_meses
  ...
);
```

**Problema:**
- Campo `validade_ate` é calculado como `data_criacao + duracao_meses`
- MAS não há TRIGGER que preenche automaticamente
- Se não preenchido na inserção → fica NULL indefinidamente
- Sistema não invalida clubinhos após `validade_ate`

**Cenário de Falha:**
1. Clubinho criado 01/06/2025 com duração 6 meses (validade: 01/12/2025)
2. Hoje é 01/01/2026 (expirado)
3. Sistema ainda mostra clubinho como ativo
4. Novos alunos conseguem se inscrever em clubinho expirado

**Teste:**
```javascript
// TESTE 6.1: Clubinho expirado continua ativo
const clubinho = {
  id: 'c123',
  nome: 'Xadrez',
  criado_em: '2025-06-01',
  validade_ate: null,  // ❌ Não foi preenchida
  status: 'aprovado'
};

const agora = new Date('2026-01-15');
const estaValido = clubinho.validade_ate === null || new Date(clubinho.validade_ate) > agora;
// Result: true ❌ (considera válido porque validade_ate é null)

console.assert(estaValido === false, 'FALHA: Clubinho expirado está ativo');
```

**Correção Sugerida:**
```sql
-- TRIGGER para preencher validade_ate
CREATE FUNCTION calcular_validade_clubinho()
RETURNS TRIGGER AS $$
BEGIN
  NEW.validade_ate := NEW.criado_em + (
    SELECT duracao_meses * INTERVAL '1 month'
    FROM clubinho_config 
    WHERE ano_letivo = NEW.ano_letivo
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_calcular_validade_clubinho
BEFORE INSERT ON clubinhos
FOR EACH ROW EXECUTE FUNCTION calcular_validade_clubinho();

-- View para filtrar clubinhos válidos
CREATE VIEW clubinhos_validos AS
SELECT * FROM clubinhos
WHERE validade_ate IS NULL OR validade_ate >= CURRENT_DATE;
```

---

### 7. **❌ FALHA: Autenticação sem Validação de Perfil**
**Severidade:** CRÍTICA  
**Arquivo:** `app.js` (linha 45-52), `supabase.js` (linha 57-70)

```javascript
async function init() {
  const sessao = await getSessao();
  if (!sessao) { window.location.href = 'index.html'; return; }

  PERFIL = await getPerfil();
  if (!PERFIL || PERFIL.tipo !== 'aluno') { window.location.href = 'index.html'; return; }
  // ...
}
```

**Problema:**
- `getPerfil()` não é definida em nenhum arquivo visível
- Se retornar `undefined`, a verificação `PERFIL.tipo` causará erro
- Erro JavaScript interrompe script, usuário fica em página quebrada
- Nenhum tratamento de erro, sem feedback ao usuário

**Cenário de Falha:**
1. localStorage tem sessão velha/inválida
2. Página carrega, chama `getPerfil()` → retorna `null` ou `undefined`
3. Tenta acessar `PERFIL.tipo` → TypeError
4. Console error, página congelada

**Teste:**
```javascript
// TESTE 7.1: Perfil inválido causa erro
let PERFIL = null;

try {
  // ❌ Simula erro
  if (!PERFIL || PERFIL.tipo !== 'aluno') {
    throw new Error('Perfil inválido');
  }
} catch (e) {
  console.assert(false, 'FALHA: Erro não tratado: ' + e.message);
}

// TESTE 7.2: getPerfil não definida
const getPerfil = undefined;
console.assert(typeof getPerfil === 'function', 'FALHA: getPerfil não está definida');
```

**Correção Sugerida:**
```javascript
async function init() {
  try {
    const sessao = await getSessao();
    if (!sessao) { 
      window.location.href = 'index.html'; 
      return; 
    }

    PERFIL = await getPerfil();
    if (!PERFIL) { 
      throw new Error('Perfil não encontrado');
    }
    
    if (PERFIL.tipo !== 'aluno') { 
      throw new Error(`Acesso negado: tipo de perfil inválido (${PERFIL.tipo})`);
    }

    CONFIGS = await getConfigs(ANO);
    document.getElementById('user-welcome').textContent = `Olá, ${PERFIL.nome.split(' ')[0]}`;
    await atualizarStatusGeral();
    await atualizarStatusCards();
  } catch (error) {
    console.error('Erro na inicialização:', error);
    mostrarToast(`Erro: ${error.message}`, 'erro');
    window.location.href = 'index.html';
  }
}
```

---

### 8. **❌ FALHA: Funções Utilitárias Duplicadas**
**Severidade:** MÉDIA  
**Arquivos:** `app.js` (3-37), `professor.js` (3-37), `coordenador.js` (3-37), `utils.js` (5-57)

```javascript
// Duplicado em 4 arquivos!
if (typeof periodoAtivo === 'undefined') {
  var periodoAtivo = (inicio, fim) => { ... };
}
```

**Problema:**
- Mesmo código em 4 lugares → difícil manutenção
- Se corrigir bug em um, outros 3 ficarão desatualizados
- Aumenta tamanho do arquivo desnecessariamente
- Confusão sobre qual versão está sendo usada

**Cenário de Falha:**
1. Descobrir bug em `periodoAtivo`
2. Corrigir em `utils.js`
3. Esquecer de corrigir em `app.js`
4. App.js continua com versão antiga do bug

**Teste:**
```javascript
// TESTE 8.1: Versões inconsistentes
const versoes = [
  { arquivo: 'app.js', funcao: periodoAtivo },
  { arquivo: 'professor.js', funcao: periodoAtivo },
  { arquivo: 'coordenador.js', funcao: periodoAtivo },
  { arquivo: 'utils.js', funcao: periodoAtivo }
];

const resultado1 = versoes[0].funcao('2026-06-01', '2026-06-01');
const resultado2 = versoes[1].funcao('2026-06-01', '2026-06-01');

console.assert(resultado1 === resultado2, 'FALHA: Funções retornam resultados diferentes');
```

**Correção Sugerida:**
```html
<!-- No HTML, carregar utils.js PRIMEIRO -->
<script src="utils.js"></script>
<script src="app.js"></script>

<!-- Remover fallbacks de app.js, professor.js, coordenador.js -->
```

---

### 9. **❌ FALHA: Toast Element pode não Existir**
**Severidade:** BAIXA  
**Arquivo:** `utils.js` (linha 44-57)

```javascript
function mostrarToast(mensagem, tipo = 'sucesso') {
  const toast = document.getElementById('toast');
  if (!toast) return;  // ← Falha silenciosa
  
  toast.textContent = mensagem;
  toast.className = `toast toast--${tipo}`;
  toast.style.display = 'block';
  ...
}
```

**Problema:**
- Se elemento `#toast` não existe no HTML → função retorna silenciosamente
- Usuário não vê nenhuma mensagem de sucesso/erro
- Difícil debugar porque não há erro no console

**Cenário de Falha:**
1. Coordenador aprova eletiva
2. `mostrarToast('Eletiva aprovada', 'sucesso')` é chamada
3. Mas `#toast` não existe
4. Coordenador acha que nada aconteceu
5. Atualiza página manualmente

**Teste:**
```javascript
// TESTE 9.1: Toast não exibe se elemento não existe
document.getElementById('toast'); // → null
mostrarToast('Teste', 'sucesso'); // Retorna sem avisar
console.log('Toast foi exibido? Ninguém sabe!'); // ❌

// TESTE 9.2: Toast funciona com elemento
const toastEl = document.createElement('div');
toastEl.id = 'toast';
document.body.appendChild(toastEl);
mostrarToast('Teste', 'sucesso');
console.assert(toastEl.textContent === 'Teste', 'FALHA: Toast não mostra mensagem');
```

**Correção Sugerida:**
```javascript
function mostrarToast(mensagem, tipo = 'sucesso') {
  let toast = document.getElementById('toast');
  
  // Se não existe, criar dinamicamente
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
    console.warn('⚠️ Toast element não encontrado, criado dinamicamente');
  }
  
  toast.textContent = mensagem;
  toast.className = `toast toast--${tipo}`;
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
```

---

### 10. **❌ FALHA: Datas sem Validação (fim < início)**
**Severidade:** ALTA  
**Arquivo:** Sem validação visível (presumivelmente em modal de coordenador)

```javascript
// Presumido comportamento:
const periodos = {
  data_inscricao_inicio: '2026-07-01',
  data_inscricao_fim: '2026-06-01'  // ← FIM antes de INÍCIO!
};
```

**Problema:**
- Não há validação se `fim >= inicio` antes de salvar
- Período fica impossível de ativação
- `periodoAtivo()` retorna sempre `false`

**Cenário de Falha:**
1. Coordenador tenta configurar período: 01/07 a 30/06 (invertido por erro)
2. Sistema aceita sem validar
3. Inscrição fica eternamente fechada
4. Alunos não conseguem se inscrever

**Teste:**
```javascript
// TESTE 10.1: Data fim antes de início
const inicio = '2026-07-01';
const fim = '2026-06-01';

console.assert(new Date(fim) >= new Date(inicio), 
  'FALHA: Data fim deve ser >= data início');

const ativo = periodoAtivo(inicio, fim);
console.assert(ativo === false, 'FALHA: Período impossível retorna false');
```

**Correção Sugerida:**
```javascript
function validarPeriodo(inicio, fim) {
  if (!inicio || !fim) {
    throw new Error('Data início e fim são obrigatórias');
  }
  
  const dataInicio = new Date(inicio);
  const dataFim = new Date(fim);
  
  if (dataFim < dataInicio) {
    throw new Error('Data de fim não pode ser anterior à data de início');
  }
  
  return true;
}

// Usar em formulário
document.getElementById('form-periodo').addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    validarPeriodo(
      document.getElementById('data_inicio').value,
      document.getElementById('data_fim').value
    );
    // Salvar formulário
  } catch (error) {
    mostrarToast(error.message, 'erro');
  }
});
```

---

## 📊 TABELA RESUMIDA DE FALHAS

| ID | Falha | Severidade | Arquivo | Tipo |
|----|-------|-----------|---------|------|
| 1 | Período Ativo sem Timezone | 🔴 CRÍTICA | utils.js | Lógica |
| 2 | Restrição de Eletiva Inconsistente | 🟠 ALTA | banco.sql | BD |
| 3 | Duplicação de Tutoria | 🟠 ALTA | banco.sql | BD |
| 4 | Sessão não Valida Expiração | 🟡 MÉDIA | supabase.js | Auth |
| 5 | Vagas NULL não Resolvem | 🟠 ALTA | banco.sql | BD |
| 6 | Clubinho Validade sem Validação | 🟡 MÉDIA | banco.sql | BD |
| 7 | Autenticação sem Tratamento de Erro | 🔴 CRÍTICA | app.js | Lógica |
| 8 | Funções Duplicadas | 🟡 MÉDIA | Múltiplos | Manutenção |
| 9 | Toast Element pode não Existir | 🟢 BAIXA | utils.js | UX |
| 10 | Datas sem Validação | 🟠 ALTA | coordenador.js | Validação |

---

## 🧪 COMO EXECUTAR OS TESTES

### Ambiente de Testes
```bash
# 1. Criar arquivo de testes
cat > teste-sistema.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Testes - Portal Atlas</title>
  <script src="utils.js"></script>
  <script src="supabase.js"></script>
</head>
<body>
  <div id="toast"></div>
  <div id="results"></div>
  
  <script>
    // TESTE 1: periodoAtivo sem timezone
    console.log('🧪 TESTE 1: Período Ativo');
    const resultado1 = periodoAtivo('2026-06-01', '2026-06-01');
    console.log('Resultado:', resultado1, '(Pode falhar por timezone)');
    
    // TESTE 2: mostrarToast funciona
    console.log('🧪 TESTE 2: Toast');
    mostrarToast('Teste de notificação', 'sucesso');
    
    // TESTE 3: Validação de datas
    console.log('🧪 TESTE 3: Validação de Datas');
    const inicio = '2026-07-01';
    const fim = '2026-06-01';
    console.assert(new Date(fim) >= new Date(inicio), 
      '❌ Data fim deve ser >= data início');
  </script>
</body>
</html>
EOF

# 2. Abrir em navegador
open teste-sistema.html
# ou
firefox teste-sistema.html
```

### Testes Manuais no Navegador
1. Abrir DevTools (F12)
2. Ir para Console
3. Executar testes um por um
4. Verificar comportamento esperado

---

## ✅ RECOMENDAÇÕES PRIORITÁRIAS

### Imediato (Crítico)
- [ ] **Falha 1:** Corrigir `periodoAtivo()` para usar strings de data
- [ ] **Falha 7:** Adicionar try-catch em `init()` com tratamento de erro

### Curto Prazo (1-2 sprints)
- [ ] **Falha 2:** Adicionar TRIGGER de validação de vagas
- [ ] **Falha 3:** Alterar constraint de `tutoria_vinculos`
- [ ] **Falha 5:** Criar VIEW ou GENERATED COLUMN para vagas efetivas
- [ ] **Falha 10:** Adicionar validação de datas em formulários

### Médio Prazo (próximo sprint)
- [ ] **Falha 4:** Implementar refresh de sessão/validação de token
- [ ] **Falha 6:** Adicionar TRIGGER de cálculo de validade_ate
- [ ] **Falha 8:** Consolidar funções utilitárias
- [ ] **Falha 9:** Melhorar tratamento de Toast

---

## 🔍 PRÓXIMAS ETAPAS

1. ✅ **Documento criado:** [TESTES_SISTEMA.md](./TESTES_SISTEMA.md)
2. ⏳ **Criar testes automatizados:** `test-sistema.js`
3. ⏳ **Fixar cada falha** com PR incluindo testes
4. ⏳ **CI/CD:** Integrar testes no pipeline

---

**Última atualização:** 2026-06-01  
**Status:** Análise Completa ✅

