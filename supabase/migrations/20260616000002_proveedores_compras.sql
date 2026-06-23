-- =============================================================================
-- MÓDULO 07: PROVEEDORES Y COMPRAS
-- Tablas proveedores / ordenes_compra / ordenes_compra_detalles + RLS por rol +
-- RPC fn_recibir_orden_compra (al recibir, genera entradas de inventario con costo).
-- =============================================================================

create table public.proveedores (
  id uuid primary key default uuid_generate_v4(),
  nombre varchar not null,
  contacto varchar,
  telefono varchar,
  email varchar,
  direccion varchar,
  rfc varchar,
  activo boolean not null default true,
  creado_en timestamptz default now()
);
alter table public.proveedores enable row level security;

create table public.ordenes_compra (
  id uuid primary key default uuid_generate_v4(),
  folio varchar unique not null,
  proveedor_id uuid references public.proveedores(id) on delete restrict,
  estado varchar not null default 'borrador' check (estado in ('borrador','enviada','recibida','cancelada')),
  fecha timestamptz default now(),
  fecha_recepcion timestamptz,
  tasa_iva decimal(4,2) not null default 0.16 check (tasa_iva >= 0),
  subtotal decimal(10,2) not null default 0,
  iva decimal(10,2) not null default 0,
  total decimal(10,2) not null default 0,
  instrucciones varchar,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz default now()
);
alter table public.ordenes_compra enable row level security;
create index idx_ordenes_compra_proveedor on public.ordenes_compra(proveedor_id);

create table public.ordenes_compra_detalles (
  id uuid primary key default uuid_generate_v4(),
  orden_id uuid references public.ordenes_compra(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete restrict,
  descripcion varchar,
  presentacion varchar,
  cantidad decimal(10,2) not null check (cantidad > 0),
  precio_unitario decimal(10,2) not null check (precio_unitario >= 0),
  subtotal decimal(10,2) not null
);
alter table public.ordenes_compra_detalles enable row level security;
create index idx_oc_detalles_orden on public.ordenes_compra_detalles(orden_id);

-- RLS: operador (admin+vendedor) lee/crea/actualiza; admin borra.
create policy "proveedores_select_operador" on public.proveedores for select to authenticated using (public.es_operador());
create policy "proveedores_insert_operador" on public.proveedores for insert to authenticated with check (public.es_operador());
create policy "proveedores_update_operador" on public.proveedores for update to authenticated using (public.es_operador()) with check (public.es_operador());
create policy "proveedores_delete_admin" on public.proveedores for delete to authenticated using (public.es_admin());

create policy "oc_select_operador" on public.ordenes_compra for select to authenticated using (public.es_operador());
create policy "oc_insert_operador" on public.ordenes_compra for insert to authenticated with check (public.es_operador());
create policy "oc_update_operador" on public.ordenes_compra for update to authenticated using (public.es_operador()) with check (public.es_operador());
create policy "oc_delete_admin" on public.ordenes_compra for delete to authenticated using (public.es_admin());

create policy "ocd_select_operador" on public.ordenes_compra_detalles for select to authenticated using (public.es_operador());
create policy "ocd_insert_operador" on public.ordenes_compra_detalles for insert to authenticated with check (public.es_operador());
create policy "ocd_update_operador" on public.ordenes_compra_detalles for update to authenticated using (public.es_operador()) with check (public.es_operador());
create policy "ocd_delete_admin" on public.ordenes_compra_detalles for delete to authenticated using (public.es_admin());

-- RPC transaccional: recibir orden → entradas de inventario (lote + costo + stock).
create or replace function public.fn_recibir_orden_compra(p_orden_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_estado varchar;
  v_folio varchar;
  v_det record;
  v_lote_id uuid;
begin
  select estado, folio into v_estado, v_folio from ordenes_compra where id = p_orden_id;
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
  end loop;

  update ordenes_compra set estado = 'recibida', fecha_recepcion = now() where id = p_orden_id;
end;
$$;

revoke execute on function public.fn_recibir_orden_compra(uuid) from public, anon;
grant execute on function public.fn_recibir_orden_compra(uuid) to authenticated;
