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
  aluno_id UUID UNIQUE NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ano_letivo INT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
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

-- ELETIVAS: aprovadas visíveis a todos; pendentes só ao professor dono e coordenador
CREATE POLICY "eletiva_select_aprovadas" ON eletivas
  FOR SELECT USING (
    status = 'aprovada'
    OR (get_colaborador_logado()).is_coordenador = true
    OR professor_id = (get_colaborador_logado()).id
  );

CREATE POLICY "eletiva_insert_professor" ON eletivas
  FOR INSERT WITH CHECK ((get_colaborador_logado()).is_professor = true AND professor_id = (get_colaborador_logado()).id);

CREATE POLICY "eletiva_update_coordenador" ON eletivas
  FOR UPDATE USING ((get_colaborador_logado()).is_coordenador = true OR professor_id = (get_colaborador_logado()).id);

-- ELETIVA MATRICULAS
CREATE POLICY "em_select" ON eletiva_matriculas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "em_insert_aluno" ON eletiva_matriculas
  FOR INSERT WITH CHECK ((get_aluno_logado()).id = aluno_id);
CREATE POLICY "em_delete_aluno" ON eletiva_matriculas
  FOR DELETE USING ((get_aluno_logado()).id = aluno_id);

-- CLUBINHOS: aprovados visíveis a todos; pendentes só ao líder e coordenador
CREATE POLICY "clubinho_select" ON clubinhos
  FOR SELECT USING (
    status = 'aprovado'
    OR (get_colaborador_logado()).is_coordenador = true
    OR lider_id = (get_aluno_logado()).id
  );

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

-- ✅ TRIGGER 1: Validar vagas de eletiva
-- Impede inserção de matrícula se ultrapassar vagas
CREATE OR REPLACE FUNCTION validar_vagas_eletiva()
RETURNS TRIGGER AS $$
DECLARE
  vagas_eletiva INT;
  vagas_default INT;
  count_matriculas INT;
BEGIN
  -- Obter vagas da eletiva (ou usar default do config)
  SELECT COALESCE(e.vagas, ec.vagas_por_eletiva) INTO vagas_eletiva
  FROM eletivas e
  LEFT JOIN eletiva_config ec ON ec.ano_letivo = e.ano_letivo
  WHERE e.id = NEW.eletiva_id;
  
  -- Contar matriculas existentes (sem incluir a nova)
  SELECT COUNT(*) INTO count_matriculas
  FROM eletiva_matriculas
  WHERE eletiva_id = NEW.eletiva_id AND ano_letivo = NEW.ano_letivo;
  
  -- Validar
  IF vagas_eletiva IS NOT NULL AND count_matriculas >= vagas_eletiva THEN
    RAISE EXCEPTION 'Eletiva lotada: % matriculas mas apenas % vagas',
      count_matriculas + 1, vagas_eletiva;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS tr_validar_vagas_eletiva ON eletiva_matriculas;
CREATE TRIGGER tr_validar_vagas_eletiva
  BEFORE INSERT ON eletiva_matriculas
  FOR EACH ROW
  EXECUTE FUNCTION validar_vagas_eletiva();

-- =============================================
-- END OF SCHEMA
-- =========================================== 