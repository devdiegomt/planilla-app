-- planilla-app — solo correos del colegio pueden sincronizar.
--
-- El filtro del navegador (lib/allowedDomain.ts) avisa temprano, pero se salta.
-- Esta es la puerta de verdad: aunque alguien cree una cuenta con otro correo,
-- no puede leer ni escribir una sola fila.
--
-- OJO: esto controla QUIÉN ENTRA, no qué se queda afuera. Los datos viven en el
-- navegador de cada docente; desactivarle el correo no se los borra. Para eso
-- está el borrado de salida en Ajustes.

-- ---------------------------------------------------------------------------
-- PASO 1 — ANTES DE APLICAR NADA, mira a quién dejarías afuera.
--
-- Corre SOLO esto primero. Si aparece tu propia cuenta, o la de alguien que
-- está usando la app, resuélvelo antes de seguir: cambiar de correo obliga a
-- volver a subir los datos desde el dispositivo que los tenga.
-- ---------------------------------------------------------------------------
-- select
--   u.email,
--   count(s.*) as filas_sincronizadas
-- from auth.users u
-- left join public.sync_records s on s.user_id = u.id
-- where lower(regexp_replace(u.email, '^.*@', '')) <> 'gla.edu.co'
-- group by u.email
-- order by filas_sincronizadas desc;

-- ---------------------------------------------------------------------------
-- PASO 2 — La regla.
-- ---------------------------------------------------------------------------

-- El dominio es lo que va después de la ÚLTIMA arroba, comparado completo.
-- Con 'like %gla.edu.co', un correo en 'gla.edu.co.otrositio.com' pasaría.
create or replace function public.es_correo_institucional()
returns boolean
language sql
stable
as $$
  select lower(regexp_replace(coalesce(auth.jwt() ->> 'email', ''), '^.*@', ''))
         = 'gla.edu.co';
$$;

-- Las políticas se rehacen sumando la condición del dominio a la de siempre
-- (cada quien solo ve lo suyo). Las dos tienen que cumplirse.
drop policy if exists "own records select" on public.sync_records;
drop policy if exists "own records insert" on public.sync_records;
drop policy if exists "own records update" on public.sync_records;
drop policy if exists "own records delete" on public.sync_records;

create policy "own records select" on public.sync_records
  for select using (user_id = auth.uid() and public.es_correo_institucional());
create policy "own records insert" on public.sync_records
  for insert with check (user_id = auth.uid() and public.es_correo_institucional());
create policy "own records update" on public.sync_records
  for update using (user_id = auth.uid() and public.es_correo_institucional());
create policy "own records delete" on public.sync_records
  for delete using (user_id = auth.uid() and public.es_correo_institucional());

-- Las suscripciones a notificaciones, igual.
drop policy if exists "own push subs select" on public.push_subscriptions;
drop policy if exists "own push subs insert" on public.push_subscriptions;
drop policy if exists "own push subs update" on public.push_subscriptions;
drop policy if exists "own push subs delete" on public.push_subscriptions;

create policy "own push subs select" on public.push_subscriptions
  for select using (user_id = auth.uid() and public.es_correo_institucional());
create policy "own push subs insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid() and public.es_correo_institucional());
create policy "own push subs update" on public.push_subscriptions
  for update using (user_id = auth.uid() and public.es_correo_institucional());
create policy "own push subs delete" on public.push_subscriptions
  for delete using (user_id = auth.uid() and public.es_correo_institucional());

-- El cron sigue funcionando: usa la service_role key, que no pasa por RLS.

-- ---------------------------------------------------------------------------
-- PASO 3 (opcional) — cerrar también el registro.
--
-- Lo de arriba impide sincronizar, pero alguien con otro correo todavía puede
-- crear la cuenta y usar la app en local. Para que ni eso: en el panel de
-- Supabase, Authentication → Sign In / Providers → Email, y dejar la app solo
-- por invitación, o configurar un hook "Before User Created" que rechace los
-- dominios de afuera. Se hace desde el panel, no desde aquí.
-- ---------------------------------------------------------------------------
