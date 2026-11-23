-- =============================================
-- PORTAL ATLAS — Migração 001: resultados do Simulado ENEM
-- Execute no SQL Editor do Supabase (depois de dados/banco.sql).
-- Cada aluno grava e lê apenas os próprios resultados; a coordenação lê todos.
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
