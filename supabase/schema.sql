-- planilla-app — sync schema para Supabase.
-- Correr una sola vez en Dashboard → SQL Editor → New query.
--
-- Modelo: una sola tabla JSONB por usuario. Cada fila representa un registro
-- de cualquier tabla Dexie (courses, students, schedule, etc.), identificado
-- por (user_id, table_name, sync_id).

create extension if not exists "pgcrypto";

-- Tabla de sync
create table if not exists public.sync_records (
  sync_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, table_name, sync_id)
);

-- Índice para pulls incrementales por updated_at
create index if not exists sync_records_updated_at_idx
  on public.sync_records (user_id, table_name, updated_at desc);

-- Row Level Security: cada usuario solo ve/edita sus propios registros
alter table public.sync_records enable row level security;

drop policy if exists "own records select" on public.sync_records;
drop policy if exists "own records insert" on public.sync_records;
drop policy if exists "own records update" on public.sync_records;
drop policy if exists "own records delete" on public.sync_records;

create policy "own records select" on public.sync_records
  for select using (user_id = auth.uid());
create policy "own records insert" on public.sync_records
  for insert with check (user_id = auth.uid());
create policy "own records update" on public.sync_records
  for update using (user_id = auth.uid());
create policy "own records delete" on public.sync_records
  for delete using (user_id = auth.uid());

-- Verificación rápida:
-- select * from public.sync_records limit 5;
