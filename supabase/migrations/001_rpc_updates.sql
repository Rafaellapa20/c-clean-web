-- =============================================================
-- C-Clean — Supabase RPC updates
-- Cole este SQL no Supabase SQL Editor e executa
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. admin_get_today_jobs → agora aceita p_date (opcional)
--    Assim funciona tanto a chamada antiga (sem argumento)
--    como a nova (com data escolhida no filtro do admin).
-- ─────────────────────────────────────────────────────────────

-- Remove a versão antiga sem parâmetros (se existir)
DROP FUNCTION IF EXISTS admin_get_today_jobs();

CREATE OR REPLACE FUNCTION admin_get_today_jobs(
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id          uuid,
  client      text,
  address     text,
  task        text,
  job_date    date,
  job_time    time,
  status      text,
  worker_name text,
  started_at  timestamptz,
  finished_at timestamptz,
  photo_path  text,
  note        text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    j.id,
    j.client,
    j.address,
    j.task,
    j.job_date,
    j.job_time,
    j.status,
    w.name  AS worker_name,
    j.started_at,
    j.finished_at,
    j.photo_path,
    j.note
  FROM jobs j
  LEFT JOIN workers w ON w.id = j.worker_id
  WHERE j.job_date = p_date
  ORDER BY j.job_time;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. get_upcoming_jobs — trabalhos de hoje em diante
--    Usado pela app dos funcionários (substitui get_today_jobs)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_upcoming_jobs(p_pin text)
RETURNS TABLE (
  id          uuid,
  client      text,
  address     text,
  task        text,
  job_date    date,
  job_time    time,
  status      text,
  started_at  timestamptz,
  finished_at timestamptz,
  photo_path  text,
  note        text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    j.id,
    j.client,
    j.address,
    j.task,
    j.job_date,
    j.job_time,
    j.status,
    j.started_at,
    j.finished_at,
    j.photo_path,
    j.note,
    j.created_at
  FROM jobs j
  JOIN workers w ON w.id = j.worker_id
  WHERE w.pin = p_pin
    AND w.active = true
    AND j.job_date >= CURRENT_DATE
    AND j.status <> 'done'   -- esconde trabalhos já concluídos de dias anteriores
  ORDER BY j.job_date, j.job_time;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. admin_toggle_worker — ativar / desativar funcionário
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_toggle_worker(
  p_worker_id uuid,
  p_active    boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE workers
  SET    active = p_active
  WHERE  id = p_worker_id;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. Tabela push_subscriptions + RPC save_push_subscription
--    Necessária para a Edge Function de notificações
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id  uuid        REFERENCES workers(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (worker_id, endpoint)
);

-- Garante que apenas funções SECURITY DEFINER acedem à tabela
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON push_subscriptions
  USING (false);  -- bloco total a clientes; a Edge Function usa a service role key


-- ─────────────────────────────────────────────────────────────
-- 5. save_push_subscription — chamada pela app do funcionário
--    ao fazer login para registar o device
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_push_subscription(
  p_pin          text,
  p_subscription jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  SELECT id INTO v_worker_id FROM workers WHERE pin = p_pin AND active = true;
  IF v_worker_id IS NULL THEN RETURN; END IF;

  INSERT INTO push_subscriptions (worker_id, endpoint, p256dh, auth)
  VALUES (
    v_worker_id,
    p_subscription->>'endpoint',
    p_subscription->'keys'->>'p256dh',
    p_subscription->'keys'->>'auth'
  )
  ON CONFLICT (worker_id, endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh,
        auth   = EXCLUDED.auth;
END;
$$;
