-- =============================================
-- PORTAL ATLAS — BANCO DE DADOS COMPLETO
-- =============================================

-- Extensão necessária para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- TABELAS DE CONFIGURAÇÃO (por ano letivo)
-- =============================================

CREATE TABLE tutoria_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_letivo INT NOT NULL,
  vagas_por_tutor INT NOT NULL DEFAULT 5,
  data_criacao_inicio DATE NOT NULL,
  data_criacao_fim DATE NOT NULL,
  data_inscricao_inicio DATE NOT NULL,
  data_inscricao_fim DATE NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE eletiva_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_letivo INT NOT NULL,
  vagas_por_eletiva INT NOT NULL DEFAULT 10,
  data_criacao_inicio DATE NOT NULL,
  data_criacao_fim DATE NOT NULL,
  data_aprovacao_inicio DATE NOT NULL,
  data_aprovacao_fim DATE NOT NULL,
  data_inscricao_inicio DATE NOT NULL,
  data_inscricao_fim DATE NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE clubinho_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_letivo INT NOT NULL,
  vagas_por_clubinho INT NOT NULL DEFAULT 10,
  duracao_meses INT NOT NULL DEFAULT 6,
  data_criacao_inicio DATE NOT NULL,
  data_criacao_fim DATE NOT NULL,
  data_aprovacao_inicio DATE NOT NULL,
  data_aprovacao_fim DATE NOT NULL,
  data_inscricao_inicio DATE NOT NULL,
  data_inscricao_fim DATE NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- =============================================
-- ALUNOS
-- =============================================

CREATE TABLE alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  serie TEXT NOT NULL,
  ano_nascimento INT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- =============================================
-- COLABORADORES (tutores, professores, coordenadores)
-- =============================================

CREATE TABLE colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,          -- NULL = sem acesso ao portal
  cargo TEXT NOT NULL,
  is_tutor BOOLEAN DEFAULT false,
  is_professor BOOLEAN DEFAULT false,
  is_coordenador BOOLEAN DEFAULT false,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- =============================================
-- TUTORIA
-- =============================================

CREATE TABLE tutoria_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  CONSTRAINT tutoria_vinculos_aluno_ano_key UNIQUE (aluno_id, ano_letivo)  -- 1 tutor por aluno por ano
);

-- =============================================
-- ELETIVAS
-- =============================================

CREATE TABLE eletivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  professor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  vagas INT,                  -- NULL = usa vagas_por_eletiva do config
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'reprovada')),
  ano_letivo INT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE eletiva_matriculas (
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  eletiva_id UUID REFERENCES eletivas(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  matriculado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  PRIMARY KEY (aluno_id, ano_letivo)  -- 1 eletiva por aluno por ano
);

-- =============================================
-- CLUBINHOS
-- =============================================

CREATE TABLE clubinhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  lider_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  vagas INT,                  -- NULL = usa vagas_por_clubinho do config
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
  ano_letivo INT NOT NULL,
  validade_ate DATE,          -- data_criacao + duracao_meses
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE clubinho_membros (
  clubinho_id UUID REFERENCES clubinhos(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  entrou_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  PRIMARY KEY (aluno_id, ano_letivo)  -- 1 clubinho por aluno por ano
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutoria_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE eletiva_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubinho_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutoria_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eletivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eletiva_matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubinhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubinho_membros ENABLE ROW LEVEL SECURITY;

-- Helper: retorna o colaborador logado
CREATE OR REPLACE FUNCTION get_colaborador_logado()
RETURNS colaboradores AS $$
  SELECT * FROM colaboradores WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: retorna o aluno logado
CREATE OR REPLACE FUNCTION get_aluno_logado()
RETURNS alunos AS $$
  SELECT * FROM alunos WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ALUNOS: aluno vê só o próprio registro; coordenador vê todos
CREATE POLICY "aluno_select_proprio" ON alunos
  FOR SELECT USING (auth_id = auth.uid() OR (get_colaborador_logado()).is_coordenador = true);
-- Professor vê os alunos das próprias eletivas e os próprios tutorados (relatórios)
CREATE POLICY "aluno_select_professor" ON alunos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM eletiva_matriculas m
            JOIN eletivas e ON e.id = m.eletiva_id
            WHERE m.aluno_id = alunos.id
              AND e.professor_id = (get_colaborador_logado()).id)
    OR EXISTS (SELECT 1 FROM tutoria_vinculos v
               WHERE v.aluno_id = alunos.id
                 AND v.colaborador_id = (get_colaborador_logado()).id)
  );

-- COLABORADORES: todos autenticados podem listar tutores; só coordenador gerencia
CREATE POLICY "colab_select_tutores" ON colaboradores
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "colab_insert_coordenador" ON colaboradores
  FOR INSERT WITH CHECK ((get_colaborador_logado()).is_coordenador = true);

CREATE POLICY "colab_update_coordenador" ON colaboradores
  FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true);

