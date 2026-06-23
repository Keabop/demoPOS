-- =====================================================================
-- Precio de compra por proveedor: la misma mercancía puede costar distinto
-- según el proveedor. Guarda el último precio que cada proveedor ofrece por
-- cada producto, para pre-llenarlo al crear una nueva orden de compra.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.proveedor_productos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio_compra numeric(10,2) NOT NULL DEFAULT 0.00,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now(),
  UNIQUE (proveedor_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_proveedor_productos_proveedor_id ON public.proveedor_productos (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_proveedor_productos_producto_id ON public.proveedor_productos (producto_id);

-- RLS por rol (mismo patrón que proveedores/ordenes_compra)
ALTER TABLE public.proveedor_productos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedor_productos TO authenticated;
REVOKE ALL ON public.proveedor_productos FROM anon;

DROP POLICY IF EXISTS proveedor_productos_select_operador ON public.proveedor_productos;
CREATE POLICY proveedor_productos_select_operador ON public.proveedor_productos
  FOR SELECT USING (public.es_operador());

DROP POLICY IF EXISTS proveedor_productos_insert_operador ON public.proveedor_productos;
CREATE POLICY proveedor_productos_insert_operador ON public.proveedor_productos
  FOR INSERT WITH CHECK (public.es_operador());

DROP POLICY IF EXISTS proveedor_productos_update_operador ON public.proveedor_productos;
CREATE POLICY proveedor_productos_update_operador ON public.proveedor_productos
  FOR UPDATE USING (public.es_operador()) WITH CHECK (public.es_operador());

DROP POLICY IF EXISTS proveedor_productos_delete_admin ON public.proveedor_productos;
CREATE POLICY proveedor_productos_delete_admin ON public.proveedor_productos
  FOR DELETE USING (public.es_admin());

-- =====================================================================
-- Al recibir una orden, además de subir stock y costo del lote:
--   - actualiza productos.costo (referencia general de último costo)
--   - registra/actualiza el precio de compra de ese proveedor (upsert)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_recibir_orden_compra(p_orden_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_estado varchar;
  v_folio varchar;
  v_proveedor_id uuid;
  v_det record;
  v_lote_id uuid;
begin
  if not public.es_operador() then
    raise exception 'No autorizado: se requiere rol de operador para recibir órdenes.';
  end if;

  select estado, folio, proveedor_id into v_estado, v_folio, v_proveedor_id
  from ordenes_compra where id = p_orden_id;
  if v_estado is null then raise exception 'Orden no encontrada.'; end if;
  if v_estado = 'recibida' then raise exception 'La orden ya fue recibida.'; end if;
  if v_estado = 'cancelada' then raise exception 'La orden está cancelada.'; end if;

  for v_det in select * from ordenes_compra_detalles where orden_id = p_orden_id loop
    insert into movimientos_inventario (producto_id, tipo, cantidad, referencia, descripcion)
    values (v_det.producto_id, 'entrada', v_det.cantidad, v_folio, 'Recepción OC ' || v_folio)
    returning lote_id into v_lote_id;

    if v_lote_id is not null then
      update lotes set costo = v_det.precio_unitario where id = v_lote_id;
    end if;

    -- Referencia general de último costo del producto
    update productos set costo = v_det.precio_unitario where id = v_det.producto_id;

    -- Último precio de compra de este proveedor para este producto
    insert into proveedor_productos (proveedor_id, producto_id, precio_compra)
    values (v_proveedor_id, v_det.producto_id, v_det.precio_unitario)
    on conflict (proveedor_id, producto_id)
    do update set precio_compra = excluded.precio_compra, actualizado_en = now();
  end loop;

  update ordenes_compra set estado = 'recibida', fecha_recepcion = now() where id = p_orden_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_recibir_orden_compra(uuid) FROM anon;
