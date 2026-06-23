-- Actualizar fn_registrar_venta_completa para recibir y almacenar el plazo_dias
DROP FUNCTION IF EXISTS fn_registrar_venta_completa(character varying, uuid, uuid, character varying, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION fn_registrar_venta_completa(
  p_folio character varying,
  p_cliente_id uuid,
  p_vendedor_id uuid,
  p_tipo_pago character varying,
  p_subtotal numeric,
  p_iva numeric,
  p_total numeric,
  p_detalles jsonb,
  p_plazo_dias integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venta_id UUID;
  v_detalle RECORD;
BEGIN
  -- 1. Validar credito si es credito
  IF p_tipo_pago = 'credito' THEN
    DECLARE
      v_activo BOOLEAN;
      v_limite DECIMAL;
      v_saldo DECIMAL;
      v_nombre VARCHAR;
    BEGIN
      SELECT nombre, activo_para_credito, limite_credito, saldo_deudor
      INTO v_nombre, v_activo, v_limite, v_saldo
      FROM clientes
      WHERE id = p_cliente_id;

      IF v_nombre IS NULL THEN
        RAISE EXCEPTION 'Cliente no seleccionado o inexistente.';
      END IF;

      IF NOT v_activo THEN
        RAISE EXCEPTION 'El cliente % está bloqueado para créditos (moroso).', v_nombre;
      END IF;

      IF (v_saldo + p_total) > v_limite THEN
        RAISE EXCEPTION 'Límite de crédito excedido. Disponible: %, Total Venta: %', (v_limite - v_saldo), p_total;
      END IF;
    END;
  END IF;

  -- 2. Insertar venta
  INSERT INTO ventas (folio, cliente_id, vendedor_id, tipo_pago, subtotal, iva, total, estado, plazo_dias)
  VALUES (p_folio, p_cliente_id, p_vendedor_id, p_tipo_pago, p_subtotal, p_iva, p_total, 
          CASE WHEN p_tipo_pago = 'credito' THEN 'pendiente' ELSE 'cobrada' END, p_plazo_dias)
  RETURNING id INTO v_venta_id;

  -- 3. Insertar detalles (Esto detonará el trigger fn_descontar_lotes_peps)
  FOR v_detalle IN 
    SELECT * FROM jsonb_to_recordset(p_detalles) 
    AS x(producto_id UUID, cantidad DECIMAL, precio_unitario DECIMAL, subtotal DECIMAL) 
  LOOP
    INSERT INTO ventas_detalles (venta_id, producto_id, cantidad, precio_unitario, subtotal)
    VALUES (v_venta_id, v_detalle.producto_id, v_detalle.cantidad, v_detalle.precio_unitario, v_detalle.subtotal);
  END LOOP;

  -- 4. Actualizar saldo deudor del cliente si es crédito
  IF p_tipo_pago = 'credito' THEN
    UPDATE clientes
    SET saldo_deudor = saldo_deudor + p_total
    WHERE id = p_cliente_id;
  END IF;

  -- 5. Registrar movimiento de caja si no es crédito
  IF p_tipo_pago IN ('efectivo', 'tarjeta') THEN
    INSERT INTO movimientos_caja (vendedor_id, tipo, monto, descripcion)
    VALUES (p_vendedor_id, 'venta', p_total, 'Venta contado folio ' || p_folio);
  END IF;

  RETURN v_venta_id;
END;
$$;
