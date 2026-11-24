-- =============================================
-- PORTAL ATLAS — Atualização do Supabase (arquivo único)
-- Cole tudo no SQL Editor do Supabase e clique em Run.
-- Pré-requisito: o banco já criado com dados/banco.sql.
-- Pode ser executado mais de uma vez. Roda numa transação: se der erro, nada é aplicado.
--
-- PARTE 1 — Tabela simulado_resultados (resultados do Simulado ENEM)
-- PARTE 2 — Validações: 1 tutor por aluno por ano, limite de vagas no banco
--           (tutoria/eletiva/clubinho), validade do clubinho, datas dos períodos
-- PARTE 3 — Perfis das contas de teste e ligação auth_id pelo e-mail
-- No fim aparece uma tabela de conferência com o perfil de cada usuário.
-- =============================================

BEGIN;

-- #############################################
-- PARTE 1 — RESULTADOS DO SIMULADO ENEM
-- Cada aluno grava e lê apenas os próprios resultados; a coordenação lê todos.
-- #############################################

CREATE TABLE IF NOT EXISTS simulado_resultados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  modalidade TEXT NOT NULL,                 -- Treino Rápido | Treino | Prática Real
  escopo TEXT NOT NULL,                     -- "Todas as matérias" ou o nome da matéria
  duracao_min INT NOT NULL CHECK (duracao_min > 0),
  tempo_gasto_seg INT NOT NULL CHECK (tempo_gasto_seg >= 0),
  total INT NOT NULL CHECK (total > 0),
  acertos INT NOT NULL CHECK (acertos >= 0),
  erros INT NOT NULL CHECK (erros >= 0),
  em_branco INT NOT NULL CHECK (em_branco >= 0),
  advertencias INT NOT NULL DEFAULT 0 CHECK (advertencias >= 0),
  motivo_encerramento TEXT NOT NULL CHECK (motivo_encerramento IN ('manual', 'tempo', 'penalidade')),
  por_area JSONB NOT NULL,                  -- [{ "area": "...", "total": n, "acertos": n }]
  respostas JSONB NOT NULL,                 -- [{ "questao": "2022-74", "resposta": "B", "correta": "D" }]
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  CHECK (acertos + erros + em_branco = total)
);

CREATE INDEX IF NOT EXISTS simulado_resultados_aluno_data
  ON simulado_resultados (aluno_id, criado_em DESC);

ALTER TABLE simulado_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sr_select" ON simulado_resultados;
CREATE POLICY "sr_select" ON simulado_resultados
  FOR SELECT USING (
    aluno_id = (get_aluno_logado()).id
    OR (get_colaborador_logado()).is_coordenador = true
  );

DROP POLICY IF EXISTS "sr_insert_proprio" ON simulado_resultados;
CREATE POLICY "sr_insert_proprio" ON simulado_resultados
  FOR INSERT WITH CHECK (aluno_id = (get_aluno_logado()).id);

-- Sem políticas de UPDATE/DELETE: o resultado de um simulado não pode ser alterado pelo aluno.

-- #############################################
-- PARTE 2 — VALIDAÇÕES DE VAGAS, PERÍODOS E TUTORIA
-- #############################################

-- ---------- 1. Tutoria: único por (aluno, ano) ----------
ALTER TABLE tutoria_vinculos DROP CONSTRAINT IF EXISTS tutoria_vinculos_aluno_id_key;
ALTER TABLE tutoria_vinculos DROP CONSTRAINT IF EXISTS tutoria_vinculos_aluno_ano_key;
ALTER TABLE tutoria_vinculos
  ADD CONSTRAINT tutoria_vinculos_aluno_ano_key UNIQUE (aluno_id, ano_letivo);

-- ---------- 2. Períodos coerentes ----------
-- NOT VALID: não rejeita linhas antigas, mas vale para todo INSERT/UPDATE daqui em diante.
ALTER TABLE tutoria_config DROP CONSTRAINT IF EXISTS tutoria_config_periodos_chk;
ALTER TABLE tutoria_config ADD CONSTRAINT tutoria_config_periodos_chk CHECK (
  data_criacao_fim >= data_criacao_inicio
  AND data_inscricao_fim >= data_inscricao_inicio
  AND vagas_por_tutor > 0
) NOT VALID;

