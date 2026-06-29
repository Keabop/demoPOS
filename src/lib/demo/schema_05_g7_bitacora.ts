// src/lib/demo/schema_05_g7_bitacora.ts — G7 compras locales + bitácora (fn_audit + triggers)
// Portado de las migraciones reales de AGROMAR para PGlite (Postgres-WASM en navegador):
//   - 20260626000002_g7_proveedores_locales.sql  (funciones + vistas de G7; fn_ordenes_kpis FINAL con tipo='formal')
//   - 20260627065100_fase2_bitacora_tabla_funcion_triggers.sql  (fn_audit + triggers trg_audit en las 17 tablas)
// Transformaciones aplicadas:
//   - QUITADO: GRANT/REVOKE, RLS/POLICY, ALTER DEFAULT PRIVILEGES, COMMENT ON, cron, storage.
//   - QUITADO: WITH (security_invoker = true) de las vistas.
//   - DROP VIEW IF EXISTS antes de CREATE VIEW; DROP TRIGGER IF EXISTS antes de CREATE TRIGGER.
//   - Conservados: auth.uid() (stub en schema.ts), SECURITY DEFINER, search_path y los guards es_operador()/es_visitante().
// DEPENDENCIAS (las crea otro subagente ANTES en el orden de carga; se asumen existentes):
//   - proveedores.local; ordenes_compra.{tipo,folio_proveedor,metodo_pago,ieps,saldo_proveedor,fecha_vencimiento}
//   - ordenes_compra_detalles.{tasa_ieps,ieps}; tabla pagos_proveedor; tabla audit_log
//   - secuencias seq_folio_orden y seq_folio_pago_proveedor
//   - tablas devoluciones y devoluciones_detalles (para sus triggers de bitácora)
export const SQL_05_G7_BITACORA = /* sql */ `
-- ============================================================
-- G7: KPIs, RPCs y vistas de compras locales / cuentas por pagar
-- ============================================================

-- fn_ordenes_kpis: KPIs de Órdenes solo cuentan las FORMALES (versión final de G7)
CREATE OR REPLACE FUNCTION public.fn_ordenes_kpis()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pendientes', COUNT(*) FILTER (WHERE estado IN ('borrador','enviada')),
    'comprado', COALESCE(SUM(total) FILTER (WHERE estado = 'recibida'), 0)
  ) INTO v_result FROM ordenes_compra WHERE tipo = 'formal';
  RETURN v_result;
END;
$function$;

-- fn_compras_locales_kpis: KPIs de compras locales (comprado / por pagar / n)
CREATE OR REPLACE FUNCTION public.fn_compras_locales_kpis()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SELECT jsonb_build_object(
    'comprado', COALESCE(SUM(total), 0),
    'por_pagar', COALESCE(SUM(saldo_proveedor) FILTER (WHERE metodo_pago = 'credito'), 0),
    'n', COUNT(*)
  ) INTO v FROM ordenes_compra WHERE tipo = 'local';
  RETURN v;
END;
$function$;

-- fn_registrar_compra_local: captura compra local + inventario + cuentas por pagar
CREATE OR REPLACE FUNCTION public.fn_registrar_compra_local(
  p_proveedor_id uuid,
  p_folio_proveedor varchar,
  p_metodo_pago varchar,
  p_fecha timestamptz,
  p_vencimiento date,
  p_lineas jsonb,
  p_actualizar_precios boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_orden_id uuid; v_folio varchar; v_lin record; v_lote_id uuid;
  v_subtotal numeric(12,2) := 0; v_ieps numeric(12,2) := 0; v_total numeric(12,2);
  v_sub_linea numeric(12,2); v_ieps_linea numeric(12,2); v_saldo numeric(12,2);
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar compras.';
  END IF;
  IF p_proveedor_id IS NULL THEN RAISE EXCEPTION 'Proveedor requerido.'; END IF;
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('contado','credito') THEN
    RAISE EXCEPTION 'Método de pago inválido: %.', p_metodo_pago;
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene partidas.';
  END IF;

  v_folio := nextval('seq_folio_orden')::text;

  INSERT INTO ordenes_compra (folio, proveedor_id, estado, tipo, folio_proveedor, metodo_pago,
                              fecha, fecha_recepcion, fecha_vencimiento, tasa_iva, subtotal, iva, ieps, total,
                              saldo_proveedor, creado_por)
  VALUES (v_folio, p_proveedor_id, 'recibida', 'local', nullif(btrim(p_folio_proveedor), ''), p_metodo_pago,
          COALESCE(p_fecha, now()), COALESCE(p_fecha, now()),
          CASE WHEN p_metodo_pago = 'credito' THEN p_vencimiento ELSE NULL END,
          0, 0, 0, 0, 0, 0, auth.uid())
  RETURNING id INTO v_orden_id;

  FOR v_lin IN
    SELECT * FROM jsonb_to_recordset(p_lineas) AS x(
      producto_id uuid, cantidad numeric, costo_unitario numeric, tasa_ieps numeric,
      precio_publico numeric, precio_credito numeric, precio_subdistribuidor numeric)
  LOOP
    IF v_lin.producto_id IS NULL OR v_lin.cantidad IS NULL OR v_lin.cantidad <= 0
       OR v_lin.costo_unitario IS NULL OR v_lin.costo_unitario < 0 THEN
      RAISE EXCEPTION 'Partida inválida (producto/cantidad/costo).';
    END IF;
    v_sub_linea := round(v_lin.costo_unitario * v_lin.cantidad, 2);
    v_ieps_linea := round(v_sub_linea * COALESCE(v_lin.tasa_ieps, 0), 2);
    v_subtotal := v_subtotal + v_sub_linea;
    v_ieps := v_ieps + v_ieps_linea;

    INSERT INTO ordenes_compra_detalles (orden_id, producto_id, descripcion, presentacion,
                                         cantidad, precio_unitario, subtotal, tasa_ieps, ieps)
    SELECT v_orden_id, v_lin.producto_id, pr.nombre, pr.unidad,
           v_lin.cantidad, v_lin.costo_unitario, v_sub_linea, COALESCE(v_lin.tasa_ieps, 0), v_ieps_linea
    FROM productos pr WHERE pr.id = v_lin.producto_id;

    INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, descripcion)
    VALUES (v_lin.producto_id, 'entrada', v_lin.cantidad, v_folio, 'Compra local ' || v_folio)
    RETURNING lote_id INTO v_lote_id;
    IF v_lote_id IS NOT NULL THEN UPDATE lotes SET costo = v_lin.costo_unitario WHERE id = v_lote_id; END IF;
    UPDATE productos SET costo = v_lin.costo_unitario WHERE id = v_lin.producto_id;
    INSERT INTO proveedor_productos (proveedor_id, producto_id, precio_compra)
    VALUES (p_proveedor_id, v_lin.producto_id, v_lin.costo_unitario)
    ON CONFLICT (proveedor_id, producto_id) DO UPDATE SET precio_compra = excluded.precio_compra, actualizado_en = now();

    IF p_actualizar_precios THEN
      UPDATE productos SET
        precio_publico = COALESCE(v_lin.precio_publico, precio_publico),
        precio_credito = COALESCE(v_lin.precio_credito, precio_credito),
        precio_subdistribuidor = COALESCE(v_lin.precio_subdistribuidor, precio_subdistribuidor)
      WHERE id = v_lin.producto_id;
    END IF;
  END LOOP;

  v_total := round(v_subtotal + v_ieps, 2);
  v_saldo := CASE WHEN p_metodo_pago = 'credito' THEN v_total ELSE 0 END;
  UPDATE ordenes_compra SET subtotal = v_subtotal, ieps = v_ieps, total = v_total, saldo_proveedor = v_saldo
  WHERE id = v_orden_id;

  RETURN json_build_object('orden_id', v_orden_id, 'folio', v_folio, 'total', v_total, 'saldo_proveedor', v_saldo);
END;
$function$;

-- fn_registrar_pago_proveedor: baja el saldo por pagar (NO toca caja)
CREATE OR REPLACE FUNCTION public.fn_registrar_pago_proveedor(
  p_orden_id uuid, p_monto numeric, p_metodo varchar, p_fecha timestamptz DEFAULT now()
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tipo varchar; v_metodo_pago varchar; v_saldo numeric(12,2); v_folio varchar;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar pagos a proveedor.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0.'; END IF;
  IF p_metodo IS NULL OR p_metodo NOT IN ('efectivo','transferencia','tarjeta','debito','cheque') THEN
    RAISE EXCEPTION 'Método de pago inválido: %.', p_metodo;
  END IF;
  SELECT tipo, metodo_pago, saldo_proveedor INTO v_tipo, v_metodo_pago, v_saldo
  FROM ordenes_compra WHERE id = p_orden_id FOR UPDATE;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'Compra no encontrada.'; END IF;
  IF v_tipo <> 'local' OR v_metodo_pago <> 'credito' THEN
    RAISE EXCEPTION 'Solo se registran pagos en compras locales a crédito.';
  END IF;
  IF p_monto > v_saldo THEN RAISE EXCEPTION 'El pago (%) excede el saldo por pagar (%).', p_monto, v_saldo; END IF;
  v_folio := nextval('seq_folio_pago_proveedor')::text;
  INSERT INTO pagos_proveedor (orden_id, monto, metodo, folio, fecha)
  VALUES (p_orden_id, p_monto, p_metodo, v_folio, COALESCE(p_fecha, now()));
  UPDATE ordenes_compra SET saldo_proveedor = round(saldo_proveedor - p_monto, 2) WHERE id = p_orden_id;
  RETURN v_folio;
END;
$function$;

-- vw_ordenes_compra: orden de compra + nombre del proveedor (recreada para exponer columnas de G7)
DROP VIEW IF EXISTS public.vw_ordenes_compra;
CREATE VIEW public.vw_ordenes_compra AS
SELECT o.*, p.nombre AS proveedor_nombre
FROM public.ordenes_compra o
LEFT JOIN public.proveedores p ON p.id = o.proveedor_id;

-- vw_proveedores_saldo: proveedores + saldo_por_pagar (cuentas por pagar locales a crédito)
DROP VIEW IF EXISTS public.vw_proveedores_saldo;
CREATE VIEW public.vw_proveedores_saldo AS
SELECT p.*,
  COALESCE((SELECT sum(o.saldo_proveedor) FROM public.ordenes_compra o
            WHERE o.proveedor_id = p.id AND o.tipo = 'local' AND o.metodo_pago = 'credito'), 0) AS saldo_por_pagar
FROM public.proveedores p;

-- ============================================================
-- Bitácora de auditoría: función genérica + triggers en las 17 tablas
-- (la tabla audit_log la crea otro subagente; aquí solo fn_audit + trg_audit)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_reg_id text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT nombre INTO v_nombre FROM perfiles WHERE id = v_uid;
  END IF;
  v_reg_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id');
  INSERT INTO public.audit_log (usuario_id, usuario_nombre, tabla, operacion, registro_id, datos_antes, datos_despues)
  VALUES (
    v_uid,
    COALESCE(v_nombre, CASE WHEN v_uid IS NULL THEN 'sistema' ELSE NULL END),
    TG_TABLE_NAME,
    TG_OP,
    v_reg_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;
END;
$fn$;

-- Triggers AFTER en las 17 tablas de negocio (DROP IF EXISTS + CREATE por tabla)
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','configuracion','devoluciones','devoluciones_detalles','lotes',
    'movimientos_caja','movimientos_inventario','ordenes_compra','ordenes_compra_detalles',
    'pagos_credito','pagos_proveedor','perfiles','productos','proveedor_productos',
    'proveedores','ventas','ventas_detalles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit()', t);
  END LOOP;
END
$do$;
`;
