-- T-COB-1: registrar abonos vía RPC con validación en el servidor.
-- Bloquea la venta (FOR UPDATE) para evitar sobre-pago por concurrencia (TOCTOU)
-- y genera un folio único con reintento ante colisión.
CREATE OR REPLACE FUNCTION public.fn_registrar_abono(
  p_venta_id uuid,
  p_monto numeric,
  p_metodo character varying
)
 RETURNS character varying
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC(10,2);
  v_estado VARCHAR;
  v_abonado NUMERIC(10,2);
  v_saldo NUMERIC(10,2);
  v_folio VARCHAR;
  v_intentos INT := 0;
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de operador para registrar abonos.';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a 0.';
  END IF;

  IF p_metodo NOT IN ('efectivo','transferencia','tarjeta','debito') THEN
    RAISE EXCEPTION 'Método de pago inválido: %.', p_metodo;
  END IF;

  -- Bloquear la venta para evitar sobre-pago por concurrencia.
  SELECT total, estado INTO v_total, v_estado
  FROM ventas WHERE id = p_venta_id FOR UPDATE;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;
  IF v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La venta no está pendiente de pago (estado actual: %).', v_estado;
  END IF;

  SELECT COALESCE(SUM(monto), 0.00) INTO v_abonado
  FROM pagos_credito WHERE venta_id = p_venta_id;
  v_saldo := v_total - v_abonado;

  IF p_monto > v_saldo THEN
    RAISE EXCEPTION 'El abono (%) excede el saldo pendiente (%).', p_monto, v_saldo;
  END IF;

  -- Insertar con folio único; reintentar ante colisión UNIQUE (baja probabilidad).
  LOOP
    v_folio := 'P-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    BEGIN
      INSERT INTO pagos_credito (venta_id, monto, metodo, folio_pago)
      VALUES (p_venta_id, p_monto, p_metodo, v_folio);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_intentos := v_intentos + 1;
      IF v_intentos >= 5 THEN
        RAISE EXCEPTION 'No se pudo generar un folio único para el abono.';
      END IF;
    END;
  END LOOP;

  RETURN v_folio;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_registrar_abono(uuid, numeric, character varying) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_registrar_abono(uuid, numeric, character varying) TO authenticated, service_role;
