-- ==========================================
-- C-Clean — Supabase schema + RLS + seed
-- Correr no SQL Editor do Supabase
-- ==========================================

-- Extensions
create extension if not exists "pgcrypto";

-- ── Tables ────────────────────────────────

create table if not exists workers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  pin              char(4) unique not null,
  push_subscription jsonb,
  active           boolean not null default true
);

create table if not exists materials (
  id       uuid primary key default gen_random_uuid(),
  name_pt  text not null,
  name_de  text not null
);

create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  client      text not null,
  address     text not null,
  task        text not null,
  date        date not null,
  time        time not null,
  worker_id   uuid references workers(id) on delete set null,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  started_at  timestamptz,
  finished_at timestamptz,
  photo_path  text,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists job_materials (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  material_id  uuid references materials(id) on delete set null,
  custom_name  text,
  checked      boolean not null default false
);

-- ── Storage ───────────────────────────────

insert into storage.buckets (id, name, public)
values ('rapports', 'rapports', false)
on conflict (id) do nothing;

-- ── RLS ───────────────────────────────────

alter table workers       enable row level security;
alter table materials     enable row level security;
alter table jobs          enable row level security;
alter table job_materials enable row level security;

-- Workers: admin full access; authenticated worker reads own row
create policy "admin_all_workers" on workers
  for all using (auth.role() = 'authenticated');

create policy "worker_read_own" on workers
  for select using (
    pin = current_setting('request.jwt.claims', true)::jsonb->>'worker_pin'
  );

-- Materials: everyone can read (needed for checklist)
create policy "read_materials" on materials
  for select using (true);

create policy "admin_write_materials" on materials
  for all using (auth.role() = 'authenticated');

-- Jobs: admin sees all; worker sees only own
create policy "admin_all_jobs" on jobs
  for all using (auth.role() = 'authenticated');

create policy "worker_own_jobs" on jobs
  for select using (
    worker_id = (
      select id from workers
      where pin = current_setting('request.jwt.claims', true)::jsonb->>'worker_pin'
      limit 1
    )
  );

create policy "worker_update_own_jobs" on jobs
  for update using (
    worker_id = (
      select id from workers
      where pin = current_setting('request.jwt.claims', true)::jsonb->>'worker_pin'
      limit 1
    )
  );

-- Job materials: follows job access
create policy "admin_all_job_materials" on job_materials
  for all using (auth.role() = 'authenticated');

create policy "worker_own_job_materials" on job_materials
  for select using (
    job_id in (
      select id from jobs
      where worker_id = (
        select id from workers
        where pin = current_setting('request.jwt.claims', true)::jsonb->>'worker_pin'
        limit 1
      )
    )
  );

create policy "worker_update_job_materials" on job_materials
  for update using (
    job_id in (
      select id from jobs
      where worker_id = (
        select id from workers
        where pin = current_setting('request.jwt.claims', true)::jsonb->>'worker_pin'
        limit 1
      )
    )
  );

-- Storage: authenticated admin can read; signed URLs for workers
create policy "admin_rapports" on storage.objects
  for all using (
    bucket_id = 'rapports' and auth.role() = 'authenticated'
  );

-- ── Seed data ─────────────────────────────

insert into workers (name, pin, active) values
  ('Ana Silva', '1234', true),
  ('Bruno Costa', '5678', true)
on conflict (pin) do nothing;

insert into materials (name_pt, name_de) values
  ('Aspirador', 'Staubsauger'),
  ('Mop', 'Wischmopp'),
  ('Pano de microfibra', 'Mikrofasertuch'),
  ('Detergente', 'Reinigungsmittel'),
  ('Luvas', 'Handschuhe'),
  ('Saco do lixo', 'Mülltüte'),
  ('Escova de sanita', 'Toilettenbürste'),
  ('Spray multiusos', 'Allzweckspray')
on conflict do nothing;

-- Trabalho de teste para hoje
insert into jobs (client, address, task, date, time, worker_id, status)
select
  'Cliente Teste',
  'Rua do Exemplo 123, Lisboa',
  'Limpeza geral do apartamento T2',
  current_date,
  '09:00',
  (select id from workers where pin = '1234'),
  'todo'
where not exists (select 1 from jobs where client = 'Cliente Teste' and date = current_date);

-- ── RPC functions F2 ─────────────────────

create or replace function worker_login(p_pin text)
returns json language plpgsql security definer as $$
declare v_worker workers%rowtype;
begin
  select * into v_worker from workers where pin = p_pin and active = true;
  if v_worker.id is null then raise exception 'invalid_pin'; end if;
  return json_build_object('id', v_worker.id, 'name', v_worker.name);
end;$$;

create or replace function get_today_jobs(p_pin text)
returns table (id uuid, client text, address text, task text, job_date date, job_time time,
  status text, started_at timestamptz, finished_at timestamptz, photo_path text, note text, created_at timestamptz)
language plpgsql security definer as $$
declare v_worker_id uuid;
begin
  select w.id into v_worker_id from workers w where w.pin = p_pin and w.active = true;
  if v_worker_id is null then raise exception 'invalid_pin'; end if;
  return query select j.id, j.client, j.address, j.task, j.date, j.time,
    j.status, j.started_at, j.finished_at, j.photo_path, j.note, j.created_at
    from jobs j where j.worker_id = v_worker_id and j.date = current_date order by j.time;
end;$$;

