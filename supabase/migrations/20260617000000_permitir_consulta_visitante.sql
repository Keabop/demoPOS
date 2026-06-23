-- Permite al rol VISITANTE consultar (solo lectura) precios e historial de clientes
-- / estados de cuenta. El visitante ya tenía SELECT en productos; aquí se agrega
-- SELECT en clientes, ventas, ventas_detalles y pagos_credito. Sin escritura.

-- Helper: visitante ACTIVO (espejo de es_operador). Un visitante desactivado
-- (activo=false) pierde el acceso, igual que admin/vendedor.
create or replace function public.es_visitante()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$ select coalesce((select rol = 'visitante' and activo from public.perfiles where id = auth.uid()), false); $$;

revoke execute on function public.es_visitante() from anon;

drop policy if exists "clientes_select_visitante" on public.clientes;
create policy "clientes_select_visitante" on public.clientes
  for select to authenticated using (public.es_visitante());

drop policy if exists "ventas_select_visitante" on public.ventas;
create policy "ventas_select_visitante" on public.ventas
  for select to authenticated using (public.es_visitante());

drop policy if exists "ventas_detalles_select_visitante" on public.ventas_detalles;
create policy "ventas_detalles_select_visitante" on public.ventas_detalles
  for select to authenticated using (public.es_visitante());

drop policy if exists "pagos_credito_select_visitante" on public.pagos_credito;
create policy "pagos_credito_select_visitante" on public.pagos_credito
  for select to authenticated using (public.es_visitante());