CREATE POLICY "colab_delete_coordenador" ON colaboradores
  FOR DELETE USING ((get_colaborador_logado()).is_coordenador = true);

-- CONFIG: leitura pública autenticada; escrita só coordenador
CREATE POLICY "config_select" ON tutoria_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "config_insert" ON tutoria_config FOR INSERT WITH CHECK ((get_colaborador_logado()).is_coordenador = true);
CREATE POLICY "config_update" ON tutoria_config FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true);

CREATE POLICY "econfig_select" ON eletiva_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "econfig_insert" ON eletiva_config FOR INSERT WITH CHECK ((get_colaborador_logado()).is_coordenador = true);
CREATE POLICY "econfig_update" ON eletiva_config FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true);

CREATE POLICY "cconfig_select" ON clubinho_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cconfig_insert" ON clubinho_config FOR INSERT WITH CHECK ((get_colaborador_logado()).is_coordenador = true);
CREATE POLICY "cconfig_update" ON clubinho_config FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true);

-- TUTORIA VINCULOS
CREATE POLICY "tv_select" ON tutoria_vinculos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tv_insert_aluno" ON tutoria_vinculos
  FOR INSERT WITH CHECK ((get_aluno_logado()).id = aluno_id);
CREATE POLICY "tv_update_aluno" ON tutoria_vinculos
  FOR UPDATE USING ((get_aluno_logado()).id = aluno_id);


CREATE POLICY "eletiva_insert_professor" ON eletivas
  FOR INSERT WITH CHECK ((get_colaborador_logado()).is_professor = true AND professor_id = (get_colaborador_logado()).id);

CREATE POLICY "eletiva_update_coordenador" ON eletivas
  FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true OR professor_id = (get_colaborador_logado()).id);

