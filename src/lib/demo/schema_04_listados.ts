// src/lib/demo/schema_04_listados.ts — listados/KPIs/dashboard/reportes/catálogo
// Portado VERBATIM desde las migraciones de AGROMAR para PGlite (Postgres-WASM en el navegador).
// Se toma la versión FINAL de cada objeto (varias migraciones redefinen; se usa la última fecha):
//   - vw_creditos_resumen           <- 20260624000005_fn_creditos_listado.sql       (reescrita con ventas.abonado)
//   - vw_clientes_cartera           <- 20260623222305_vistas_cartera.sql
//   - vw_clientes_estatus           <- 20260623222308_vw_clientes_estatus.sql        (usa vw_creditos_resumen)
//   - vw_productos                  <- 20260623222312_catalogo_listado.sql
//   - fn_reporte_ventas             <- 20260623222301_fn_reporte_ventas.sql
//   - fn_reporte_cobranza           <- 20260623222302_fn_reporte_cobranza.sql
//   - fn_reporte_inventario         <- 20260623222303_fn_reporte_inventario.sql
//   - fn_caja_build_shift + fn_reporte_caja <- 20260623222304_fn_reporte_caja.sql
//   - fn_categorias_productos       <- 20260623222306_fn_categorias_productos.sql
//   - fn_creditos_kpis              <- 20260624000005_fn_creditos_listado.sql
//   - fn_creditos_listado           <- 20260625000014_grupo2_listados_numero_cliente.sql (expone numero_cliente)
//   - fn_clientes_listado           <- 20260625000014_grupo2_listados_numero_cliente.sql (expone numero_cliente)
//   - fn_clientes_kpis              <- 20260625000000_clientes_excepcion_archivado.sql
//   - fn_dashboard                  <- 20260627160035_fix_dashboard_ventas_neto.sql   (ventas de hoy = neto)
//   - fn_dashboard_serie            <- 20260623222311_fn_dashboard.sql
//   - fn_historial_ventas_kpis      <- 20260623222310_ventas_historial.sql            (solo la función KPIs)
//   - fn_catalogo_kpis              <- 20260623222312_catalogo_listado.sql
// Transformaciones PGlite aplicadas:
//   - se omiten GRANT/REVOKE (no hay roles anon/authenticated/service_role en el shim).
//   - se quita `WITH (security_invoker = true)` de las vistas.
//   - se conservan SECURITY DEFINER, SET search_path, SET LOCAL statement_timeout y los guards
//     es_operador()/es_visitante() (definidos en schema.ts).
//   - en fn_caja_build_shift los backslashes del regex POSIX se escriben \\s \\$ \\- para que
//     sobrevivan al template literal de JS y PGlite reciba \s \$ \- (el patrón original).
// DEPENDENCIAS (creadas ANTES por otros pasos del esquema; este archivo debe cargarse DESPUÉS):
//   - schema.ts: tablas base, guards es_operador()/es_visitante()/es_admin(), auth.uid().
//   - schema_01_estructura.ts: columnas materializadas ventas.abonado, clientes.numero_cliente /
//     credito_cartera / credito_proxima_venc, y la función auxiliar _estatus_credito()
//     (sección "D) MATERIALIZACIÓN crédito/abonado"). OJO: schema_01 NO porta _cliente_credito(),
//     así que ese helper se define en ESTE archivo (antes de fn_clientes_listado/kpis).
//   - schema_03_dev_cartera.ts: vista vw_ventas_historial (la usa fn_historial_ventas_kpis) y la
//     tabla devoluciones (la usa fn_dashboard). NO se duplican aquí.
export const SQL_04_LISTADOS = /* sql */ `
-- ============================================================
-- VISTAS (van antes que las funciones/vistas que dependen de ellas)
-- ============================================================

-- Resumen por nota de credito: saldo, abonado, vencimiento y atraso ya calculados.
-- (version final: saldo desde la columna materializada ventas.abonado, sin GROUP BY global de pagos)
CREATE OR REPLACE VIEW public.vw_creditos_resumen AS
SELECT
  v.id, v.folio, v.fecha, v.total, v.plazo_dias, v.estado, v.cliente_id, v.vendedor_id,
  c.nombre AS cliente_nombre, c.rancho AS cliente_rancho, c.telefono AS cliente_telefono, c.dias_credito,
  v.abonado,
  GREATEST(v.total - v.abonado, 0) AS saldo,
  (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval))::date AS fecha_venc,
  CURRENT_DATE - (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval))::date AS atraso
FROM ventas v
LEFT JOIN clientes c ON c.id = v.cliente_id
WHERE v.tipo_pago = 'credito';

-- Cartera por cliente: saldo deudor real (suma de saldos de notas de credito).
CREATE OR REPLACE VIEW public.vw_clientes_cartera AS
SELECT
  c.id, c.nombre, c.rancho, c.telefono, c.lada, c.limite_credito, c.saldo_deudor,
  c.activo_para_credito, c.dias_credito, c.creado_en,
  COALESCE(SUM(GREATEST(v.total - COALESCE(pc.abonado, 0), 0)), 0) AS cartera
FROM clientes c
LEFT JOIN ventas v ON v.cliente_id = c.id AND v.tipo_pago = 'credito'
LEFT JOIN (SELECT venta_id, SUM(monto) AS abonado FROM pagos_credito GROUP BY venta_id) pc ON pc.venta_id = v.id
GROUP BY c.id;

-- vw_clientes_estatus: por cliente, su cartera, notas activas, saldo vencido y
-- estatus consolidado (vencida > por-vencer > al-corriente), calculado en SQL.
-- por-vencer = vence dentro de 7 días (atraso entre -7 y 0).
CREATE OR REPLACE VIEW public.vw_clientes_estatus AS
SELECT
  c.id, c.nombre, c.rancho, c.telefono, c.lada, c.limite_credito, c.saldo_deudor,
  c.activo_para_credito, c.dias_credito, c.creado_en,
  COALESCE(agg.notas_activas, 0)  AS notas_activas,
  COALESCE(agg.saldo_vencido, 0)  AS saldo_vencido,
  COALESCE(agg.cartera, 0)        AS cartera,
  CASE
    WHEN agg.tiene_vencida    THEN 'vencida'
    WHEN agg.tiene_por_vencer THEN 'por-vencer'
    ELSE 'al-corriente'
  END AS estatus
FROM clientes c
LEFT JOIN (
  SELECT cr.cliente_id,
    COUNT(*)                       FILTER (WHERE cr.saldo > 0)                          AS notas_activas,
    COALESCE(SUM(cr.saldo)         FILTER (WHERE cr.saldo > 0), 0)                      AS cartera,
    COALESCE(SUM(cr.saldo)         FILTER (WHERE cr.saldo > 0 AND cr.atraso > 0), 0)    AS saldo_vencido,
    bool_or(cr.saldo > 0 AND cr.atraso > 0)                                             AS tiene_vencida,
    bool_or(cr.saldo > 0 AND cr.atraso <= 0 AND cr.atraso >= -7)                        AS tiene_por_vencer
  FROM vw_creditos_resumen cr
  WHERE cr.estado <> 'cancelada'
  GROUP BY cr.cliente_id
) agg ON agg.cliente_id = c.id;

-- vw_productos: producto + nivel de stock (normal/bajo/agotado) calculado.
CREATE OR REPLACE VIEW public.vw_productos AS
SELECT p.*,
  CASE WHEN p.stock = 0 THEN 'agotado'
       WHEN p.stock < p.stock_minimo THEN 'bajo'
       ELSE 'normal' END AS nivel
FROM productos p;

-- ============================================================
-- REPORTES (KPIs + series agregadas en SQL)
-- ============================================================

-- fn_reporte_ventas: KPIs y series de ventas agregadas en SQL.
CREATE OR REPLACE FUNCTION public.fn_reporte_ventas(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_prev_start timestamptz := p_start - (p_end - p_start);
  v_prev_end   timestamptz := p_start - interval '1 millisecond';
  v_por_dia    boolean     := (p_end - p_start) > interval '1 day';
  v_result     jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa para ver reportes.';
  END IF;

  WITH ventas_periodo AS (
    SELECT v.id, v.total, v.tipo_pago, v.cliente_id, v.vendedor_id, v.fecha
    FROM ventas v
    WHERE v.fecha >= p_start AND v.fecha <= p_end AND v.estado <> 'cancelada'
  ),
  det AS (
    SELECT d.venta_id, d.cantidad, d.subtotal, p.nombre AS prod_nombre, p.categoria, p.id AS prod_id
    FROM ventas_detalles d
    JOIN ventas_periodo vp ON vp.id = d.venta_id
    LEFT JOIN productos p ON p.id = d.producto_id
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(total),0)                                           AS total,
      COUNT(*)                                                         AS count,
      COALESCE(SUM(total) FILTER (WHERE tipo_pago='credito'),0)        AS credito,
      COUNT(DISTINCT cliente_id) FILTER (WHERE cliente_id IS NOT NULL) AS clientes
    FROM ventas_periodo
  ),
  kpi_prod AS (SELECT COALESCE(SUM(cantidad),0) AS productos FROM det),
  prev AS (
    SELECT
      COALESCE(SUM(total),0) AS total, COUNT(*) AS count,
      COALESCE(SUM(total) FILTER (WHERE tipo_pago='credito'),0) AS credito,
      COUNT(DISTINCT cliente_id) FILTER (WHERE cliente_id IS NOT NULL) AS clientes
    FROM ventas v WHERE v.fecha >= v_prev_start AND v.fecha <= v_prev_end AND v.estado <> 'cancelada'
  ),
  prev_prod AS (
    SELECT COALESCE(SUM(d.cantidad),0) AS productos
    FROM ventas_detalles d JOIN ventas v ON v.id = d.venta_id
    WHERE v.fecha >= v_prev_start AND v.fecha <= v_prev_end AND v.estado <> 'cancelada'
  ),
  serie_base AS (
    SELECT
      CASE WHEN v_por_dia THEN to_char(date_trunc('day', fecha),'DD/MM')
           ELSE to_char(date_trunc('hour', fecha),'HH24:00') END        AS label,
      MIN(fecha)                                                        AS orden,
      COALESCE(SUM(total),0)                                            AS total,
      COUNT(*)                                                          AS count,
      COALESCE(SUM(total) FILTER (WHERE tipo_pago='credito'),0)         AS credito,
      COUNT(DISTINCT cliente_id)                                        AS clientes
    FROM ventas_periodo GROUP BY 1
  ),
  serie_prod AS (
    SELECT
      CASE WHEN v_por_dia THEN to_char(date_trunc('day', vp.fecha),'DD/MM')
           ELSE to_char(date_trunc('hour', vp.fecha),'HH24:00') END     AS label,
      COALESCE(SUM(d.cantidad),0)                                       AS productos
    FROM det d JOIN ventas_periodo vp ON vp.id = d.venta_id GROUP BY 1
  ),
  serie AS (
    SELECT sb.label, sb.orden, sb.total, sb.count, sb.credito, sb.clientes,
           COALESCE(sp.productos,0) AS productos
    FROM serie_base sb LEFT JOIN serie_prod sp ON sp.label = sb.label
  ),
  metodos AS (SELECT tipo_pago AS id, COALESCE(SUM(total),0) AS total FROM ventas_periodo GROUP BY tipo_pago),
  top_prod AS (
    SELECT prod_nombre AS nombre, COALESCE(SUM(subtotal),0) AS total
    FROM det WHERE prod_id IS NOT NULL GROUP BY prod_nombre ORDER BY 2 DESC LIMIT 6
  ),
  por_cat AS (
    SELECT COALESCE(categoria,'Sin categoría') AS cat, COALESCE(SUM(subtotal),0) AS total
    FROM det GROUP BY 1 ORDER BY 2 DESC
  ),
  por_vend AS (
    SELECT vp.vendedor_id, COALESCE(pf.nombre,'Sin asignar') AS nombre,
           COUNT(*) AS count, COALESCE(SUM(vp.total),0) AS total
    FROM ventas_periodo vp LEFT JOIN perfiles pf ON pf.id = vp.vendedor_id
    GROUP BY vp.vendedor_id, pf.nombre ORDER BY 4 DESC
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object('total',k.total,'count',k.count,
        'ticket', CASE WHEN k.count>0 THEN k.total/k.count ELSE 0 END,
        'productos',kp.productos,'credito',k.credito,'clientes',k.clientes) FROM kpis k, kpi_prod kp),
    'kpis_prev', (SELECT jsonb_build_object('total',pr.total,'count',pr.count,
        'ticket', CASE WHEN pr.count>0 THEN pr.total/pr.count ELSE 0 END,
        'productos',pp.productos,'credito',pr.credito,'clientes',pr.clientes) FROM prev pr, prev_prod pp),
    'serie', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'total',total,'count',count,
        'productos',productos,'credito',credito,'clientes',clientes) ORDER BY orden),'[]'::jsonb) FROM serie),
    'metodos_pago', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'total',total)),'[]'::jsonb) FROM metodos),
    'top_productos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre',nombre,'total',total)),'[]'::jsonb) FROM top_prod),
    'por_categoria', (SELECT COALESCE(jsonb_agg(jsonb_build_object('cat',cat,'total',total)),'[]'::jsonb) FROM por_cat),
    'por_vendedor', (SELECT COALESCE(jsonb_agg(jsonb_build_object('vendedor_id',vendedor_id,'nombre',nombre,'count',count,'total',total)),'[]'::jsonb) FROM por_vend)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- fn_reporte_cobranza: cartera viva (credito pendiente) agregada en SQL.
CREATE OR REPLACE FUNCTION public.fn_reporte_cobranza(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_dur        interval := p_end - p_start;
  v_prev_start timestamptz := p_start - (p_end - p_start) - interval '1 millisecond';
  v_prev_end   timestamptz := p_start - interval '1 millisecond';
  v_days       int := GREATEST((p_end::date - p_start::date) + 1, 1);
  v_points     int := LEAST(GREATEST((p_end::date - p_start::date) + 1, 1), 24);
  v_step       numeric;
  v_result     jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa para ver reportes.';
  END IF;
  v_step := v_days::numeric / v_points;

  WITH ventas_periodo AS (
    SELECT v.id, v.cliente_id, v.fecha, v.total,
           COALESCE(v.plazo_dias, c.dias_credito, 30) AS plazo,
           c.nombre AS cliente_nombre,
           COALESCE(pc.abonado,0) AS abonado,
           GREATEST(0, v.total - COALESCE(pc.abonado,0)) AS saldo,
           (CURRENT_DATE - (v.fecha::date + (COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval)::date) AS atraso
    FROM ventas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN (SELECT venta_id, SUM(monto) AS abonado FROM pagos_credito GROUP BY venta_id) pc ON pc.venta_id = v.id
    WHERE v.tipo_pago = 'credito' AND v.estado = 'pendiente'
      AND v.fecha >= p_start AND v.fecha <= p_end
  ),
  vp AS (  -- solo saldo vivo, con bandera de vencido
    SELECT *, (atraso > 0 AND saldo > 0) AS is_overdue FROM ventas_periodo WHERE saldo > 0
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(saldo),0)                                                   AS cartera_total,
      COALESCE(SUM(saldo) FILTER (WHERE is_overdue),0)                         AS vencido,
      COALESCE(SUM(saldo) FILTER (WHERE NOT is_overdue AND atraso >= -30),0)   AS por_vencer30,
      COUNT(*)             FILTER (WHERE NOT is_overdue AND atraso >= -30)      AS facturas_por_vencer,
      COALESCE(SUM(abonado),0)                                                 AS total_abonado,
      COUNT(DISTINCT cliente_id) FILTER (WHERE is_overdue)                     AS morosos,
      COUNT(DISTINCT cliente_id)                                               AS cuentas_activas
    FROM vp
  ),
  prev AS (
    SELECT
      COALESCE(SUM(s.saldo),0) AS cartera_total,
      COALESCE(SUM(s.saldo) FILTER (WHERE s.atraso > 0),0) AS vencido,
      COUNT(DISTINCT s.cliente_id) FILTER (WHERE s.atraso > 0) AS morosos
    FROM (
      SELECT v.cliente_id,
             GREATEST(0, v.total - COALESCE((SELECT SUM(monto) FROM pagos_credito pc WHERE pc.venta_id=v.id),0)) AS saldo,
             (CURRENT_DATE - (v.fecha::date + (COALESCE(v.plazo_dias, c.dias_credito,30)||' days')::interval)::date) AS atraso
      FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id
      WHERE v.tipo_pago='credito' AND v.estado='pendiente'
        AND v.fecha >= v_prev_start AND v.fecha <= v_prev_end
    ) s WHERE s.saldo > 0
  ),
  spark_raw AS (
    SELECT LEAST(6, GREATEST(0, FLOOR(
             (EXTRACT(epoch FROM (fecha - p_start)) / NULLIF(EXTRACT(epoch FROM (p_end - p_start)),0)) * 7)::int)) AS idx,
           saldo, abonado, is_overdue, cliente_id
    FROM vp
  ),
  spark_agg AS (
    SELECT b.idx,
      COALESCE(SUM(sr.saldo),0)                            AS cartera,
      COALESCE(SUM(sr.abonado),0)                          AS abonado,
      COALESCE(SUM(sr.saldo) FILTER (WHERE sr.is_overdue),0) AS vencido,
      COUNT(DISTINCT sr.cliente_id) FILTER (WHERE sr.is_overdue) AS morosos
    FROM generate_series(0,6) b(idx)
    LEFT JOIN spark_raw sr ON sr.idx = b.idx
    GROUP BY b.idx
  ),
  puntos AS (
    SELECT gs AS p, (p_start::date + (round((gs+1)*v_step) - 1)::int)::date AS corte
    FROM generate_series(0, v_points-1) gs
  ),
  evol AS (
    SELECT pt.corte,
      COALESCE(SUM(GREATEST(0, vp2.total -
        COALESCE((SELECT SUM(pc.monto) FROM pagos_credito pc WHERE pc.venta_id=vp2.id AND pc.fecha::date <= pt.corte),0)
      )),0) AS value
    FROM puntos pt
    LEFT JOIN vp vp2 ON vp2.fecha::date <= pt.corte
    GROUP BY pt.corte
  ),
  aging AS (
    SELECT
      COALESCE(SUM(saldo) FILTER (WHERE NOT is_overdue),0)                  AS corriente,
      COALESCE(SUM(saldo) FILTER (WHERE is_overdue AND atraso <= 30),0)     AS r1_30,
      COALESCE(SUM(saldo) FILTER (WHERE is_overdue AND atraso > 30 AND atraso <= 60),0) AS r31_60,
      COALESCE(SUM(saldo) FILTER (WHERE is_overdue AND atraso > 60),0)      AS r60p
    FROM vp
  ),
  deudores AS (
    SELECT cliente_id AS id,
           COALESCE(MAX(cliente_nombre),'Cliente sin nombre') AS nombre,
           SUM(saldo) AS saldo,
           COALESCE(SUM(saldo) FILTER (WHERE is_overdue),0) AS vencido,
           COALESCE(MAX(atraso) FILTER (WHERE is_overdue),0) AS max_atraso,
           bool_or(is_overdue) AS has_overdue
    FROM vp GROUP BY cliente_id
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
        'carteraTotal',k.cartera_total,'vencido',k.vencido,'porVencer30',k.por_vencer30,
        'facturasPorVencer',k.facturas_por_vencer,'totalAbonado',k.total_abonado,
        'recuperacion', CASE WHEN (k.total_abonado + k.cartera_total) > 0
                             THEN (k.total_abonado / (k.total_abonado + k.cartera_total)) * 100 ELSE 0 END,
        'morosos',k.morosos,'cuentasActivas',k.cuentas_activas) FROM kpis k),
    'kpis_prev', (SELECT jsonb_build_object('carteraTotal',pr.cartera_total,'vencido',pr.vencido,'morosos',pr.morosos) FROM prev pr),
    'spark', (SELECT jsonb_build_object(
        'cartera', jsonb_agg(cartera ORDER BY idx),
        'vencido', jsonb_agg(vencido ORDER BY idx),
        'recup',   jsonb_agg((abonado + cartera) ORDER BY idx),
        'morosos', jsonb_agg(morosos ORDER BY idx)) FROM spark_agg),
    'evolucion', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', to_char(corte,'DD/MM'), 'value', value) ORDER BY corte),'[]'::jsonb) FROM evol),
    'aging', (SELECT jsonb_build_object('corriente',corriente,'r1_30',r1_30,'r31_60',r31_60,'r60p',r60p) FROM aging),
    'top_deudores', (SELECT COALESCE(jsonb_agg(d ORDER BY d.saldo DESC),'[]'::jsonb) FROM (
        SELECT id, nombre, saldo, vencido, max_atraso AS "maxAtraso", has_overdue AS "hasOverdue"
        FROM deudores ORDER BY saldo DESC LIMIT 6) d),
    'tabla_clientes', (SELECT COALESCE(jsonb_agg(t ORDER BY t.saldo DESC),'[]'::jsonb) FROM (
        SELECT id, nombre, saldo, vencido, max_atraso AS "maxAtraso", has_overdue AS "hasOverdue",
               CASE WHEN max_atraso > 30 THEN 'red' WHEN max_atraso > 0 THEN 'amber' ELSE 'green' END AS badge
        FROM deudores ORDER BY saldo DESC) t)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- fn_reporte_inventario: valuacion, caducidad, rotacion y criticos en SQL.
-- costoValuacion: costo de lote si >0, sino costo de producto si >0, sino precio_publico.
CREATE OR REPLACE FUNCTION public.fn_reporte_inventario(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_horizon date := CURRENT_DATE + 90;
  v_mes0    date := date_trunc('month', now())::date;
  v_limite  date := date_trunc('month', now())::date + interval '6 months';
  v_result  jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa para ver reportes.';
  END IF;

  WITH lotes_stock AS (
    SELECT l.id, l.producto_id, l.stock_lote, l.fecha_caducidad, l.costo AS lcosto,
           COALESCE(NULLIF(p.categoria,''),'Sin categoría') AS categoria,
           p.costo AS pcosto, p.precio_publico,
           CASE WHEN COALESCE(l.costo,0) > 0 THEN l.costo
                WHEN COALESCE(p.costo,0) > 0 THEN p.costo
                ELSE COALESCE(p.precio_publico,0) END AS costo_val
    FROM lotes l JOIN productos p ON p.id = l.producto_id
    WHERE l.stock_lote > 0
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(stock_lote * costo_val),0)                                                  AS valuation,
      COUNT(*) FILTER (WHERE COALESCE(lcosto,0) <= 0 AND COALESCE(pcosto,0) <= 0)               AS estimados,
      COUNT(*) FILTER (WHERE fecha_caducidad IS NOT NULL AND fecha_caducidad <= v_horizon)      AS expiring_count,
      COALESCE(SUM(stock_lote * costo_val) FILTER (WHERE fecha_caducidad IS NOT NULL AND fecha_caducidad <= v_horizon),0) AS expiring_value
    FROM lotes_stock
  ),
  por_cat AS (
    SELECT categoria AS cat, COALESCE(SUM(stock_lote * costo_val),0) AS total
    FROM lotes_stock GROUP BY categoria ORDER BY 2 DESC
  ),
  meses AS (
    SELECT i AS bin,
           EXTRACT(month FROM (v_mes0 + (i||' months')::interval))::int - 1 AS mes,
           EXTRACT(year  FROM (v_mes0 + (i||' months')::interval))::int     AS anio
    FROM generate_series(0,5) i
  ),
  lotes_cad AS (
    SELECT ls.*,
      CASE WHEN ls.fecha_caducidad < CURRENT_DATE THEN 0
           ELSE ((EXTRACT(year FROM ls.fecha_caducidad) - EXTRACT(year FROM v_mes0)) * 12
                + (EXTRACT(month FROM ls.fecha_caducidad) - EXTRACT(month FROM v_mes0)))::int END AS bin
    FROM lotes_stock ls
    WHERE ls.fecha_caducidad IS NOT NULL AND ls.fecha_caducidad < v_limite
  ),
  expiry_agg AS (
    SELECT mm.bin, mm.mes, mm.anio,
           COALESCE(SUM(lc.stock_lote * lc.costo_val),0) AS value,
           COUNT(lc.id) AS count
    FROM meses mm
    LEFT JOIN lotes_cad lc ON lc.bin = mm.bin
    GROUP BY mm.bin, mm.mes, mm.anio
  ),
  stock_cat AS (
    SELECT COALESCE(NULLIF(categoria,''),'Sin categoría') AS cat, SUM(stock) AS stock
    FROM productos GROUP BY 1
  ),
  vendido_cat AS (
    SELECT COALESCE(NULLIF(p.categoria,''),'Sin categoría') AS cat, SUM(d.cantidad) AS vendido
    FROM ventas_detalles d JOIN ventas v ON v.id = d.venta_id
    LEFT JOIN productos p ON p.id = d.producto_id
    WHERE v.fecha >= p_start AND v.fecha <= p_end AND v.estado <> 'cancelada'
    GROUP BY 1
  ),
  rotacion AS (
    SELECT COALESCE(s.cat, vd.cat) AS cat,
           COALESCE(vd.vendido,0)  AS vendido,
           CASE WHEN COALESCE(s.stock,0) > 0 THEN COALESCE(vd.vendido,0)::numeric / s.stock ELSE 0 END AS ratio
    FROM stock_cat s FULL OUTER JOIN vendido_cat vd ON vd.cat = s.cat
    WHERE COALESCE(vd.vendido,0) > 0
    ORDER BY 3 DESC
  ),
  prox_cad AS (
    SELECT producto_id, MIN(fecha_caducidad) AS cad
    FROM lotes
    WHERE fecha_caducidad IS NOT NULL AND fecha_caducidad <= v_horizon AND producto_id IS NOT NULL
    GROUP BY producto_id
  ),
  criticos AS (
    SELECT p.id, p.nombre, COALESCE(NULLIF(p.categoria,''),'Sin categoría') AS categoria,
           p.stock, p.stock_minimo AS minimo, pc.cad,
           (p.stock <= p.stock_minimo) AS bajo,
           CASE WHEN pc.cad IS NOT NULL THEN (pc.cad - CURRENT_DATE) ELSE NULL END AS dias
    FROM productos p LEFT JOIN prox_cad pc ON pc.producto_id = p.id
    WHERE p.stock <= p.stock_minimo OR pc.cad IS NOT NULL
  ),
  criticos_rank AS (
    SELECT id, nombre, categoria, stock, minimo, cad,
      CASE WHEN (bajo AND cad IS NOT NULL) OR (dias IS NOT NULL AND dias <= 15) THEN 'critico'
           WHEN bajo THEN 'bajo' ELSE 'caducar' END AS estado,
      CASE WHEN (bajo AND cad IS NOT NULL) OR (dias IS NOT NULL AND dias <= 15) THEN 0
           WHEN bajo THEN 1 ELSE 2 END AS orden
    FROM criticos
    ORDER BY orden, stock::numeric / GREATEST(minimo,1)
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
        'valuation',k.valuation,'estimados',k.estimados,'expiringCount',k.expiring_count,
        'expiringValue',k.expiring_value,
        'lowStock',(SELECT count(*) FROM productos WHERE stock <= stock_minimo),
        'skus',(SELECT count(*) FROM productos)) FROM kpis k),
    'por_categoria', (SELECT COALESCE(jsonb_agg(jsonb_build_object('cat',cat,'total',total)),'[]'::jsonb) FROM por_cat),
    'expiry', (SELECT COALESCE(jsonb_agg(jsonb_build_object('mes',mes,'anio',anio,'count',count,'value',value) ORDER BY bin),'[]'::jsonb) FROM expiry_agg),
    'rotacion', (SELECT COALESCE(jsonb_agg(jsonb_build_object('cat',cat,'ratio',ratio,'vendido',vendido)),'[]'::jsonb) FROM rotacion),
    'criticos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',id,'nombre',nombre,'categoria',categoria,'stock',stock,'minimo',minimo,
        'caducidad', CASE WHEN cad IS NOT NULL THEN to_char(cad,'YYYY-MM-DD') ELSE NULL END,
        'estado',estado)),'[]'::jsonb) FROM criticos_rank)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- fn_caja_build_shift: helper que construye el jsonb de un turno (esperado/contado,
-- discrepancia, duracion), replicando finalizeShift() del front.
-- NOTA PGlite: los backslashes del regex POSIX se escriben \\s \\$ \\- para sobrevivir
-- al template literal; en runtime PGlite recibe \\s \\$ \\- -> el patrón \\s*\\$?([0-9,.\\-]+).
CREATE OR REPLACE FUNCTION public.fn_caja_build_shift(
  p_apertura_id uuid, p_apertura_fecha timestamptz, p_vendedor text, p_vendedor_id uuid,
  p_opening numeric, p_ing numeric, p_egr numeric, p_sales numeric, p_abonos numeric,
  p_efectivo_va numeric, p_cierre_fecha timestamptz, p_cierre_monto numeric,
  p_cierre_desc text, p_is_closed boolean
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_efectivo_sistema numeric := p_opening + p_efectivo_va + p_ing - p_egr;
  v_expected numeric := p_opening + p_efectivo_va + p_ing - p_egr;
  v_counted  numeric;
  v_exp_match text; v_cnt_match text;
  v_discrepancy numeric := 0;
  v_duration numeric := NULL;
BEGIN
  v_counted := CASE WHEN p_is_closed THEN COALESCE(p_cierre_monto,0) ELSE v_efectivo_sistema END;
  IF p_is_closed AND p_cierre_desc IS NOT NULL THEN
    v_exp_match := substring(p_cierre_desc from 'Efectivo esperado:\\s*\\$?([0-9,.\\-]+)');
    v_cnt_match := substring(p_cierre_desc from 'Efectivo contado:\\s*\\$?([0-9,.\\-]+)');
    IF v_exp_match IS NOT NULL THEN v_expected := replace(v_exp_match, ',', '')::numeric; END IF;
    IF v_cnt_match IS NOT NULL THEN v_counted  := replace(v_cnt_match, ',', '')::numeric; END IF;
  END IF;
  IF p_is_closed THEN
    v_discrepancy := v_counted - v_expected;
    IF p_cierre_fecha IS NOT NULL AND p_apertura_fecha IS NOT NULL THEN
      v_duration := EXTRACT(epoch FROM (p_cierre_fecha - p_apertura_fecha)) * 1000;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', p_apertura_id,
    'vendedorName', COALESCE(p_vendedor,'Sin asignar'),
    'vendedorId', p_vendedor_id,
    'aperturaFecha', p_apertura_fecha,
    'cierreFecha', p_cierre_fecha,
    'openingCash', p_opening,
    'countedCash', v_counted,
    'expectedCash', v_expected,
    'discrepancy', v_discrepancy,
    'manualIngresos', p_ing,
    'manualEgresos', p_egr,
    'salesTotal', p_sales,
    'abonosTotal', p_abonos,
    'efectivoSistema', v_efectivo_sistema,
    'durationMs', v_duration,
    'isClosed', p_is_closed
  );
END;
$function$;

-- fn_reporte_caja: reconstruye turnos (apertura -> corte) en SQL y devuelve
-- KPIs, turnos, ingresos por hora y los movimientos del turno mostrado.
CREATE OR REPLACE FUNCTION public.fn_reporte_caja(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  m record;
  v_open boolean := false;
  c_ap_id uuid; c_ap_fecha timestamptz; c_vend text; c_vend_id uuid;
  c_opening numeric; c_ing numeric; c_egr numeric; c_sales numeric; c_abonos numeric; c_efectivo_va numeric;
  v_shifts jsonb := '[]'::jsonb;
  v_shift jsonb;
  -- stats globales
  st_fondos numeric:=0; st_ventas numeric:=0; st_abonos numeric:=0; st_ing numeric:=0;
  st_egr numeric:=0; st_encaja numeric:=0; st_netdisc numeric:=0; st_vcount int:=0;
  -- turno-tabla
  v_active_ap timestamptz := NULL; v_active_vend text := NULL;
  v_lastclosed_ap timestamptz := NULL; v_lastclosed_ci timestamptz := NULL; v_lastclosed_vend text := NULL;
  v_tbl_ini timestamptz; v_tbl_fin timestamptz; v_tbl_vend text; v_tbl_active boolean;
  v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa para ver reportes.';
  END IF;

  FOR m IN
    SELECT mc.*, pf.nombre AS vendedor_nombre
    FROM movimientos_caja mc LEFT JOIN perfiles pf ON pf.id = mc.vendedor_id
    WHERE mc.fecha >= p_start AND mc.fecha <= p_end
    ORDER BY mc.fecha ASC, mc.id ASC
  LOOP
    IF m.tipo = 'apertura' THEN
      IF v_open THEN
        v_shift := public.fn_caja_build_shift(c_ap_id,c_ap_fecha,c_vend,c_vend_id,c_opening,c_ing,c_egr,c_sales,c_abonos,c_efectivo_va,NULL,NULL,NULL,false);
        v_shifts := v_shifts || v_shift;
        st_fondos:=st_fondos+c_opening; st_ventas:=st_ventas+c_sales; st_abonos:=st_abonos+c_abonos;
        st_ing:=st_ing+c_ing; st_egr:=st_egr+c_egr; st_encaja:=st_encaja+(v_shift->>'efectivoSistema')::numeric;
      END IF;
      v_open:=true; c_ap_id:=m.id; c_ap_fecha:=m.fecha; c_vend:=COALESCE(m.vendedor_nombre,'Sin asignar'); c_vend_id:=m.vendedor_id;
      c_opening:=COALESCE(m.monto,0); c_ing:=0; c_egr:=0; c_sales:=0; c_abonos:=0; c_efectivo_va:=0;
    ELSIF m.tipo = 'egreso' AND m.es_corte = true THEN
      IF v_open THEN
        v_shift := public.fn_caja_build_shift(c_ap_id,c_ap_fecha,c_vend,c_vend_id,c_opening,c_ing,c_egr,c_sales,c_abonos,c_efectivo_va,m.fecha,COALESCE(m.monto,0),m.descripcion,true);
        v_shifts := v_shifts || v_shift;
        st_fondos:=st_fondos+c_opening; st_ventas:=st_ventas+c_sales; st_abonos:=st_abonos+c_abonos;
        st_ing:=st_ing+c_ing; st_egr:=st_egr+c_egr; st_encaja:=st_encaja+(v_shift->>'efectivoSistema')::numeric;
        st_netdisc:=st_netdisc+(v_shift->>'discrepancy')::numeric;
        v_lastclosed_ap:=c_ap_fecha; v_lastclosed_ci:=m.fecha; v_lastclosed_vend:=c_vend;
        v_open:=false;
      END IF;
    ELSIF v_open THEN
      IF m.tipo='ingreso' THEN c_ing:=c_ing+COALESCE(m.monto,0);
      ELSIF m.tipo='egreso' THEN c_egr:=c_egr+COALESCE(m.monto,0);
      ELSIF m.tipo='venta' THEN
        c_sales:=c_sales+COALESCE(m.monto,0); st_vcount:=st_vcount+1;
        IF m.categoria='caja' THEN c_efectivo_va:=c_efectivo_va+COALESCE(m.monto,0); END IF;
      ELSIF m.tipo='abono' THEN
        c_abonos:=c_abonos+COALESCE(m.monto,0); st_vcount:=st_vcount+1;
        IF m.categoria='caja' THEN c_efectivo_va:=c_efectivo_va+COALESCE(m.monto,0); END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_open THEN
    v_shift := public.fn_caja_build_shift(c_ap_id,c_ap_fecha,c_vend,c_vend_id,c_opening,c_ing,c_egr,c_sales,c_abonos,c_efectivo_va,NULL,NULL,NULL,false);
    v_shifts := v_shifts || v_shift;
    st_fondos:=st_fondos+c_opening; st_ventas:=st_ventas+c_sales; st_abonos:=st_abonos+c_abonos;
    st_ing:=st_ing+c_ing; st_egr:=st_egr+c_egr; st_encaja:=st_encaja+(v_shift->>'efectivoSistema')::numeric;
    v_active_ap:=c_ap_fecha; v_active_vend:=c_vend;
  END IF;

  -- Turno a mostrar en la tabla de movimientos: activo si existe, si no el ultimo cerrado.
  IF v_active_ap IS NOT NULL THEN
    v_tbl_ini:=v_active_ap; v_tbl_fin:=p_end; v_tbl_vend:=v_active_vend; v_tbl_active:=true;
  ELSIF v_lastclosed_ap IS NOT NULL THEN
    v_tbl_ini:=v_lastclosed_ap; v_tbl_fin:=v_lastclosed_ci; v_tbl_vend:=v_lastclosed_vend; v_tbl_active:=false;
  END IF;

  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'fondos',st_fondos,'ventas',st_ventas,'abonos',st_abonos,'ingresosManual',st_ing,
      'egresos',st_egr,'enCaja',st_encaja,'ingresosTotales',st_ventas+st_abonos+st_ing,
      'netDiscrepancy',st_netdisc,'ventaCount',st_vcount),
    'shifts', v_shifts,
    'hourly', (SELECT COALESCE(jsonb_agg(jsonb_build_object('hour',hour,'total',total) ORDER BY hour),'[]'::jsonb)
               FROM (SELECT EXTRACT(hour FROM fecha)::int AS hour, SUM(monto) AS total
                     FROM movimientos_caja
                     WHERE fecha >= p_start AND fecha <= p_end AND tipo IN ('venta','abono')
                     GROUP BY 1) h),
    'table_shift', CASE WHEN v_tbl_ini IS NOT NULL
                        THEN jsonb_build_object('vendedorName',v_tbl_vend,'isActive',v_tbl_active) ELSE NULL END,
    'table_movimientos', CASE WHEN v_tbl_ini IS NOT NULL THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',id,'tipo',tipo,'fecha',fecha,'monto',monto,'descripcion',descripcion,
          'es_corte',COALESCE(es_corte,false),'categoria',categoria) ORDER BY fecha ASC, id ASC),'[]'::jsonb)
        FROM movimientos_caja WHERE fecha >= v_tbl_ini AND fecha <= v_tbl_fin
      ) ELSE '[]'::jsonb END
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ============================================================
-- CATÁLOGO / LISTADOS auxiliares
-- ============================================================

-- fn_categorias_productos: categorias distintas del catalogo activo (para filtros).
CREATE OR REPLACE FUNCTION public.fn_categorias_productos()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT COALESCE(
           array_agg(DISTINCT categoria ORDER BY categoria)
             FILTER (WHERE categoria IS NOT NULL AND categoria <> ''),
           '{}')
  FROM productos
  WHERE activo = true;
$function$;

-- fn_catalogo_kpis: KPIs del inventario (total, valor, bajo, agotado) en SQL.
CREATE OR REPLACE FUNCTION public.fn_catalogo_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SELECT jsonb_build_object(
    'total',      COUNT(*),
    'valorTotal', COALESCE(SUM(stock * precio_publico), 0),
    'low',        COUNT(*) FILTER (WHERE stock < stock_minimo),
    'out',        COUNT(*) FILTER (WHERE stock = 0)
  ) INTO v_result
  FROM productos;
  RETURN v_result;
END;
$function$;

-- ============================================================
-- CRÉDITOS (Notas a crédito paginadas en servidor + KPIs)
-- ============================================================

-- fn_creditos_listado: pagina ventas a crédito; deriva saldo/atraso de columnas. { rows, total }.
-- p_filtro: todos | pendientes | al_corriente | vencidas | pagadas. (versión final: expone numero_cliente)
CREATE OR REPLACE FUNCTION public.fn_creditos_listado(p_busqueda text DEFAULT ''::text, p_filtro text DEFAULT 'todos'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_busqueda text := NULLIF(btrim(COALESCE(p_busqueda, '')), '');
  v_atraso text := '(CURRENT_DATE - (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || '' days'')::interval))::date)';
  v_cond text := 'v.tipo_pago = ''credito''';
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SET LOCAL statement_timeout = '30s';
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  p_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_filtro = 'pendientes' THEN
    v_cond := v_cond || ' AND v.estado <> ''cancelada'' AND v.total > v.abonado';
  ELSIF p_filtro = 'al_corriente' THEN
    v_cond := v_cond || ' AND v.estado <> ''cancelada'' AND v.total > v.abonado AND ' || v_atraso || ' <= 0';
  ELSIF p_filtro = 'vencidas' THEN
    v_cond := v_cond || ' AND v.estado <> ''cancelada'' AND v.total > v.abonado AND ' || v_atraso || ' > 0';
  ELSIF p_filtro = 'pagadas' THEN
    v_cond := v_cond || ' AND (v.total <= v.abonado OR v.estado = ''cancelada'')';
  END IF;

  IF v_busqueda IS NOT NULL THEN
    v_cond := v_cond
      || ' AND (c.nombre ILIKE ' || quote_literal('%' || v_busqueda || '%')
      || ' OR c.rancho ILIKE '  || quote_literal('%' || v_busqueda || '%')
      || ' OR v.folio ILIKE '   || quote_literal('%' || v_busqueda || '%') || ')';
  END IF;

  EXECUTE format($f$
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.fecha DESC, f.id DESC), '[]'::jsonb)
    FROM (
      SELECT v.id, v.folio, v.fecha, v.total, v.plazo_dias, v.estado, v.cliente_id,
             c.numero_cliente,
             c.nombre AS cliente_nombre, c.rancho AS cliente_rancho, c.telefono AS cliente_telefono, c.dias_credito,
             v.abonado,
             GREATEST(v.total - v.abonado, 0) AS saldo,
             (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval))::date AS fecha_venc,
             %s AS atraso
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE %s
      ORDER BY v.fecha DESC, v.id DESC
      OFFSET %s LIMIT %s
    ) f
  $f$, v_atraso, v_cond, p_offset, p_limit) INTO v_rows;

  EXECUTE format('SELECT COUNT(*) FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE %s', v_cond) INTO v_total;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$function$;

-- fn_creditos_kpis: agrega SOLO las notas activas (saldo>0) -> instantáneo.
CREATE OR REPLACE FUNCTION public.fn_creditos_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SET LOCAL statement_timeout = '30s';
  SELECT jsonb_build_object(
    'totalEnCartera', COALESCE(SUM(GREATEST(v.total - v.abonado, 0)), 0),
    'totalVencido',   COALESCE(SUM(GREATEST(v.total - v.abonado, 0)) FILTER (
                        WHERE (CURRENT_DATE - (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval))::date) > 0), 0),
    'totalClientesDeudores', COUNT(DISTINCT v.cliente_id)
  ) INTO v_result
  FROM ventas v
  LEFT JOIN clientes c ON c.id = v.cliente_id
  WHERE v.tipo_pago = 'credito' AND v.estado <> 'cancelada' AND v.total > v.abonado;
  RETURN v_result;
END;
$function$;

-- ============================================================
-- CLIENTES (listado paginado en servidor + KPIs)
-- ============================================================

-- Helper _cliente_credito: resumen de crédito de UN cliente desde tablas base
-- (saldo/atraso por nota con abonos correlacionados por venta). Se incluye AQUÍ porque
-- schema_01 portó _estatus_credito pero NO este helper, y fn_clientes_listado /
-- fn_clientes_kpis lo invocan vía CROSS JOIN LATERAL. Portado de
-- 20260624000000_fn_clientes_listado.sql (CREATE OR REPLACE: idempotente si schema_01 lo agregara luego).
CREATE OR REPLACE FUNCTION public._cliente_credito(p_cliente_id uuid, p_dias_credito int)
RETURNS TABLE (
  notas_activas bigint,
  saldo_vencido numeric,
  cartera       numeric,
  estatus       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    COUNT(*)                       FILTER (WHERE saldo > 0)                       AS notas_activas,
    COALESCE(SUM(saldo)            FILTER (WHERE saldo > 0 AND atraso > 0), 0)    AS saldo_vencido,
    COALESCE(SUM(saldo)            FILTER (WHERE saldo > 0), 0)                   AS cartera,
    CASE
      WHEN bool_or(saldo > 0 AND atraso > 0)                     THEN 'vencida'
      WHEN bool_or(saldo > 0 AND atraso <= 0 AND atraso >= -7)   THEN 'por-vencer'
      ELSE 'al-corriente'
    END AS estatus
  FROM (
    SELECT
      GREATEST(
        v.total - COALESCE((SELECT SUM(pc.monto) FROM pagos_credito pc WHERE pc.venta_id = v.id), 0),
        0
      ) AS saldo,
      CURRENT_DATE - (v.fecha::date + ((COALESCE(v.plazo_dias, p_dias_credito, 30) || ' days')::interval))::date AS atraso
    FROM ventas v
    WHERE v.cliente_id = p_cliente_id
      AND v.tipo_pago = 'credito'
      AND v.estado <> 'cancelada'
  ) notas;
$function$;

-- fn_clientes_listado: excluye archivados salvo el filtro 'archivados'. { rows, total }.
-- (versión final: expone numero_cliente; usa _estatus_credito de schema_01 y _cliente_credito de arriba)
CREATE OR REPLACE FUNCTION public.fn_clientes_listado(p_busqueda text DEFAULT ''::text, p_filtro text DEFAULT 'todos'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_busqueda text := NULLIF(btrim(COALESCE(p_busqueda, '')), '');
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SET LOCAL statement_timeout = '30s';
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  p_offset := GREATEST(COALESCE(p_offset, 0), 0);
  IF v_busqueda IS NOT NULL THEN v_busqueda := '%' || v_busqueda || '%'; END IF;

  WITH base AS (
    SELECT c.* FROM clientes c
    WHERE (v_busqueda IS NULL OR c.nombre ILIKE v_busqueda OR c.rancho ILIKE v_busqueda OR c.telefono ILIKE v_busqueda)
      AND (CASE WHEN p_filtro = 'archivados' THEN c.archivado = true ELSE c.archivado = false END)
      AND (p_filtro IS NULL OR p_filtro IN ('todos','archivados')
           OR public._estatus_credito(c.credito_cartera, c.credito_proxima_venc) = p_filtro)
  ),
  pagina AS (SELECT * FROM base ORDER BY nombre ASC, id ASC OFFSET p_offset LIMIT p_limit),
  enriquecida AS (
    SELECT
      p.id, p.numero_cliente, p.nombre, p.rancho, p.telefono, p.lada, p.limite_credito,
      p.saldo_deudor, p.activo_para_credito, p.dias_credito, p.creado_en,
      p.exento_bloqueo, p.archivado,
      cr.notas_activas, cr.saldo_vencido, cr.cartera, cr.estatus
    FROM pagina p
    CROSS JOIN LATERAL public._cliente_credito(p.id, p.dias_credito) cr
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.nombre, e.id) FROM enriquecida e), '[]'::jsonb),
    (SELECT COUNT(*) FROM base)
  INTO v_rows, v_total;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$function$;

-- fn_clientes_kpis: solo clientes no archivados.
CREATE OR REPLACE FUNCTION public.fn_clientes_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  SET LOCAL statement_timeout = '30s';

  WITH cli AS (
    SELECT c.id, c.dias_credito,
           public._estatus_credito(c.credito_cartera, c.credito_proxima_venc) AS est
    FROM clientes c
    WHERE NOT c.archivado
  )
  SELECT jsonb_build_object(
    'total',        (SELECT COUNT(*) FROM cli),
    'corriente',    (SELECT COUNT(*) FROM cli WHERE est = 'al-corriente'),
    'porVencer',    (SELECT COUNT(*) FROM cli WHERE est = 'por-vencer'),
    'vencida',      (SELECT COUNT(*) FROM cli WHERE est = 'vencida'),
    'montoVencido', (SELECT COALESCE(SUM(cr.saldo_vencido), 0)
                     FROM cli CROSS JOIN LATERAL public._cliente_credito(cli.id, cli.dias_credito) cr
                     WHERE cli.est = 'vencida')
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- ============================================================
-- DASHBOARD (tablero) + HISTORIAL DE VENTAS (KPIs)
-- ============================================================

-- fn_dashboard: KPIs y listas cortas del tablero. "Ventas de hoy" es NETO
-- (ventas del día no canceladas menos reembolsos de devolución sobre esas ventas);
-- ventasHoyDevueltas = conteo de ventas devueltas hoy. Recibe inicio del día en hora MX.
CREATE OR REPLACE FUNCTION public.fn_dashboard(p_hoy_inicio timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;

  SET LOCAL statement_timeout = '30s';

  WITH pagos AS MATERIALIZED (
    SELECT venta_id, SUM(monto) AS abonado
    FROM pagos_credito
    GROUP BY venta_id
  ),
  creditos AS MATERIALIZED (
    SELECT
      v.estado,
      c.nombre AS cliente_nombre,
      GREATEST(v.total - COALESCE(p.abonado, 0), 0) AS saldo,
      CURRENT_DATE - (v.fecha::date + ((COALESCE(v.plazo_dias, c.dias_credito, 30) || ' days')::interval))::date AS atraso
    FROM ventas v
    LEFT JOIN clientes c     ON c.id = v.cliente_id
    LEFT JOIN pagos    p     ON p.venta_id = v.id
    WHERE v.tipo_pago = 'credito' AND v.estado <> 'cancelada'
  )
  SELECT jsonb_build_object(
    'ventasHoySum',   (
        (SELECT COALESCE(SUM(total),0) FROM ventas WHERE fecha >= p_hoy_inicio AND estado <> 'cancelada')
      - (SELECT COALESCE(SUM(d.monto_devuelto),0) FROM devoluciones d JOIN ventas v ON v.id = d.venta_id WHERE v.fecha >= p_hoy_inicio)
    ),
    'ventasHoyCount', (SELECT COUNT(*) FROM ventas WHERE fecha >= p_hoy_inicio AND estado <> 'cancelada'),
    'ventasHoyDevueltas', (SELECT COUNT(*) FROM ventas WHERE fecha >= p_hoy_inicio AND estado = 'devuelta'),
    'lowStockCount',  (SELECT COUNT(*) FROM productos WHERE COALESCE(activo,true) AND stock < stock_minimo),
    'lowStockList',   (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',nombre,'unit',unidad,'stock',stock,'min',stock_minimo)
                          ORDER BY (stock / NULLIF(stock_minimo,0))),'[]'::jsonb)
                        FROM (SELECT id,nombre,unidad,stock,stock_minimo FROM productos
                              WHERE COALESCE(activo,true) AND stock < stock_minimo
                              ORDER BY (stock / NULLIF(stock_minimo,0)) LIMIT 10) lp),
    'pendingCreditsCount', (SELECT COUNT(*) FROM creditos WHERE estado = 'pendiente' AND saldo > 0),
    'pendingCreditsSum',   (SELECT COALESCE(SUM(saldo),0) FROM creditos WHERE estado = 'pendiente' AND saldo > 0),
    'activeClientsCount',  (SELECT COUNT(*) FROM clientes),
    'recentSales', (SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (
        SELECT v.folio, v.tipo_pago, v.total, v.fecha, c.nombre AS cliente
        FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
        ORDER BY v.fecha DESC LIMIT 5) r),
    'overdueCount', (SELECT COUNT(*) FROM creditos WHERE saldo > 0 AND atraso > 0),
    'overdueList', (SELECT COALESCE(jsonb_agg(o),'[]'::jsonb) FROM (
        SELECT COALESCE(cliente_nombre,'Cliente Desconocido') AS n, saldo AS m, atraso AS dias
        FROM creditos WHERE saldo > 0 AND atraso > 0
        ORDER BY atraso DESC LIMIT 3) o)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- fn_dashboard_serie: serie de ventas agregada por dia (semana/mes) o por mes (año).
CREATE OR REPLACE FUNCTION public.fn_dashboard_serie(p_inicio timestamptz, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  IF p_modo = 'ano' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', to_char(m, 'YYYY-MM'), 'total', total) ORDER BY m),'[]'::jsonb)
    INTO v_result
    FROM (SELECT date_trunc('month', timezone('America/Mexico_City', fecha))::date AS m, SUM(total) AS total
          FROM ventas WHERE fecha >= p_inicio AND estado <> 'cancelada' GROUP BY 1) s;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', to_char(d, 'YYYY-MM-DD'), 'total', total) ORDER BY d),'[]'::jsonb)
    INTO v_result
    FROM (SELECT date_trunc('day', timezone('America/Mexico_City', fecha))::date AS d, SUM(total) AS total
          FROM ventas WHERE fecha >= p_inicio AND estado <> 'cancelada' GROUP BY 1) s;
  END IF;
  RETURN v_result;
END;
$function$;

-- fn_historial_ventas_kpis: KPIs del conjunto filtrado (excluye canceladas).
-- Usa vw_ventas_historial (definida en schema_03_dev_cartera.ts).
CREATE OR REPLACE FUNCTION public.fn_historial_ventas_kpis(
  p_start timestamptz, p_end timestamptz,
  p_vendedor uuid DEFAULT NULL, p_estado text DEFAULT NULL,
  p_tipo_pago text DEFAULT NULL, p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (public.es_operador() OR public.es_visitante()) THEN
    RAISE EXCEPTION 'No autorizado: se requiere una sesion activa.';
  END IF;
  WITH v AS (
    SELECT total, tipo_pago
    FROM vw_ventas_historial
    WHERE fecha >= p_start AND fecha <= p_end
      AND (p_vendedor  IS NULL OR vendedor_id = p_vendedor)
      AND (p_estado    IS NULL OR estado = p_estado)
      AND (p_tipo_pago IS NULL OR tipo_pago = p_tipo_pago)
      AND (p_search IS NULL OR p_search = ''
           OR folio ILIKE '%'||p_search||'%' OR cliente_nombre ILIKE '%'||p_search||'%')
      AND estado <> 'cancelada'
  )
  SELECT jsonb_build_object(
    'totalVendido',   COALESCE(SUM(total),0),
    'numVentas',      COUNT(*),
    'totalCredito',   COALESCE(SUM(total) FILTER (WHERE tipo_pago = 'credito'),0),
    'totalContado',   COALESCE(SUM(total) FILTER (WHERE tipo_pago <> 'credito'),0),
    'ticketPromedio', CASE WHEN COUNT(*) > 0 THEN SUM(total)/COUNT(*) ELSE 0 END
  ) INTO v_result FROM v;
  RETURN v_result;
END;
$function$;
`;