create or replace function get_job_materials(p_pin text, p_job_id uuid)
returns table (id uuid, material_id uuid, custom_name text, checked boolean, name_pt text, name_de text)
language plpgsql security definer as $$
declare v_worker_id uuid;
begin
  select w.id into v_worker_id from workers w where w.pin = p_pin and w.active = true;
  if v_worker_id is null then raise exception 'invalid_pin'; end if;
  return query select jm.id, jm.material_id, jm.custom_name, jm.checked, m.name_pt, m.name_de
    from job_materials jm left join materials m on m.id = jm.material_id where jm.job_id = p_job_id;
end;$$;

create or replace function update_material_checked(p_pin text, p_material_row_id uuid, p_checked boolean)
returns void language plpgsql security definer as $$
declare v_worker_id uuid;
begin
  select w.id into v_worker_id from workers w where w.pin = p_pin and w.active = true;
  if v_worker_id is null then raise exception 'invalid_pin'; end if;
  update job_materials set checked = p_checked where id = p_material_row_id;
end;$$;

grant execute on function worker_login(text) to anon;
grant execute on function get_today_jobs(text) to anon;
grant execute on function get_job_materials(text, uuid) to anon;
grant execute on function update_material_checked(text, uuid, boolean) to anon;

-- ── RPC functions F3 ─────────────────────

create or replace function start_job(p_pin text, p_job_id uuid)
returns void language plpgsql security definer as $$
declare v_worker_id uuid;
begin
  select w.id into v_worker_id from workers w where w.pin = p_pin and w.active = true;
  if v_worker_id is null then raise exception 'invalid_pin'; end if;
  if exists (select 1 from jobs where worker_id = v_worker_id and status = 'doing') then
    raise exception 'already_active';
  end if;
  update jobs set status = 'doing', started_at = now()
    where id = p_job_id and worker_id = v_worker_id and status = 'todo';
end;$$;

create or replace function finish_job(p_pin text, p_job_id uuid, p_note text, p_photo_path text)
returns void language plpgsql security definer as $$
declare v_worker_id uuid;
begin
  select w.id into v_worker_id from workers w where w.pin = p_pin and w.active = true;
  if v_worker_id is null then raise exception 'invalid_pin'; end if;
  update jobs set status = 'done', finished_at = now(), note = p_note, photo_path = p_photo_path
    where id = p_job_id and worker_id = v_worker_id and status = 'doing';
end;$$;

-- Storage policy: anon workers can upload photos
create policy "worker_upload_rapports" on storage.objects
  for insert with check (bucket_id = 'rapports');

grant execute on function start_job(text, uuid) to anon;
grant execute on function finish_job(text, uuid, text, text) to anon;

-- ── RPC functions F4 (admin) ──────────────

create or replace function admin_get_today_jobs()
returns table (
  id uuid, client text, address text, task text,
  job_date date, job_time time, status text,
  worker_name text, started_at timestamptz,
  finished_at timestamptz, photo_path text, note text
)
language plpgsql security definer as $$
begin
  return query
    select j.id, j.client, j.address, j.task, j.date, j.time, j.status,
           w.name, j.started_at, j.finished_at, j.photo_path, j.note
    from jobs j
    left join workers w on w.id = j.worker_id
    where j.date = current_date
    order by j.time;
end;$$;

create or replace function admin_create_job(
  p_client text, p_address text, p_task text,
  p_date date, p_time time, p_worker_id uuid,
  p_material_ids uuid[], p_custom_names text[]
)
returns uuid language plpgsql security definer as $$
declare v_job_id uuid;
begin
  insert into jobs (client, address, task, date, time, worker_id)
  values (p_client, p_address, p_task, p_date, p_time, p_worker_id)
  returning id into v_job_id;

  -- standard materials
  if p_material_ids is not null then
    insert into job_materials (job_id, material_id)
    select v_job_id, unnest(p_material_ids);
  end if;

  -- custom materials
  if p_custom_names is not null then
    insert into job_materials (job_id, custom_name)
    select v_job_id, unnest(p_custom_names)
    where unnest(p_custom_names) <> '';
  end if;

  return v_job_id;
end;$$;

create or replace function admin_get_workers()
returns table (id uuid, name text, pin char, active boolean, jobs_today bigint)
language plpgsql security definer as $$
begin
  return query
    select w.id, w.name, w.pin, w.active,
           count(j.id) filter (where j.date = current_date)
    from workers w
    left join jobs j on j.worker_id = w.id
    group by w.id, w.name, w.pin, w.active
    order by w.name;
end;$$;

create or replace function admin_add_worker(p_name text, p_pin text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if exists (select 1 from workers where pin = p_pin) then
    raise exception 'pin_taken';
  end if;
  insert into workers (name, pin) values (p_name, p_pin) returning id into v_id;
  return v_id;
end;$$;

create or replace function admin_get_materials()
returns table (id uuid, name_pt text, name_de text)
language plpgsql security definer as $$
begin
  return query select m.id, m.name_pt, m.name_de from materials m order by m.name_pt;
end;$$;

grant execute on function admin_get_today_jobs() to anon;
grant execute on function admin_create_job(text,text,text,date,time,uuid,uuid[],text[]) to anon;
grant execute on function admin_get_workers() to anon;
grant execute on function admin_add_worker(text,text) to anon;
grant execute on function admin_get_materials() to anon;

-- ── F5: Web Push ──────────────────────────

-- Add push_subscription column if not present (safe on fresh schema)
alter table workers add column if not exists push_subscription jsonb;

create or replace function save_push_subscription(p_pin text, p_subscription jsonb)
returns void language plpgsql security definer as $$
begin
  update workers set push_subscription = p_subscription where pin = p_pin and active = true;
end;$$;

grant execute on function save_push_subscription(text, jsonb) to anon;
