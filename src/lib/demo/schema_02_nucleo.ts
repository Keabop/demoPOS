// src/lib/demo/schema_02_nucleo.ts — funciones núcleo del guión (venta/abono/folio/interés)
//
// Portado de las migraciones de AGROMAR (supabase/migrations), versión FINAL de archivo
// de cada función. Adaptado a PGlite: se quitaron GRANT/REVOKE/RLS/cron/COMMENT y
// referencias a roles. Los guards public.es_operador()/public.es_visitante() y las
// secuencias seq_folio_venta/seq_folio_abono/seq_folio_cotizacion + columnas
// ventas.ieps/nivel_precio y ventas_detalles.ieps se definen en el esquema base
// (schema_01) ANTES de cargar este archivo. Todas con CREATE OR REPLACE.
//
// Origen por función:
//   fn_registrar_venta_completa  → 20260625000011_grupo2_rpc_venta_folio.sql
//   fn_registrar_abono           → 20260625000020_grupo3_abono_fecha.sql
//   fn_siguiente_folio_cotizacion→ 20260625000013_grupo2_rpc_folio_cotizacion.sql
//   fn_saldo_nota / fn_saldo_cliente / fn_estado_cuenta_cliente
//                                → 20260626000003_interes_moratorio.sql (verbatim)
export const SQL_02_NUCLEO = /* sql */ `
-- ── fn_registrar_venta_completa ─────────────────────────────────────────────
-- Firma nueva sin p_folio; el folio lo genera la secuencia seq_folio_venta y la
-- función devuelve json {venta_id, folio}. Conserva la lógica del Grupo 1
-- (p_ieps/p_nivel_precio, IEPS por línea, validación de crédito, caja).
-- El DROP elimina la firma anterior (con p_folio) por si el esquema base la dejó,
-- evitando una sobrecarga ambigua (las firmas difieren, OR REPLACE no la unifica).
DROP FUNCTION IF EXISTS public.fn_registrar_venta_completa(character varying, uuid, uuid, character varying, numeric, numeric, numeric, jsonb, integer, numeric, character varying);

CREATE OR REPLACE FUNCTION public.fn_registrar_venta_completa(
  p_cliente_id uuid, p_vendedor_id uuid, p_tipo_pago character varying,
  p_subtotal numeric, p_iva numeric, p_total numeric, p_detalles jsonb,
  p_plazo_dias integer DEFAULT 30, p_ieps numeric DEFAULT 0, p_nivel_precio character varying DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id UUID;
  v_detalle RECORD;
  v_folio VARCHAR;
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

  v_folio := 'V-' || lpad(nextval('seq_folio_venta')::text, 4, '0');

  INSERT INTO ventas (folio, cliente_id, vendedor_id, tipo_pago, subtotal, iva, ieps, total, estado, plazo_dias, nivel_precio)
  VALUES (v_folio, p_cliente_id, p_vendedor_id, p_tipo_pago, p_subtotal, p_iva, p_ieps, p_total,
          CASE WHEN p_tipo_pago = 'credito' THEN 'pendiente' ELSE 'cobrada' END, p_plazo_dias, p_nivel_precio)
  RETURNING id INTO v_venta_id;

  FOR v_detalle IN
    SELECT * FROM jsonb_to_recordset(p_detalles) AS x(producto_id UUID, cantidad DECIMAL, precio_unitario DECIMAL, subtotal DECIMAL, ieps DECIMAL)
  LOOP
    INSERT INTO ventas_detalles (venta_id, producto_id, cantidad, precio_unitario, subtotal, ieps)
    VALUES (v_venta_id, v_detalle.producto_id, v_detalle.cantidad, v_detalle.precio_unitario, v_detalle.subtotal, COALESCE(v_detalle.ieps, 0));
  END LOOP;

  IF p_tipo_pago = 'credito' THEN
    UPDATE clientes SET saldo_deudor = saldo_deudor + p_total WHERE id = p_cliente_id;
  END IF;

  IF p_tipo_pago IN ('efectivo', 'tarjeta', 'debito', 'transferencia') THEN
    INSERT INTO movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id)
    VALUES (p_vendedor_id, 'venta', p_total, 'Venta contado folio ' || v_folio,
            p_tipo_pago,
            CASE WHEN p_tipo_pago = 'efectivo' THEN 'caja' ELSE 'banco' END,
            v_venta_id);
  END IF;

  RETURN json_build_object('venta_id', v_venta_id, 'folio', v_folio);
END;
$function$;

-- ── fn_registrar_abono ──────────────────────────────────────────────────────
-- Fecha de pago opcional (p_fecha DEFAULT now()) y folio secuencial (seq_folio_abono).
-- El DROP elimina la firma anterior de 3 args (sin p_fecha) para evitar sobrecarga.
DROP FUNCTION IF EXISTS public.fn_registrar_abono(uuid, numeric, character varying);

CREATE OR REPLACE FUNCTION public.fn_registrar_abono(p_venta_id uuid, p_monto numeric, p_metodo character varying, p_fecha timestamptz DEFAULT now())
RETURNS character varying
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC(10,2);
  v_estado VARCHAR;
  v_abonado NUMERIC(10,2);
  v_saldo NUMERIC(10,2);
  v_folio VARCHAR;
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

  SELECT total, estado INTO v_total, v_estado FROM ventas WHERE id = p_venta_id FOR UPDATE;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_estado <> 'pendiente' THEN RAISE EXCEPTION 'La venta no está pendiente de pago (estado actual: %).', v_estado; END IF;

  SELECT COALESCE(SUM(monto), 0.00) INTO v_abonado FROM pagos_credito WHERE venta_id = p_venta_id;
  v_saldo := v_total - v_abonado;
  IF p_monto > v_saldo THEN RAISE EXCEPTION 'El abono (%) excede el saldo pendiente (%).', p_monto, v_saldo; END IF;

  v_folio := 'P-' || lpad(nextval('seq_folio_abono')::text, 4, '0');
  INSERT INTO pagos_credito (venta_id, monto, metodo, folio_pago, fecha)
  VALUES (p_venta_id, p_monto, p_metodo, v_folio, COALESCE(p_fecha, now()));

  RETURN v_folio;
END;
$function$;

-- ── fn_siguiente_folio_cotizacion ───────────────────────────────────────────
-- La cotización no se persiste; el número puede saltar si se cancela el PDF.
CREATE OR REPLACE FUNCTION public.fn_siguiente_folio_cotizacion()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.es_operador() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  RETURN nextval('seq_folio_cotizacion')::text;
END;
$function$;

-- ── Interés moratorio 2% mensual COMPUESTO, on-demand ───────────────────────
-- Núcleo: saldo por nota y por cliente (fuente de verdad). Portado verbatim de
-- 20260626000003_interes_moratorio.sql. El interés se calcula al vuelo a partir
-- del vencimiento, los pagos y las devoluciones; nada se materializa.
create or replace function public.fn_saldo_nota(p_venta_id uuid, p_fecha_corte date default current_date)
returns table(capital numeric, interes numeric, saldo_total numeric, meses_vencidos int, dias_atraso int, fecha_venc date, total numeric, abonado numeric, devuelto numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_total numeric(12,2); v_estado varchar; v_fecha date; v_plazo int; v_cliente uuid; v_dias_cli int;
  v_venc date; v_capital numeric(14,4); v_interes numeric(14,4); v_meses int := 0;
  v_abonado numeric(14,4); v_devuelto numeric(14,4); v_ev record;
  TASA constant numeric := 0.02;
begin
  select v.total, v.estado, v.fecha::date, v.plazo_dias, v.cliente_id
    into v_total, v_estado, v_fecha, v_plazo, v_cliente
  from ventas v where v.id = p_venta_id and v.tipo_pago = 'credito';
  if v_total is null then
    return query select 0::numeric,0::numeric,0::numeric,0,0,null::date,0::numeric,0::numeric,0::numeric; return;
  end if;
  select dias_credito into v_dias_cli from clientes where id = v_cliente;
  v_venc := (v_fecha + (coalesce(v_plazo, v_dias_cli, 30) || ' days')::interval)::date;

  select coalesce(sum(monto),0) into v_abonado from pagos_credito where venta_id=p_venta_id and fecha::date <= p_fecha_corte;
  select coalesce(sum(monto_devuelto),0) into v_devuelto from devoluciones where venta_id=p_venta_id and fecha::date <= p_fecha_corte;

  if v_estado = 'cancelada' then
    return query select 0::numeric,0::numeric,0::numeric,0,(p_fecha_corte - v_venc)::int,v_venc,v_total,v_abonado::numeric,v_devuelto::numeric; return;
  end if;

  v_capital := v_total; v_interes := 0;
  select coalesce(max(g),0) into v_meses from generate_series(1,1200) g
   where (v_venc + (g || ' months')::interval)::date <= p_fecha_corte;

  for v_ev in
    select fecha_evt, orden, monto from (
      select (v_venc + (g || ' months')::interval)::date as fecha_evt, 0 as orden, 0::numeric as monto
        from generate_series(1, v_meses) g
      union all
      select fecha::date, 1, monto from pagos_credito where venta_id=p_venta_id and fecha::date <= p_fecha_corte
      union all
      select fecha::date, 2, monto_devuelto from devoluciones where venta_id=p_venta_id and fecha::date <= p_fecha_corte
    ) e order by fecha_evt, orden
  loop
    if v_ev.orden = 0 then
      v_interes := round(v_interes + (v_capital + v_interes) * TASA, 2);
    elsif v_ev.orden = 1 then
      declare v_pi numeric(14,4); v_resto numeric(14,4);
      begin
        v_pi := least(v_ev.monto, v_interes);
        v_interes := round(v_interes - v_pi, 2);
        v_resto := round(v_ev.monto - v_pi, 2);
        v_capital := round(greatest(0, v_capital - v_resto), 2);
      end;
    else
      v_capital := round(greatest(0, v_capital - least(v_capital, v_ev.monto)), 2);
    end if;
  end loop;

  return query select
    v_capital::numeric, v_interes::numeric, round(v_capital + v_interes,2)::numeric,
    v_meses, (p_fecha_corte - v_venc)::int, v_venc, v_total, v_abonado::numeric, v_devuelto::numeric;
end;
$function$;

create or replace function public.fn_saldo_cliente(p_cliente_id uuid, p_fecha_corte date default current_date)
returns table(capital numeric, interes numeric, saldo_total numeric)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not (public.es_operador() or public.es_visitante()) then
    raise exception 'No autorizado: se requiere una sesion activa.';
  end if;
  return query
  select coalesce(sum(s.capital),0)::numeric, coalesce(sum(s.interes),0)::numeric, coalesce(sum(s.saldo_total),0)::numeric
  from ventas v
  cross join lateral public.fn_saldo_nota(v.id, p_fecha_corte) s
  where v.cliente_id = p_cliente_id and v.tipo_pago='credito' and v.estado <> 'cancelada';
end;
$function$;

-- Estado de cuenta por cliente (desglose por nota).
create or replace function public.fn_estado_cuenta_cliente(p_cliente_id uuid, p_fecha_corte date default current_date)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_rows jsonb;
begin
  if not (public.es_operador() or public.es_visitante()) then
    raise exception 'No autorizado: se requiere una sesion activa.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.fecha asc), '[]'::jsonb) into v_rows from (
    select v.id as venta_id, v.folio, v.fecha, v.total, v.estado,
           s.fecha_venc, s.capital, s.interes, s.saldo_total, s.abonado, s.devuelto, s.dias_atraso
    from ventas v
    cross join lateral public.fn_saldo_nota(v.id, p_fecha_corte) s
    where v.cliente_id = p_cliente_id and v.tipo_pago = 'credito'
  ) r;
  return v_rows;
end;
$function$;
`;
