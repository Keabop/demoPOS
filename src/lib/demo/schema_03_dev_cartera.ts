// src/lib/demo/schema_03_dev_cartera.ts — devoluciones + cartera (exentar/archivar/reactivar) + vw_ventas_historial
// Portado VERBATIM desde las migraciones de AGROMAR para PGlite (Postgres-WASM en el navegador):
//   - fn_registrar_devolucion + vw_ventas_historial  <- 20260627064526_fase1_inventario_usuario_y_devolucion_parcial.sql
//   - es_capaz_administrar_cartera / fn_cliente_exentar / fn_cliente_archivar / fn_cliente_reactivar
//                                                     <- 20260625000000_clientes_excepcion_archivado.sql
// Transformaciones PGlite aplicadas:
//   - se omiten GRANT/REVOKE (no hay roles anon/authenticated/service_role en el shim).
//   - se quita `WITH (security_invoker=true)` de la vista.
//   - se conservan auth.uid(), SECURITY DEFINER y los guards es_operador()/es_admin() (definidos en schema.ts).
// DEPENDENCIAS (creadas ANTES por otro paso): tablas devoluciones / devoluciones_detalles + seq_folio_devolucion,
//   columnas clientes.exento_bloqueo / clientes.archivado / clientes.archivado_en, ventas.tiene_devolucion_parcial,
//   ventas.abonado (materializada), ventas_detalles.ieps, y perfiles.permisos (jsonb, perfiles configurables).
export const SQL_03_DEV_CARTERA = /* sql */ `
-- ============================ DEVOLUCIONES (fase1: devolucion parcial) ============================
-- fn_registrar_devolucion: marca el indicador cuando la devolucion NO es total.
CREATE OR REPLACE FUNCTION public.fn_registrar_devolucion(p_venta_id uuid, p_lineas jsonb, p_motivo character varying DEFAULT NULL::character varying, p_metodo_reembolso character varying DEFAULT 'efectivo'::character varying)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_tipo_pago varchar; v_total numeric(10,2); v_estado varchar; v_cliente_id uuid;
  v_dev_id uuid; v_dev_folio varchar;
  v_linea record; v_det record;
  v_ya_devuelta numeric(10,2); v_monto_linea numeric(10,2); v_monto numeric(10,2) := 0;
  v_abonado numeric(10,2); v_devuelto_previo numeric(10,2); v_deuda_actual numeric(10,2);
  v_baja_deuda numeric(10,2); v_excedente numeric(10,2); v_metodo_final varchar;
  v_total_vendido numeric(10,2); v_total_devuelto numeric(10,2);
begin
  if not public.es_operador() then
    raise exception 'No autorizado: se requiere rol de operador para registrar devoluciones.';
  end if;
  if p_metodo_reembolso is null or p_metodo_reembolso not in ('efectivo','transferencia','tarjeta','debito') then
    raise exception 'Metodo de reembolso invalido: %.', p_metodo_reembolso;
  end if;

  select tipo_pago, total, estado, cliente_id
    into v_tipo_pago, v_total, v_estado, v_cliente_id
  from ventas where id = p_venta_id for update;
  if v_total is null then raise exception 'Venta no encontrada.'; end if;
  if v_estado = 'cancelada' then raise exception 'No se puede devolver una venta anulada.'; end if;
  if v_estado = 'devuelta' then raise exception 'La venta ya fue devuelta por completo.'; end if;

  insert into devoluciones (venta_id, vendedor_id, motivo, monto_devuelto, metodo_reembolso)
  values (p_venta_id, auth.uid(), p_motivo, 0, p_metodo_reembolso)
  returning id, folio into v_dev_id, v_dev_folio;

  for v_linea in
    select * from jsonb_to_recordset(p_lineas) as x(venta_detalle_id uuid, cantidad numeric, reingresa boolean)
  loop
    if v_linea.cantidad is null or v_linea.cantidad <= 0 then
      raise exception 'Cantidad de devolucion invalida.';
    end if;
    select * into v_det from ventas_detalles where id = v_linea.venta_detalle_id;
    if v_det.id is null or v_det.venta_id <> p_venta_id then
      raise exception 'Linea invalida para esta venta.';
    end if;
    select coalesce(sum(cantidad),0) into v_ya_devuelta
      from devoluciones_detalles where venta_detalle_id = v_linea.venta_detalle_id;
    if v_linea.cantidad > (v_det.cantidad - v_ya_devuelta) then
      raise exception 'La cantidad a devolver (%) excede lo disponible (%).', v_linea.cantidad, (v_det.cantidad - v_ya_devuelta);
    end if;

    v_monto_linea := round(v_det.precio_unitario * v_linea.cantidad
                           + coalesce(v_det.ieps,0) * (v_linea.cantidad / v_det.cantidad), 2);

    if coalesce(v_linea.reingresa, true) then
      if v_det.lote_id is not null then
        update lotes set stock_lote = stock_lote + v_linea.cantidad where id = v_det.lote_id;
      end if;
      if v_det.producto_id is not null then
        update productos set stock = stock + v_linea.cantidad where id = v_det.producto_id;
      end if;
    end if;

    insert into devoluciones_detalles
      (devolucion_id, venta_detalle_id, producto_id, lote_id, cantidad, monto, reingresa)
    values
      (v_dev_id, v_linea.venta_detalle_id, v_det.producto_id, v_det.lote_id,
       v_linea.cantidad, v_monto_linea, coalesce(v_linea.reingresa, true));

    v_monto := v_monto + v_monto_linea;
  end loop;

  if v_monto <= 0 then raise exception 'La devolucion no tiene lineas validas.'; end if;

  update devoluciones set monto_devuelto = v_monto where id = v_dev_id;

  if v_tipo_pago = 'credito' then
    select coalesce(sum(monto),0) into v_abonado from pagos_credito where venta_id = p_venta_id;
    select coalesce(sum(monto_devuelto),0) into v_devuelto_previo
      from devoluciones where venta_id = p_venta_id and id <> v_dev_id;
    v_deuda_actual := greatest(0, v_total - v_devuelto_previo - v_abonado);
    v_baja_deuda := least(v_monto, v_deuda_actual);
    if v_cliente_id is not null and v_baja_deuda > 0 then
      update clientes set saldo_deudor = greatest(0, saldo_deudor - v_baja_deuda) where id = v_cliente_id;
    end if;
    v_excedente := v_monto - v_baja_deuda;
    if v_excedente > 0 then
      insert into movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id)
      values (auth.uid(), 'egreso', v_excedente, 'Reembolso excedente devolucion folio ' || v_dev_folio,
              p_metodo_reembolso, 'caja', p_venta_id);
      v_metodo_final := p_metodo_reembolso;
    else
      v_metodo_final := 'credito';
    end if;
    update devoluciones set metodo_reembolso = v_metodo_final where id = v_dev_id;
  else
    if p_metodo_reembolso = 'efectivo' then
      insert into movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id)
      values (auth.uid(), 'egreso', v_monto, 'Devolucion folio ' || v_dev_folio, 'efectivo', 'caja', p_venta_id);
    end if;
  end if;

  select coalesce(sum(cantidad),0) into v_total_vendido from ventas_detalles where venta_id = p_venta_id;
  select coalesce(sum(dd.cantidad),0) into v_total_devuelto
    from devoluciones_detalles dd join devoluciones d on d.id = dd.devolucion_id
    where d.venta_id = p_venta_id;
  if v_total_devuelto >= v_total_vendido then
    update ventas set estado = 'devuelta' where id = p_venta_id;
  else
    update ventas set tiene_devolucion_parcial = true where id = p_venta_id;
  end if;

  return json_build_object('devolucion_id', v_dev_id, 'folio', v_dev_folio, 'monto_devuelto', v_monto);
end;
$$;

-- vw_ventas_historial: expone el indicador de devolucion parcial (sin WITH security_invoker en PGlite).
CREATE OR REPLACE VIEW public.vw_ventas_historial AS
 SELECT v.id, v.folio, v.fecha, v.tipo_pago, v.estado, v.subtotal, v.iva, v.total,
    v.plazo_dias, v.cliente_id, v.vendedor_id,
    c.nombre AS cliente_nombre, c.rancho AS cliente_rancho, pf.nombre AS vendedor_nombre,
    v.tiene_devolucion_parcial
   FROM ventas v
     LEFT JOIN clientes c ON c.id = v.cliente_id
     LEFT JOIN perfiles pf ON pf.id = v.vendedor_id;

-- ============================ CARTERA (excepcion de bloqueo + archivado) ============================
-- Guard de capacidad: admin siempre; otros solo si la tienen explicita en permisos.
CREATE OR REPLACE FUNCTION public.es_capaz_administrar_cartera()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (p.permisos->>'administrar_cartera')::boolean
       FROM perfiles p WHERE p.id = auth.uid() AND p.activo),
    public.es_admin()
  );
$function$;

-- Dar/quitar excepcion. p_exento=true => ademas reactiva el credito.
CREATE OR REPLACE FUNCTION public.fn_cliente_exentar(p_cliente uuid, p_exento boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
BEGIN
  IF NOT public.es_capaz_administrar_cartera() THEN
    RAISE EXCEPTION 'No autorizado: se requiere la capacidad de administrar cartera.';
  END IF;
  UPDATE clientes SET
    exento_bloqueo = p_exento,
    activo_para_credito = CASE WHEN p_exento THEN true ELSE activo_para_credito END
  WHERE id = p_cliente;
END;
$function$;

-- Archivar: solo si saldado y sin notas a credito activas (usa ventas.abonado materializado).
CREATE OR REPLACE FUNCTION public.fn_cliente_archivar(p_cliente uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
BEGIN
  IF NOT public.es_capaz_administrar_cartera() THEN
    RAISE EXCEPTION 'No autorizado: se requiere la capacidad de administrar cartera.';
  END IF;
  IF COALESCE((SELECT saldo_deudor FROM clientes WHERE id = p_cliente), 0) > 0
     OR EXISTS (SELECT 1 FROM ventas v
                WHERE v.cliente_id = p_cliente AND v.tipo_pago = 'credito'
                  AND v.estado <> 'cancelada' AND v.total > v.abonado) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo o notas a credito pendientes. Liquide primero.';
  END IF;
  UPDATE clientes SET archivado = true, archivado_en = now() WHERE id = p_cliente;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cliente_reactivar(p_cliente uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
BEGIN
  IF NOT public.es_capaz_administrar_cartera() THEN
    RAISE EXCEPTION 'No autorizado: se requiere la capacidad de administrar cartera.';
  END IF;
  UPDATE clientes SET archivado = false, archivado_en = null WHERE id = p_cliente;
END;
$function$;
`;
