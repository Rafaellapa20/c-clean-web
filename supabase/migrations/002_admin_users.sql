-- =============================================================
-- C-Clean — Admin user management system
-- Run in Supabase SQL Editor
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 text        NOT NULL,
  email                text        NOT NULL UNIQUE,
  password_hash        text,
  provisional_hash     text,
  must_change_password boolean     DEFAULT true,
  password_expires_at  timestamptz,
  active               boolean     DEFAULT true,
  role                 text        DEFAULT 'admin' CHECK (role IN ('owner','admin')),
  created_by           uuid        REFERENCES admin_users(id),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token      text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz DEFAULT now() + interval '8 hours',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id   uuid        REFERENCES admin_users(id),
  action     text        NOT NULL,
  target_id  uuid,
  details    jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_users'    AND policyname='deny all') THEN CREATE POLICY "deny all" ON admin_users        USING (false); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_sessions'  AND policyname='deny all') THEN CREATE POLICY "deny all" ON admin_sessions     USING (false); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_activity_log' AND policyname='deny all') THEN CREATE POLICY "deny all" ON admin_activity_log USING (false); END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Helper: generate provisional password (10 safe chars)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _gen_prov_password()
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
           (get_byte(gen_random_bytes(1), 0) % 31) + 1, 1), '')
  FROM generate_series(1, 10);
$$;

