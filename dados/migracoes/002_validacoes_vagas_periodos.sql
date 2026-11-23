-- =============================================
-- PORTAL ATLAS — Migração 002: validações de vagas, períodos e tutoria
-- Executar no SQL Editor do Supabase (pode ser executada mais de uma vez).
--
-- 1. tutoria_vinculos: 1 tutor por aluno POR ANO (antes era 1 por aluno para sempre,
--    o que impedia escolher tutor no ano letivo seguinte).
-- 2. Datas de fim não podem ser anteriores às de início nas configurações.
-- 3. Limite de vagas validado no banco para tutoria, eletiva e clubinho
--    (vagas NULL usam o padrão do config do ano), com trava contra inscrições simultâneas.
-- 4. validade_ate do clubinho preenchida automaticamente e verificada na entrada de membros.
-- =============================================

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