ALTER TABLE eletiva_config DROP CONSTRAINT IF EXISTS eletiva_config_periodos_chk;
ALTER TABLE eletiva_config ADD CONSTRAINT eletiva_config_periodos_chk CHECK (
  data_criacao_fim >= data_criacao_inicio
  AND data_aprovacao_fim >= data_aprovacao_inicio
  AND data_inscricao_fim >= data_inscricao_inicio
  AND vagas_por_eletiva > 0
) NOT VALID;

ALTER TABLE clubinho_config DROP CONSTRAINT IF EXISTS clubinho_config_periodos_chk;
ALTER TABLE clubinho_config ADD CONSTRAINT clubinho_config_periodos_chk CHECK (
  data_criacao_fim >= data_criacao_inicio
  AND data_aprovacao_fim >= data_aprovacao_inicio
  AND data_inscricao_fim >= data_inscricao_inicio
  AND vagas_por_clubinho > 0
  AND duracao_meses > 0
) NOT VALID;

-- ---------- 3a. Vagas de eletiva ----------
CREATE OR REPLACE FUNCTION validar_vagas_eletiva()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limite INT;
  ocupadas INT;
BEGIN
  -- Serializa inscrições na mesma eletiva (evita duas passarem ao mesmo tempo na última vaga)
  PERFORM pg_advisory_xact_lock(hashtext('eletiva:' || NEW.eletiva_id::text));

  SELECT COALESCE(e.vagas, ec.vagas_por_eletiva) INTO limite
  FROM eletivas e
  LEFT JOIN eletiva_config ec ON ec.ano_letivo = e.ano_letivo
  WHERE e.id = NEW.eletiva_id;

  SELECT COUNT(*) INTO ocupadas
  FROM eletiva_matriculas
  WHERE eletiva_id = NEW.eletiva_id;

  IF limite IS NOT NULL AND ocupadas >= limite THEN
    RAISE EXCEPTION 'Eletiva lotada: % de % vagas ocupadas', ocupadas, limite;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validar_vagas_eletiva ON eletiva_matriculas;
CREATE TRIGGER tr_validar_vagas_eletiva
  BEFORE INSERT OR UPDATE OF eletiva_id ON eletiva_matriculas
  FOR EACH ROW EXECUTE FUNCTION validar_vagas_eletiva();

-- ---------- 3b. Vagas de tutoria ----------
CREATE OR REPLACE FUNCTION validar_vagas_tutoria()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limite INT;
  ocupadas INT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.colaborador_id = OLD.colaborador_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tutor:' || NEW.colaborador_id::text || ':' || NEW.ano_letivo));

  SELECT vagas_por_tutor INTO limite
  FROM tutoria_config WHERE ano_letivo = NEW.ano_letivo
  LIMIT 1;

  SELECT COUNT(*) INTO ocupadas
  FROM tutoria_vinculos
  WHERE colaborador_id = NEW.colaborador_id
    AND ano_letivo = NEW.ano_letivo
    AND id <> NEW.id;

  IF limite IS NOT NULL AND ocupadas >= limite THEN
    RAISE EXCEPTION 'Tutor sem vagas: % de % vagas ocupadas', ocupadas, limite;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validar_vagas_tutoria ON tutoria_vinculos;
CREATE TRIGGER tr_validar_vagas_tutoria
  BEFORE INSERT OR UPDATE OF colaborador_id ON tutoria_vinculos
  FOR EACH ROW EXECUTE FUNCTION validar_vagas_tutoria();

-- ---------- 4a. validade_ate automática ----------
CREATE OR REPLACE FUNCTION preencher_validade_clubinho()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meses INT;
BEGIN
  IF NEW.validade_ate IS NULL THEN
    SELECT duracao_meses INTO meses
    FROM clubinho_config WHERE ano_letivo = NEW.ano_letivo
    LIMIT 1;

    NEW.validade_ate := ((now() AT TIME ZONE 'America/Sao_Paulo')::date
                         + make_interval(months => COALESCE(meses, 6)))::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_preencher_validade_clubinho ON clubinhos;
CREATE TRIGGER tr_preencher_validade_clubinho
  BEFORE INSERT ON clubinhos
  FOR EACH ROW EXECUTE FUNCTION preencher_validade_clubinho();