-- ─────────────────────────────────────────────────────────────
-- Login
-- Returns: {token, id, name, role, must_change_password}
--          {error: 'invalid'} | {error: 'expired'}
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_login(p_email text, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user   admin_users%ROWTYPE;
  v_token  text;
  v_match  boolean := false;
BEGIN
  SELECT * INTO v_user
  FROM admin_users WHERE lower(email) = lower(p_email) AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;

  -- Try provisional password
  IF v_user.provisional_hash IS NOT NULL THEN
    IF v_user.password_expires_at < now() THEN
      RETURN jsonb_build_object('error','expired');
    END IF;
    IF crypt(p_password, v_user.provisional_hash) = v_user.provisional_hash THEN
      v_match := true;
    END IF;
  END IF;

  -- Try regular password
  IF NOT v_match AND v_user.password_hash IS NOT NULL THEN
    IF crypt(p_password, v_user.password_hash) = v_user.password_hash THEN
      v_match := true;
    END IF;
  END IF;

  IF NOT v_match THEN RETURN jsonb_build_object('error','invalid'); END IF;

  -- Create session
  DELETE FROM admin_sessions WHERE user_id = v_user.id AND expires_at < now();
  INSERT INTO admin_sessions (user_id) VALUES (v_user.id) RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'token', v_token,
    'id', v_user.id,
    'name', v_user.name,
    'role', v_user.role,
    'must_change_password', v_user.must_change_password
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Validate session (extends expiry)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_validate_session(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user admin_users%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user
  FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
  WHERE s.token = p_token AND s.expires_at > now() AND u.active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE admin_sessions SET expires_at = now() + interval '8 hours' WHERE token = p_token;
  RETURN jsonb_build_object('id',v_user.id,'name',v_user.name,'role',v_user.role,'must_change_password',v_user.must_change_password);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Change password (requires valid session)
-- Returns: {ok:true} | {error: 'same_as_provisional'|'unauthorized'}
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_change_password(p_token text, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user admin_users%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user
  FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
  WHERE s.token = p_token AND s.expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','unauthorized'); END IF;

  -- Reject if same as provisional
  IF v_user.provisional_hash IS NOT NULL
     AND crypt(p_new_password, v_user.provisional_hash) = v_user.provisional_hash THEN
    RETURN jsonb_build_object('error','same_as_provisional');
  END IF;

  UPDATE admin_users
  SET password_hash        = crypt(p_new_password, gen_salt('bf', 10)),
      provisional_hash     = NULL,
      password_expires_at  = NULL,
      must_change_password = false,
      updated_at           = now()
  WHERE id = v_user.id;

  INSERT INTO admin_activity_log (actor_id, action)
  VALUES (v_user.id, 'change_password');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Get users list
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_admin_users(p_token text)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  email                text,
  role                 text,
  active               boolean,
  must_change_password boolean,
  password_expires_at  timestamptz,
  created_by_name      text,
  created_at           timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token=p_token AND s.expires_at>now() AND u.active=true
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.role, u.active,
         u.must_change_password, u.password_expires_at,
         c.name AS created_by_name, u.created_at
  FROM admin_users u
  LEFT JOIN admin_users c ON c.id = u.created_by
  ORDER BY u.created_at;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Create admin user
-- Returns: {provisional_password, id} | {error}
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_admin_user(p_token text, p_name text, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor      admin_users%ROWTYPE;
  v_prov       text;
  v_new_id     uuid;
BEGIN
  SELECT u.* INTO v_actor
  FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
  WHERE s.token=p_token AND s.expires_at>now() AND u.active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','unauthorized'); END IF;

  IF EXISTS (SELECT 1 FROM admin_users WHERE lower(email)=lower(p_email)) THEN
    RETURN jsonb_build_object('error','email_taken');
  END IF;

  v_prov := _gen_prov_password();

  INSERT INTO admin_users (name, email, provisional_hash, must_change_password, password_expires_at, role, created_by)
  VALUES (p_name, lower(p_email), crypt(v_prov, gen_salt('bf',10)), true,
          now() + interval '7 days', 'admin', v_actor.id)
  RETURNING id INTO v_new_id;

  INSERT INTO admin_activity_log (actor_id, action, target_id, details)
  VALUES (v_actor.id, 'create_user', v_new_id, jsonb_build_object('email',p_email,'name',p_name));

  RETURN jsonb_build_object('provisional_password', v_prov, 'id', v_new_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Reset user access (new provisional password)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reset_admin_user(p_token text, p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor admin_users%ROWTYPE;
  v_prov  text;
BEGIN
  SELECT u.* INTO v_actor
  FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
  WHERE s.token=p_token AND s.expires_at>now() AND u.active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','unauthorized'); END IF;

  v_prov := _gen_prov_password();

  UPDATE admin_users
  SET provisional_hash     = crypt(v_prov, gen_salt('bf',10)),
      password_hash        = NULL,
      must_change_password = true,
      password_expires_at  = now() + interval '7 days',
      active               = true,
      updated_at           = now()
  WHERE id = p_target_id;

  DELETE FROM admin_sessions WHERE user_id = p_target_id;

  INSERT INTO admin_activity_log (actor_id, action, target_id)
  VALUES (v_actor.id, 'reset_user', p_target_id);

  RETURN jsonb_build_object('provisional_password', v_prov);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Toggle user active state
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_toggle_admin_user(p_token text, p_target_id uuid, p_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_actor admin_users%ROWTYPE;
BEGIN
  SELECT u.* INTO v_actor
  FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
  WHERE s.token=p_token AND s.expires_at>now() AND u.active=true;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Cannot deactivate owner or yourself
  IF EXISTS (SELECT 1 FROM admin_users WHERE id=p_target_id AND (role='owner' OR id=v_actor.id)) THEN
    RETURN false;
  END IF;

  UPDATE admin_users SET active=p_active, updated_at=now() WHERE id=p_target_id;
  IF NOT p_active THEN DELETE FROM admin_sessions WHERE user_id=p_target_id; END IF;

  INSERT INTO admin_activity_log (actor_id, action, target_id)
  VALUES (v_actor.id, CASE WHEN p_active THEN 'activate_user' ELSE 'deactivate_user' END, p_target_id);

  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Remove user
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_remove_admin_user(p_token text, p_target_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor      admin_users%ROWTYPE;
  v_active_cnt int;
BEGIN
  SELECT u.* INTO v_actor
  FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
  WHERE s.token=p_token AND s.expires_at>now() AND u.active=true;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Cannot remove owner, yourself, or last admin
  IF EXISTS (SELECT 1 FROM admin_users WHERE id=p_target_id AND (role='owner' OR id=v_actor.id)) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_active_cnt FROM admin_users WHERE active=true;
  IF v_active_cnt <= 1 THEN RETURN false; END IF;

  INSERT INTO admin_activity_log (actor_id, action, target_id, details)
  SELECT v_actor.id, 'remove_user', p_target_id,
         jsonb_build_object('name', name, 'email', email)
  FROM admin_users WHERE id=p_target_id;

  DELETE FROM admin_users WHERE id=p_target_id;
  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Get activity log
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_activity_log(p_token text, p_limit int DEFAULT 50)
RETURNS TABLE (
  action        text,
  actor_name    text,
  details       jsonb,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token=p_token AND s.expires_at>now() AND u.active=true
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.action, u.name AS actor_name, l.details, l.created_at
  FROM admin_activity_log l
  LEFT JOIN admin_users u ON u.id = l.actor_id
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Bootstrap: create first owner (only if none exists)
-- Usage: SELECT admin_create_owner('Nome', 'email@example.com');
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_owner(p_name text, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prov text;
  v_id   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM admin_users WHERE role='owner') THEN
    RETURN jsonb_build_object('error','owner_exists');
  END IF;

  v_prov := _gen_prov_password();

  INSERT INTO admin_users (name, email, provisional_hash, must_change_password, password_expires_at, role)
  VALUES (p_name, lower(p_email), crypt(v_prov, gen_salt('bf',10)),
          true, now() + interval '7 days', 'owner')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('provisional_password', v_prov, 'id', v_id,
    'message', 'Guarda esta palavra-passe — só é mostrada uma vez!');
END;
$$;
