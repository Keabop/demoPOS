-- M4: anular una venta de forma transaccional (reversa de stock, saldo y caja).
CREATE OR REPLACE FUNCTION public.fn_cancelar_venta(p_venta_id uuid, p_motivo character varying DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estado VARCHAR; v_tipo_pago VARCHAR; v_total NUMERIC(10,2); v_cliente_id UUID;
  v_abonado NUMERIC(10,2); v_det RECORD; v_folio VARCHAR;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para anular ventas.';
  END IF;

  SELECT estado, tipo_pago, total, cliente_id, folio
  INTO v_estado, v_tipo_pago, v_total, v_cliente_id, v_folio
  FROM ventas WHERE id = p_venta_id FOR UPDATE;

  IF v_estado IS NULL THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_estado = 'cancelada' THEN RAISE EXCEPTION 'La venta ya está cancelada.'; END IF;

  -- No permitir anular si tiene abonos (la reversa parcial es ambigua): primero quitar abonos.
  SELECT COALESCE(SUM(monto), 0.00) INTO v_abonado FROM pagos_credito WHERE venta_id = p_venta_id;
  IF v_abonado > 0 THEN
    RAISE EXCEPTION 'La venta % tiene abonos registrados; elimine los abonos antes de anular.', v_folio;
  END IF;

  -- 1) Reponer inventario por lote (y stock consolidado).
  FOR v_det IN SELECT producto_id, lote_id, cantidad FROM ventas_detalles WHERE venta_id = p_venta_id LOOP
    IF v_det.lote_id IS NOT NULL THEN
      UPDATE lotes SET stock_lote = stock_lote + v_det.cantidad WHERE id = v_det.lote_id;
    END IF;
    IF v_det.producto_id IS NOT NULL THEN
      UPDATE productos SET stock = stock + v_det.cantidad WHERE id = v_det.producto_id;
    END IF;
  END LOOP;

  -- 2) Crédito: revertir el saldo deudor (sin abonos, es el total).
  IF v_tipo_pago = 'credito' AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes SET saldo_deudor = GREATEST(0.00, saldo_deudor - v_total) WHERE id = v_cliente_id;
  END IF;

  -- 3) Caja: quitar el movimiento de la venta (ya no es ingreso real).
  DELETE FROM movimientos_caja WHERE venta_id = p_venta_id;

  -- 4) Marcar la venta como cancelada.
  UPDATE ventas SET estado = 'cancelada' WHERE id = p_venta_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cancelar_venta(uuid, character varying) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_cancelar_venta(uuid, character varying) TO authenticated, service_role;
