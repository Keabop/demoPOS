-- M1: que la venta de contado (todos los métodos) y el abono a crédito
-- registren su movimiento en movimientos_caja con metodo/categoria.

-- ===== fn_registrar_venta_completa: caja para efectivo/tarjeta/debito/transferencia =====
CREATE OR REPLACE FUNCTION public.fn_registrar_venta_completa(p_folio character varying, p_cliente_id uuid, p_vendedor_id uuid, p_tipo_pago character varying, p_subtotal numeric, p_iva numeric, p_total numeric, p_detalles jsonb, p_plazo_dias integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id UUID;
  v_detalle RECORD;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar ventas.';
  END IF;

  IF p_tipo_pago = 'credito' THEN
    DECLARE
      v_activo BOOLEAN; v_limite DECIMAL; v_saldo DECIMAL; v_nombre VARCHAR;
    BEGIN
      SELECT nombre, activo_para_credito, limite_credito, saldo_deudor
      INTO v_nombre, v_activo, v_limite, v_saldo FROM clientes WHERE id = p_cliente_id;
      IF v_nombre IS NULL THEN RAISE EXCEPTION 'Cliente no seleccionado o inexistente.'; END IF;
      IF NOT v_activo THEN RAISE EXCEPTION 'El cliente % está bloqueado para créditos (moroso).', v_nombre; END IF;
      IF (v_saldo + p_total) > v_limite THEN
        RAISE EXCEPTION 'Límite de crédito excedido. Disponible: %, Total Venta: %', (v_limite - v_saldo), p_total;
      END IF;
    END;
  END IF;

  INSERT INTO ventas (folio, cliente_id, vendedor_id, tipo_pago, subtotal, iva, total, estado, plazo_dias)
  VALUES (p_folio, p_cliente_id, p_vendedor_id, p_tipo_pago, p_subtotal, p_iva, p_total,
          CASE WHEN p_tipo_pago = 'credito' THEN 'pendiente' ELSE 'cobrada' END, p_plazo_dias)
  RETURNING id INTO v_venta_id;

  FOR v_detalle IN
    SELECT * FROM jsonb_to_recordset(p_detalles) AS x(producto_id UUID, cantidad DECIMAL, precio_unitario DECIMAL, subtotal DECIMAL)
  LOOP
    INSERT INTO ventas_detalles (venta_id, producto_id, cantidad, precio_unitario, subtotal)
    VALUES (v_venta_id, v_detalle.producto_id, v_detalle.cantidad, v_detalle.precio_unitario, v_detalle.subtotal);
  END LOOP;

  IF p_tipo_pago = 'credito' THEN
    UPDATE clientes SET saldo_deudor = saldo_deudor + p_total WHERE id = p_cliente_id;
  END IF;

  -- Toda venta de CONTADO entra a caja (no solo efectivo/tarjeta). El crédito NO (no es dinero).
  IF p_tipo_pago IN ('efectivo', 'tarjeta', 'debito', 'transferencia') THEN
    INSERT INTO movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id)
    VALUES (p_vendedor_id, 'venta', p_total, 'Venta contado folio ' || p_folio,
            p_tipo_pago,
            CASE WHEN p_tipo_pago = 'efectivo' THEN 'caja' ELSE 'banco' END,
            v_venta_id);
  END IF;

  RETURN v_venta_id;
END;
$function$;

-- ===== fn_procesar_abono_credito: registrar el abono en movimientos_caja =====
-- En DELETE, el movimiento se elimina por CASCADE de pago_id (no hace falta borrarlo aquí).
CREATE OR REPLACE FUNCTION public.fn_procesar_abono_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id UUID;
  v_venta_total NUMERIC(10,2);
  v_total_abonado NUMERIC(10,2);
BEGIN
  -- Obtener el cliente_id y el total de la venta
  SELECT cliente_id, total INTO v_cliente_id, v_venta_total
  FROM public.ventas
  WHERE id = COALESCE(NEW.venta_id, OLD.venta_id);

  IF TG_OP = 'INSERT' THEN
    -- A. Descontar saldo deudor del cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = GREATEST(0.00, saldo_deudor - NEW.monto)
      WHERE id = v_cliente_id;
    END IF;

    -- B. Calcular el acumulado de pagos para esta venta
    SELECT COALESCE(SUM(monto), 0.00) INTO v_total_abonado
    FROM public.pagos_credito
    WHERE venta_id = NEW.venta_id;

    -- C. Si ya se cubrió el total, marcar la venta como cobrada
    IF v_total_abonado >= v_venta_total THEN
      UPDATE public.ventas
      SET estado = 'cobrada'
      WHERE id = NEW.venta_id;
    END IF;

    -- D. Registrar la cobranza en movimientos_caja (fuente única de verdad del dinero).
    INSERT INTO public.movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, pago_id)
    VALUES (auth.uid(), 'abono', NEW.monto, 'Abono credito folio ' || NEW.folio_pago,
            NEW.metodo,
            CASE WHEN NEW.metodo = 'efectivo' THEN 'caja' ELSE 'banco' END,
            NEW.id);

  ELSIF TG_OP = 'DELETE' THEN
    -- A. Regresar el saldo deudor al cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = saldo_deudor + OLD.monto
      WHERE id = v_cliente_id;
    END IF;

    -- B. Regresar el estado de la venta a pendiente
    UPDATE public.ventas
    SET estado = 'pendiente'
    WHERE id = OLD.venta_id;
    -- C. El movimiento de caja del abono se elimina por CASCADE (pago_id).
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
