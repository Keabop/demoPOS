// src/lib/demo/schema_all.ts
// Ensamblado del esquema COMPLETO de la demo: esquema base (snapshot 2026-06-22) +
// las migraciones post-snapshot portadas a PGlite, en orden de dependencia.
// Se usa IGUAL en runtime (db.ts) y en los tests, para que carguen exactamente lo mismo.
import { DEMO_SCHEMA_SQL } from './schema';
import { SQL_01_ESTRUCTURA } from './schema_01_estructura';
import { SQL_02_NUCLEO } from './schema_02_nucleo';
import { SQL_03_DEV_CARTERA } from './schema_03_dev_cartera';
import { SQL_04_LISTADOS } from './schema_04_listados';
import { SQL_05_G7_BITACORA } from './schema_05_g7_bitacora';

// Firmas VIEJAS del snapshot que schema_02 reemplaza con firma nueva; se quitan para que
// no queden como sobrecargas huérfanas y se resuelva la versión equivocada por nº de args.
const DROP_RECONCILIACION = /* sql */ `
DROP FUNCTION IF EXISTS public.fn_registrar_venta_completa(character varying, uuid, uuid, character varying, numeric, numeric, numeric, jsonb, integer);
DROP FUNCTION IF EXISTS public.fn_registrar_abono(uuid, numeric, character varying);
`;

export const FULL_SCHEMA_SQL = [
  DEMO_SCHEMA_SQL,
  DROP_RECONCILIACION,
  SQL_01_ESTRUCTURA,   // secuencias, columnas, tablas nuevas, materializadas
  SQL_02_NUCLEO,       // venta/abono/folio/interés (firmas nuevas)
  SQL_03_DEV_CARTERA,  // devoluciones, vw_ventas_historial, cartera
  SQL_04_LISTADOS,     // listados/KPIs/dashboard/reportes + vistas
  SQL_05_G7_BITACORA,  // compras locales + bitácora (fn_audit + triggers)
].join('\n');
