// src/lib/demo/schema_01_estructura.ts — secuencias, columnas, tablas y materializadas nuevas (post-snapshot)
//
// Estructura aditiva extraída de las migraciones de AGROMAR posteriores al snapshot
// 2026-06-22 (el snapshot base vive en schema.ts). Se portó SOLO lo estructural:
// secuencias, columnas, tablas nuevas y las funciones/triggers de MATERIALIZACIÓN.
// NO se incluyen RPCs de negocio (fn_cliente_*, fn_registrar_devolucion, fn_*_kpis,
// fn_registrar_compra_local, fn_audit, etc.) — esas las portan otros módulos.
//
// Transformaciones para PGlite (mismas reglas que schema.ts):
//   - quitado: ENABLE ROW LEVEL SECURITY, CREATE/DROP POLICY, GRANT/REVOKE,
//     ALTER DEFAULT PRIVILEGES, cron.*, storage.*, COMMENT ON, refs a auth.users/roles.
//   - uuid_generate_v4() -> gen_random_uuid().
//   - auth.uid() y los guards es_operador()/es_admin() se conservan (ya existen en schema.ts).
//   - idempotente: IF NOT EXISTS en sequence/column/table/index, CREATE OR REPLACE en
//     funciones, DROP TRIGGER IF EXISTS antes de CREATE TRIGGER, y para los CHECK/UNIQUE
//     se usa DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
export const SQL_01_ESTRUCTURA = /* sql */ `
-- =====================================================================
-- A) SECUENCIAS (Grupo 2 folios + devoluciones + pago a proveedor)
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS seq_folio_venta START 1;
CREATE SEQUENCE IF NOT EXISTS seq_folio_abono START 1;
CREATE SEQUENCE IF NOT EXISTS seq_folio_orden START 1;
CREATE SEQUENCE IF NOT EXISTS seq_folio_cotizacion START 1;
CREATE SEQUENCE IF NOT EXISTS seq_numero_cliente START 1;
CREATE SEQUENCE IF NOT EXISTS seq_folio_devolucion START 1;
CREATE SEQUENCE IF NOT EXISTS seq_folio_pago_proveedor START 1;

-- =====================================================================
-- B) COLUMNAS NUEVAS sobre tablas del snapshot
-- =====================================================================

-- productos (Grupo 1): tres precios de venta + IEPS por producto.
-- precio_publico se conserva como "Contado"; precio_mayoreo queda inerte (DEFAULT 0).
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio_credito          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_subdistribuidor  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasa_ieps               numeric NOT NULL DEFAULT 0;
ALTER TABLE public.productos ALTER COLUMN precio_mayoreo SET DEFAULT 0;

-- clientes (Grupo 1): nivel de precio.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nivel_precio varchar NOT NULL DEFAULT 'contado';
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_nivel_precio_chk;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_nivel_precio_chk
  CHECK (nivel_precio IN ('contado','credito','subdistribuidor'));

-- clientes (Grupo 2): número de cliente secuencial.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS numero_cliente integer DEFAULT nextval('seq_numero_cliente');
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_numero_cliente_uk;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_numero_cliente_uk UNIQUE (numero_cliente);

-- clientes (excepción/archivado): SOLO columnas (las fn_cliente_* las porta otro módulo).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS exento_bloqueo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archivado      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archivado_en   timestamptz;

-- clientes (materialización de crédito): columnas mantenidas por triggers (sección D).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS credito_cartera      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_proxima_venc date;

-- ventas (Grupo 1): IEPS + nivel_precio capturado.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS ieps         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nivel_precio varchar;

-- ventas (Fase 1): indicador de devolución parcial (la total marca estado='devuelta').
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS tiene_devolucion_parcial boolean NOT NULL DEFAULT false;

-- ventas (materialización de abonado): columna mantenida por trigger (sección D).
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS abonado numeric NOT NULL DEFAULT 0;

-- ventas (Devoluciones): el estado ahora admite 'devuelta' (devolución total).
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_estado_check
  CHECK (((estado)::text = ANY ((ARRAY['cobrada'::character varying, 'pendiente'::character varying, 'cancelada'::character varying, 'devuelta'::character varying])::text[])));

-- ventas_detalles (Grupo 1): IEPS por línea.
ALTER TABLE public.ventas_detalles
  ADD COLUMN IF NOT EXISTS ieps numeric NOT NULL DEFAULT 0;

-- ordenes_compra (Grupo 2): folio secuencial por defecto.
ALTER TABLE public.ordenes_compra ALTER COLUMN folio SET DEFAULT nextval('seq_folio_orden')::text;

-- ordenes_compra (G7): tipo formal/local + datos de compra local y cuentas por pagar.
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS tipo             varchar NOT NULL DEFAULT 'formal',
  ADD COLUMN IF NOT EXISTS folio_proveedor  varchar,
  ADD COLUMN IF NOT EXISTS metodo_pago      varchar,
  ADD COLUMN IF NOT EXISTS ieps             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_proveedor  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date;
ALTER TABLE public.ordenes_compra DROP CONSTRAINT IF EXISTS ordenes_compra_tipo_check;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_tipo_check
  CHECK (tipo IN ('formal','local'));

-- ordenes_compra_detalles (G7): IEPS por línea.
ALTER TABLE public.ordenes_compra_detalles
  ADD COLUMN IF NOT EXISTS tasa_ieps numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps      numeric NOT NULL DEFAULT 0;

-- proveedores (G7): marca de proveedor local.
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS local boolean NOT NULL DEFAULT false;

-- movimientos_inventario (Fase 1): trazabilidad de usuario.
-- El DEFAULT lo captura auth.uid() (stub de sesión); FK suave a perfiles.
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS usuario_id uuid DEFAULT auth.uid()
  REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- perfiles (perfiles configurables): metadatos. No hay migración; columnas aditivas.
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS etiqueta  varchar;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS plantilla varchar;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS permisos  jsonb;

-- =====================================================================
-- C) TABLAS NUEVAS (uuid_generate_v4() -> gen_random_uuid())
-- =====================================================================

-- Devoluciones (G5/R13): cabecera ligada a la venta original.
CREATE TABLE IF NOT EXISTS public.devoluciones (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id         uuid           NOT NULL REFERENCES public.ventas(id),
  folio            varchar        NOT NULL DEFAULT nextval('seq_folio_devolucion')::text,
  vendedor_id      uuid           REFERENCES public.perfiles(id),
  fecha            timestamptz    NOT NULL DEFAULT now(),
  motivo           varchar,
  monto_devuelto   numeric(10,2)  NOT NULL DEFAULT 0,
  metodo_reembolso varchar
);

-- Líneas devueltas (cantidad por línea de la venta; reingresa o merma).
CREATE TABLE IF NOT EXISTS public.devoluciones_detalles (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id    uuid           NOT NULL REFERENCES public.devoluciones(id) ON DELETE CASCADE,
  venta_detalle_id uuid           NOT NULL REFERENCES public.ventas_detalles(id),
  producto_id      uuid           REFERENCES public.productos(id),
  lote_id          uuid,
  cantidad         numeric(10,2)  NOT NULL CHECK (cantidad > 0),
  monto            numeric(10,2)  NOT NULL,
  reingresa        boolean        NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_venta    ON public.devoluciones(venta_id);
CREATE INDEX IF NOT EXISTS idx_devdet_devolucion     ON public.devoluciones_detalles(devolucion_id);
CREATE INDEX IF NOT EXISTS idx_devdet_ventadetalle   ON public.devoluciones_detalles(venta_detalle_id);

-- Pagos a proveedor (G7): cuentas por pagar de compras locales a crédito.
CREATE TABLE IF NOT EXISTS public.pagos_proveedor (
  id        uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id  uuid           NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  monto     numeric(10,2)  NOT NULL CHECK (monto > 0),
  metodo    varchar        NOT NULL,
  folio     varchar        NOT NULL,
  fecha     timestamptz    NOT NULL DEFAULT now(),
  creado_en timestamptz    DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_orden ON public.pagos_proveedor(orden_id);

-- Bitácora de auditoría (Fase 2): SOLO la tabla (sin fn_audit ni triggers, sin RLS).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id             bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en    timestamptz   NOT NULL DEFAULT now(),
  usuario_id     uuid,
  usuario_nombre text,
  tabla          text          NOT NULL,
  operacion      text          NOT NULL,
  registro_id    text,
  datos_antes    jsonb,
  datos_despues  jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ocurrido ON public.audit_log (ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla    ON public.audit_log (tabla);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario  ON public.audit_log (usuario_id);

-- =====================================================================
-- D) MATERIALIZACIÓN crédito/abonado (funciones + triggers de mantenimiento)
--    Mantienen clientes.credito_cartera / credito_proxima_venc y ventas.abonado.
--    NO se portan los backfills (son data; los triggers mantienen las columnas
--    a medida que el seed inserta ventas/pagos).
-- =====================================================================

-- Derivación del estatus (versión final, post-hardening: search_path fijo).
CREATE OR REPLACE FUNCTION public._estatus_credito(p_cartera numeric, p_proxima_venc date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_cartera, 0) <= 0          THEN 'al-corriente'
    WHEN p_proxima_venc <  CURRENT_DATE       THEN 'vencida'
    WHEN p_proxima_venc <= CURRENT_DATE + 7   THEN 'por-vencer'
    ELSE 'al-corriente'
  END;
$function$;

-- Recálculo de las columnas de crédito de UN cliente, desde tablas base.
CREATE OR REPLACE FUNCTION public.fn_recalc_credito_cliente(p_cliente uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL THEN RETURN; END IF;
  UPDATE clientes c SET
    credito_cartera      = COALESCE(sub.cartera, 0),
    credito_proxima_venc = sub.proxima_venc
  FROM (
    SELECT
      COALESCE(SUM(saldo) FILTER (WHERE saldo > 0), 0) AS cartera,
      MIN(fecha_venc)     FILTER (WHERE saldo > 0)     AS proxima_venc
    FROM (
      SELECT
        GREATEST(v.total - COALESCE((SELECT SUM(pc.monto) FROM pagos_credito pc WHERE pc.venta_id = v.id), 0), 0) AS saldo,
        (v.fecha::date + ((COALESCE(v.plazo_dias, cli.dias_credito, 30) || ' days')::interval))::date AS fecha_venc
      FROM ventas v
      JOIN clientes cli ON cli.id = v.cliente_id
      WHERE v.cliente_id = p_cliente AND v.tipo_pago = 'credito' AND v.estado <> 'cancelada'
    ) notas
  ) sub
  WHERE c.id = p_cliente;
END;
$function$;

-- Recalcular abonado de UNA venta desde sus pagos.
CREATE OR REPLACE FUNCTION public.fn_recalc_abonado_venta(p_venta uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF p_venta IS NULL THEN RETURN; END IF;
  UPDATE ventas
  SET abonado = (SELECT COALESCE(SUM(monto), 0) FROM pagos_credito WHERE venta_id = p_venta)
  WHERE id = p_venta;
END;
$function$;

-- Trigger fn: ventas -> recalcular crédito del/los cliente(s) afectados.
CREATE OR REPLACE FUNCTION public.trg_credito_desde_ventas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo_pago = 'credito' THEN PERFORM public.fn_recalc_credito_cliente(OLD.cliente_id); END IF;
    RETURN OLD;
  END IF;
  -- INSERT/UPDATE: recalcular al cliente actual…
  IF NEW.tipo_pago = 'credito' OR (TG_OP = 'UPDATE' AND OLD.tipo_pago = 'credito') THEN
    PERFORM public.fn_recalc_credito_cliente(NEW.cliente_id);
  END IF;
  -- …y si cambió de cliente, también al anterior.
  IF TG_OP = 'UPDATE' AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id AND OLD.tipo_pago = 'credito' THEN
    PERFORM public.fn_recalc_credito_cliente(OLD.cliente_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger fn: pagos_credito -> recalcular crédito del cliente de esa venta.
CREATE OR REPLACE FUNCTION public.trg_credito_desde_pagos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_cliente uuid;
BEGIN
  SELECT cliente_id INTO v_cliente FROM ventas WHERE id = COALESCE(NEW.venta_id, OLD.venta_id);
  PERFORM public.fn_recalc_credito_cliente(v_cliente);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger fn: clientes.dias_credito -> mueve vencimientos -> recalcular.
CREATE OR REPLACE FUNCTION public.trg_credito_desde_clientes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  PERFORM public.fn_recalc_credito_cliente(NEW.id);
  RETURN NEW;
END;
$function$;

-- Trigger fn: pagos_credito -> materializar ventas.abonado (independiente del de crédito).
CREATE OR REPLACE FUNCTION public.trg_materializar_abonado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  PERFORM public.fn_recalc_abonado_venta(COALESCE(NEW.venta_id, OLD.venta_id));
  IF TG_OP = 'UPDATE' AND NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
    PERFORM public.fn_recalc_abonado_venta(OLD.venta_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Triggers (versión final: ventas acotado a columnas que afectan el crédito, para
-- que materializar 'abonado' no re-dispare el recálculo de crédito del cliente).
DROP TRIGGER IF EXISTS trg_credito_desde_ventas ON public.ventas;
CREATE TRIGGER trg_credito_desde_ventas
  AFTER INSERT OR DELETE OR UPDATE OF cliente_id, total, plazo_dias, estado, tipo_pago
  ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.trg_credito_desde_ventas();

DROP TRIGGER IF EXISTS trg_credito_desde_pagos ON public.pagos_credito;
CREATE TRIGGER trg_credito_desde_pagos
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos_credito
  FOR EACH ROW EXECUTE FUNCTION public.trg_credito_desde_pagos();

DROP TRIGGER IF EXISTS trg_credito_desde_clientes ON public.clientes;
CREATE TRIGGER trg_credito_desde_clientes
  AFTER UPDATE OF dias_credito ON public.clientes
  FOR EACH ROW WHEN (OLD.dias_credito IS DISTINCT FROM NEW.dias_credito)
  EXECUTE FUNCTION public.trg_credito_desde_clientes();

DROP TRIGGER IF EXISTS trg_materializar_abonado ON public.pagos_credito;
CREATE TRIGGER trg_materializar_abonado
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos_credito
  FOR EACH ROW EXECUTE FUNCTION public.trg_materializar_abonado();

-- Índices parciales para el listado de Notas a Crédito (dependen de ventas.abonado).
CREATE INDEX IF NOT EXISTS idx_ventas_credito_fecha
  ON public.ventas (fecha DESC, id DESC)
  WHERE tipo_pago = 'credito';
CREATE INDEX IF NOT EXISTS idx_ventas_credito_activas
  ON public.ventas (fecha DESC, id DESC)
  WHERE tipo_pago = 'credito' AND estado <> 'cancelada' AND total > abonado;
`;