-- ELETIVAS E CLUBINHOS: visibilidade por prazo de inscrição
-- Aluno só vê eletivas e clubinhos aprovados até a data limite de inscrição do ano
-- (inclusive o último dia). Depois disso, só coordenação e professores veem a lista.
-- Exceções: o aluno continua vendo a eletiva/clubinho em que está inscrito e o
-- clubinho de que é líder (o portal mostra isso no card de status).
CREATE OR REPLACE FUNCTION inscricao_no_prazo(p_tipo TEXT, p_ano INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_tipo
    WHEN 'eletiva' THEN EXISTS (
      SELECT 1 FROM eletiva_config
      WHERE ano_letivo = p_ano
        AND data_inscricao_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    WHEN 'clubinho' THEN EXISTS (
      SELECT 1 FROM clubinho_config
      WHERE ano_letivo = p_ano
        AND data_inscricao_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "eletiva_select_aprovadas" ON eletivas;
CREATE POLICY "eletiva_select_aprovadas" ON eletivas
  FOR SELECT USING (
    (get_colaborador_logado()).is_coordenador = true
    OR professor_id = (get_colaborador_logado()).id
    OR (status = 'aprovada' AND (
          (get_colaborador_logado()).is_professor = true
          OR inscricao_no_prazo('eletiva', ano_letivo)
          OR EXISTS (SELECT 1 FROM eletiva_matriculas m
                     WHERE m.eletiva_id = eletivas.id
                       AND m.aluno_id = (get_aluno_logado()).id)
    ))
  );

DROP POLICY IF EXISTS "clubinho_select" ON clubinhos;
CREATE POLICY "clubinho_select" ON clubinhos
  FOR SELECT USING (
    (get_colaborador_logado()).is_coordenador = true
    OR lider_id = (get_aluno_logado()).id
    OR (status = 'aprovado' AND (
          (get_colaborador_logado()).is_professor = true
          OR inscricao_no_prazo('clubinho', ano_letivo)
          OR EXISTS (SELECT 1 FROM clubinho_membros m
                     WHERE m.clubinho_id = clubinhos.id
                       AND m.aluno_id = (get_aluno_logado()).id)
    ))
  );

-- ELETIVA MATRICULAS
CREATE POLICY "em_select" ON eletiva_matriculas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "em_insert_aluno" ON eletiva_matriculas
  FOR INSERT WITH CHECK ((get_aluno_logado()).id = aluno_id);
CREATE POLICY "em_update_aluno" ON eletiva_matriculas
  FOR UPDATE USING ((get_aluno_logado()).id = aluno_id) WITH CHECK ((get_aluno_logado()).id = aluno_id);
CREATE POLICY "em_delete_aluno" ON eletiva_matriculas
  FOR DELETE USING ((get_aluno_logado()).id = aluno_id);

-- CLUBINHOS

CREATE POLICY "clubinho_insert_aluno" ON clubinhos
  FOR INSERT WITH CHECK ((get_aluno_logado()).id IS NOT NULL);

CREATE POLICY "clubinho_update_coordenador" ON clubinhos
  FOR UPDATE USING (
    (get_colaborador_logado()).is_coordenador = true
    OR lider_id = (get_aluno_logado()).id
  );

-- CLUBINHO MEMBROS
CREATE POLICY "cm_select" ON clubinho_membros FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cm_insert_aluno" ON clubinho_membros
  FOR INSERT WITH CHECK ((get_aluno_logado()).id = aluno_id);
CREATE POLICY "cm_delete_aluno" ON clubinho_membros
  FOR DELETE USING ((get_aluno_logado()).id = aluno_id);

-- =============================================
-- TRIGGERS DE VALIDAÇÃO
-- =============================================

-- Mesmo conteúdo de dados/atualizacao_supabase.sql (parte 2)

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

-- ---------- Líder entra no próprio clubinho quando ele é aprovado ----------
-- Quem criou o clubinho vira membro automaticamente na aprovação da coordenação.
-- Se o líder já estava em outro clubinho no mesmo ano, passa para o dele
-- (cada aluno participa de um clubinho por ano).
CREATE OR REPLACE FUNCTION inscrever_lider_clubinho()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'aprovado'
     AND NEW.lider_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'aprovado') THEN
    INSERT INTO clubinho_membros (clubinho_id, aluno_id, ano_letivo)
    VALUES (NEW.id, NEW.lider_id, NEW.ano_letivo)
    ON CONFLICT (aluno_id, ano_letivo)
    DO UPDATE SET clubinho_id = EXCLUDED.clubinho_id, entrou_em = timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tr_inscrever_lider_clubinho ON clubinhos;
CREATE TRIGGER tr_inscrever_lider_clubinho
  AFTER INSERT OR UPDATE OF status ON clubinhos
  FOR EACH ROW EXECUTE FUNCTION inscrever_lider_clubinho();


-- =============================================
-- RESULTADOS DO SIMULADO ENEM (também em dados/atualizacao_supabase.sql, parte 1)
-- =============================================

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

-- =============================================
-- END OF SCHEMA
-- =========================================== 