-- Clubinhos antigos sem validade: calcula a partir da data de criação
UPDATE clubinhos c
SET validade_ate = ((c.criado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    + make_interval(months => COALESCE(
                        (SELECT cc.duracao_meses FROM clubinho_config cc
                         WHERE cc.ano_letivo = c.ano_letivo LIMIT 1), 6)))::date
WHERE c.validade_ate IS NULL;

-- ---------- 4b. Entrada em clubinho: vagas e validade ----------
CREATE OR REPLACE FUNCTION validar_entrada_clubinho()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limite INT;
  ocupadas INT;
  validade DATE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('clubinho:' || NEW.clubinho_id::text));

  SELECT COALESCE(c.vagas, cc.vagas_por_clubinho), c.validade_ate INTO limite, validade
  FROM clubinhos c
  LEFT JOIN clubinho_config cc ON cc.ano_letivo = c.ano_letivo
  WHERE c.id = NEW.clubinho_id;

  IF validade IS NOT NULL AND validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Clubinho expirado em %', to_char(validade, 'DD/MM/YYYY');
  END IF;

  SELECT COUNT(*) INTO ocupadas
  FROM clubinho_membros
  WHERE clubinho_id = NEW.clubinho_id;

  IF limite IS NOT NULL AND ocupadas >= limite THEN
    RAISE EXCEPTION 'Clubinho lotado: % de % vagas ocupadas', ocupadas, limite;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validar_entrada_clubinho ON clubinho_membros;
CREATE TRIGGER tr_validar_entrada_clubinho
  BEFORE INSERT OR UPDATE OF clubinho_id ON clubinho_membros
  FOR EACH ROW EXECUTE FUNCTION validar_entrada_clubinho();

-- ---------- 5. Troca de eletiva ----------
-- O aluno pode trocar a própria inscrição (antes só podia criar e apagar).
DROP POLICY IF EXISTS "em_update_aluno" ON eletiva_matriculas;
CREATE POLICY "em_update_aluno" ON eletiva_matriculas
  FOR UPDATE
  USING ((get_aluno_logado()).id = aluno_id)
  WITH CHECK ((get_aluno_logado()).id = aluno_id);

-- #############################################
-- PARTE 3 — PERFIS DOS USUÁRIOS DE TESTE
-- Contas usadas pelos botões "Entrar direto": aluno@atlas.com, professor@atlas.com,
-- coordenador@atlas.com. O login exige perfil com auth_id = id do usuário (RLS).
-- #############################################

-- Aluno de teste
INSERT INTO alunos (nome, email, serie, ano_nascimento)
VALUES ('Aluno Teste', 'aluno@atlas.com', '3ª série', 2008)
ON CONFLICT (email) DO NOTHING;

-- Professor e coordenador de teste
INSERT INTO colaboradores (nome, email, cargo, is_professor, is_tutor, is_coordenador)
VALUES
  ('Professor Teste',   'professor@atlas.com',   'Professor',   true,  true,  false),
  ('Coordenador Teste', 'coordenador@atlas.com', 'Coordenador', false, false, true)
ON CONFLICT (email) DO NOTHING;

-- Liga auth_id de TODOS os perfis cujo e-mail existe no Authentication e ainda não está ligado
UPDATE alunos a
SET auth_id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(a.email)
  AND a.auth_id IS DISTINCT FROM u.id
  AND NOT EXISTS (SELECT 1 FROM alunos x WHERE x.auth_id = u.id);

UPDATE colaboradores c
SET auth_id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(c.email)
  AND c.auth_id IS DISTINCT FROM u.id
  AND NOT EXISTS (SELECT 1 FROM colaboradores x WHERE x.auth_id = u.id);

COMMIT;

-- Conferência: cada usuário do Authentication e o perfil ligado a ele
SELECT
  u.email,
  CASE
    WHEN a.id IS NOT NULL THEN 'aluno'
    WHEN c.is_coordenador THEN 'coordenador'
    WHEN c.is_professor THEN 'professor'
    WHEN c.id IS NOT NULL THEN 'colaborador'
    ELSE '⚠️ SEM PERFIL — não consegue entrar no portal'
  END AS perfil,
  COALESCE(a.nome, c.nome) AS nome
FROM auth.users u
LEFT JOIN alunos a ON a.auth_id = u.id
LEFT JOIN colaboradores c ON c.auth_id = u.id
ORDER BY u.email;
