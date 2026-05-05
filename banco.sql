CREATE TABLE tutoria_config (
  ano_letivo INT PRIMARY KEY,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status TEXT DEFAULT 'fechado' 
);

CREATE TABLE alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  serie TEXT NOT NULL
);

CREATE TABLE colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  is_tutor BOOLEAN DEFAULT false,
  is_coordenador BOOLEAN DEFAULT false
);

CREATE TABLE tutoria_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID UNIQUE NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE eletivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  professor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  vagas INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE eletiva_matriculas (
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  eletiva_id UUID REFERENCES eletivas(id) ON DELETE CASCADE,
  matriculado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (aluno_id, eletiva_id) 
);

CREATE TABLE clubinhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  lider_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE clubinho_membros (
  clubinho_id UUID REFERENCES clubinhos(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  entrou_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (clubinho_id, aluno_id) -- Chave primária composta para evitar membro duplicado
);