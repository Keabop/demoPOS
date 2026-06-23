-- =====================================================================
-- Corrige fn_evaluar_clientes_morosos:
--   1. Usa el plazo de crédito real de cada venta (ventas.plazo_dias) en
--      lugar de un umbral fijo de 30 días.
--   2. REACTIVA el crédito de los clientes que ya no tienen ninguna nota
--      vencida pendiente (antes solo bloqueaba, nunca reactivaba, por lo
--      que un cliente que se ponía al corriente quedaba bloqueado para
--      siempre).
-- Se ejecuta a diario vía pg_cron (ver 20260616000000).
-- Nota: la única fuente de verdad de activo_para_credito es la mora; no
-- existe bloqueo manual por admin, así que la reactivación es segura.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_evaluar_clientes_morosos()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Bloquear: clientes activos con al menos una nota de crédito pendiente
  -- vencida según su propio plazo.
  UPDATE clientes c
  SET activo_para_credito = FALSE
  WHERE c.activo_para_credito = TRUE
    AND EXISTS (
      SELECT 1
      FROM ventas v
      LEFT JOIN (
        SELECT venta_id, SUM(monto) AS pagado
        FROM pagos_credito
        GROUP BY venta_id
      ) p ON p.venta_id = v.id
      WHERE v.cliente_id = c.id
        AND v.tipo_pago = 'credito'
        AND v.estado = 'pendiente'
        AND (v.total - COALESCE(p.pagado, 0)) > 0
        AND v.fecha < (NOW() - (COALESCE(v.plazo_dias, 30) || ' days')::interval)
    );

  -- Reactivar: clientes bloqueados que ya NO tienen ninguna nota vencida
  -- pendiente (se pusieron al corriente).
  UPDATE clientes c
  SET activo_para_credito = TRUE
  WHERE c.activo_para_credito = FALSE
    AND NOT EXISTS (
      SELECT 1
      FROM ventas v
      LEFT JOIN (
        SELECT venta_id, SUM(monto) AS pagado
        FROM pagos_credito
        GROUP BY venta_id
      ) p ON p.venta_id = v.id
      WHERE v.cliente_id = c.id
        AND v.tipo_pago = 'credito'
        AND v.estado = 'pendiente'
        AND (v.total - COALESCE(p.pagado, 0)) > 0
        AND v.fecha < (NOW() - (COALESCE(v.plazo_dias, 30) || ' days')::interval)
    );
END;
$function$;
