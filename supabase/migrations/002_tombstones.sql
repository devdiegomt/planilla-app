-- Fase 2B: tombstones para deletes multi-dispositivo.
-- Correr en Dashboard → SQL Editor → New query, después del schema base.
--
-- Modelo: una fila con `deleted_at IS NOT NULL` es una lápida.
-- El resto del `data` puede quedar como estaba (lo ignora el cliente al aplicar).

alter table public.sync_records
  add column if not exists deleted_at timestamptz;

-- Índice parcial para filtrar tombstones al hacer pull incremental
create index if not exists sync_records_deleted_idx
  on public.sync_records (user_id, table_name, deleted_at)
  where deleted_at is not null;

-- Verificación:
-- select count(*) filter (where deleted_at is null) as live,
--        count(*) filter (where deleted_at is not null) as tombstones
-- from public.sync_records;
