-- =============================================================================
-- SOFT-DELETE DE USUARIOS (columna `activo` en perfiles)
-- -----------------------------------------------------------------------------
-- Permite "dar de baja" a un usuario (p.ej. un vendedor) sin borrarlo físicamente,
-- conservando su historial de ventas y movimientos (que lo referencian con
-- ON DELETE RESTRICT). Un usuario desactivado no puede iniciar sesión ni operar.
-- =============================================================================

alter table public.perfiles
  add column if not exists activo boolean not null default true;

comment on column public.perfiles.activo is
  'FALSE = cuenta desactivada (soft-delete): no inicia sesión ni opera, pero conserva su historial.';

-- Bloqueo centralizado: los helpers que usan TODAS las políticas RLS ahora exigen
-- activo = true. Así un usuario desactivado pierde acceso a toda la base (no solo UI),
-- incluso con un token válido vigente.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select rol = 'admin' and activo from public.perfiles where id = auth.uid()), false); $$;

create or replace function public.es_operador()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select rol in ('admin','vendedor') and activo from public.perfiles where id = auth.uid()), false); $$;
