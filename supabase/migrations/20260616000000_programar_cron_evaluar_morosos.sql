-- =============================================================================
-- PROGRAMAR EL BLOQUEO AUTOMÁTICO DE CLIENTES MOROSOS (pg_cron)
-- -----------------------------------------------------------------------------
-- La función public.fn_evaluar_clientes_morosos() existía pero no se ejecutaba
-- sola. Aquí se habilita pg_cron (patrón oficial Supabase) y se programa su
-- ejecución diaria, cumpliendo la métrica de éxito del proyecto: suspender el
-- crédito de los clientes con deuda vencida (>30 días) cada noche.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- '0 6 * * *' = 06:00 UTC = 00:00 America/Mexico_City (Irapuato, UTC-6 sin DST).
-- cron.schedule es idempotente por nombre de job (pg_cron >= 1.4): re-ejecutar no duplica.
select cron.schedule(
  'evaluar-clientes-morosos',
  '0 6 * * *',
  $$ select public.fn_evaluar_clientes_morosos(); $$
);
