-- ============================================================================
-- body_weight_logs
-- ----------------------------------------------------------------------------
-- Registro de peso CORPORAL a lo largo del tiempo (no confundir con
-- public.weight_logs, que es el peso levantado en cada ejercicio de una rutina).
--
-- Feature acotada a administradores: la RLS exige public.is_admin() ademas de
-- ser el dueño de la fila. Para abrirla a todos los usuarios mas adelante,
-- sacar la clausula `(select public.is_admin())` de las 4 policies y el gate
-- del cliente (ver src/pages/pesoCorporal.ts y el quick-action en
-- src/pages/profile.ts).
--
-- Una fila por (user_id, fecha): volver a cargar el peso de un dia ya cargado
-- pisa el valor anterior (upsert con onConflict), igual que weight_logs.
--
-- Aplicar con: Supabase Dashboard > SQL Editor, o mcp__supabase__apply_migration.
-- ============================================================================

create table if not exists public.body_weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  fecha      date not null,
  peso       numeric(6, 2) not null check (peso > 0 and peso < 1000),
  unidad     text not null default 'kg' check (unidad in ('kg', 'lb')),
  created_at timestamptz not null default now(),
  unique (user_id, fecha)
);

create index if not exists body_weight_logs_user_fecha_idx
  on public.body_weight_logs (user_id, fecha);

alter table public.body_weight_logs enable row level security;

-- Cada quien ve / carga / edita / borra unicamente su propio historial, y ademas
-- tiene que ser admin (feature acotada por ahora).
drop policy if exists "admin owner reads body weight" on public.body_weight_logs;
create policy "admin owner reads body weight"
  on public.body_weight_logs
  for select
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists "admin owner inserts body weight" on public.body_weight_logs;
create policy "admin owner inserts body weight"
  on public.body_weight_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists "admin owner updates body weight" on public.body_weight_logs;
create policy "admin owner updates body weight"
  on public.body_weight_logs
  for update
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists "admin owner deletes body weight" on public.body_weight_logs;
create policy "admin owner deletes body weight"
  on public.body_weight_logs
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

grant select, insert, update, delete on public.body_weight_logs to authenticated;
