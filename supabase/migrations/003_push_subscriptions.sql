-- v3.1: push notifications.
-- Correr en Dashboard → SQL Editor → New query.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,       -- URL única del push service (FCM, Mozilla, Apple, etc.)
  keys_p256dh text not null,           -- clave pública EC del subscriber
  keys_auth text not null,             -- secreto auth compartido
  user_agent text,                     -- opcional: para saber qué navegador/dispositivo
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subs select" on public.push_subscriptions;
drop policy if exists "own push subs insert" on public.push_subscriptions;
drop policy if exists "own push subs update" on public.push_subscriptions;
drop policy if exists "own push subs delete" on public.push_subscriptions;

create policy "own push subs select" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "own push subs insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "own push subs update" on public.push_subscriptions
  for update using (user_id = auth.uid());
create policy "own push subs delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- Verificación:
-- select user_id, endpoint, created_at from public.push_subscriptions;
