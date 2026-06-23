-- =============================================================================
-- RLS POR ROL (reemplaza las políticas abiertas de desarrollo)
-- -----------------------------------------------------------------------------
-- La migración 20260612000002 dejó FOR ALL TO anon, authenticated USING(true).
-- Como la anon key viaja al navegador, eso daba lectura/escritura TOTAL a
-- cualquiera. Aquí se restringe por rol leído de public.perfiles.
--
-- Notas de diseño:
--  * El rol 'anon' pierde TODO acceso salvo SELECT en `productos`, que el
--    escáner móvil (MobileScanner, sesión sin login) necesita para resolver el
--    código escaneado. Los precios no son sensibles (el visitante ya los ve).
--  * El cobro usa fn_registrar_venta_completa (SECURITY DEFINER), que omite RLS
--    en sus inserciones internas, así que la venta funciona con RLS estricto.
--  * Matriz acordada: admin = todo; vendedor = ventas, caja, abonos, clientes y
--    catálogo (sin DELETE); visitante = solo lectura de catálogo.
-- =============================================================================

-- 0. Helpers: leer el rol del usuario autenticado. SECURITY DEFINER + STABLE
--    para que la política no choque con el propio RLS de `perfiles`.
CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rol_actual() = 'admin';
$$;

-- Operador de mostrador: admin o vendedor (pueden vender, cobrar, mover caja).
CREATE OR REPLACE FUNCTION public.es_operador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rol_actual() IN ('admin', 'vendedor');
$$;

-- 1. Eliminar las políticas abiertas de desarrollo (incluida movimientos_inventario).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'perfiles','productos','lotes','clientes','ventas','ventas_detalles',
    'movimientos_caja','pagos_credito','movimientos_inventario'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Permitir todo a anon y autenticados" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir actualizacion a autenticados" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir escritura a autenticados" ON public.%I', t);
  END LOOP;
END $$;

-- Asegurar RLS habilitado en la tabla agregada después del esquema inicial.
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. PERFILES
--    - admin: ve y gestiona todos los perfiles (alta de vendedores, asignación
--      de rol, ver quién hizo cada venta).
--    - resto: solo su propio perfil (lectura).
-- =============================================================================
CREATE POLICY "perfiles_select_admin_o_propio" ON public.perfiles
  FOR SELECT TO authenticated
  USING (public.es_admin() OR id = auth.uid());

CREATE POLICY "perfiles_insert_admin" ON public.perfiles
  FOR INSERT TO authenticated
  WITH CHECK (public.es_admin());

CREATE POLICY "perfiles_update_admin" ON public.perfiles
  FOR UPDATE TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

CREATE POLICY "perfiles_delete_admin" ON public.perfiles
  FOR DELETE TO authenticated
  USING (public.es_admin());

-- =============================================================================
-- 3. PRODUCTOS y LOTES (catálogo)
--    - SELECT: cualquier autenticado + anon (escáner móvil sobre productos).
--    - INSERT/UPDATE: operador (recepción de stock, ajustes de precio).
--    - DELETE: solo admin.
-- =============================================================================
CREATE POLICY "productos_select_todos" ON public.productos
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "productos_insert_operador" ON public.productos
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "productos_update_operador" ON public.productos
  FOR UPDATE TO authenticated USING (public.es_operador()) WITH CHECK (public.es_operador());
CREATE POLICY "productos_delete_admin" ON public.productos
  FOR DELETE TO authenticated USING (public.es_admin());

CREATE POLICY "lotes_select_autenticados" ON public.lotes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lotes_insert_operador" ON public.lotes
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "lotes_update_operador" ON public.lotes
  FOR UPDATE TO authenticated USING (public.es_operador()) WITH CHECK (public.es_operador());
CREATE POLICY "lotes_delete_admin" ON public.lotes
  FOR DELETE TO authenticated USING (public.es_admin());

-- =============================================================================
-- 4. CLIENTES
--    - operador: lee, crea y actualiza (cartera, límites, saldos).
--    - DELETE: solo admin.
--    - visitante: sin acceso (no debe ver deudas de clientes).
-- =============================================================================
CREATE POLICY "clientes_select_operador" ON public.clientes
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "clientes_insert_operador" ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "clientes_update_operador" ON public.clientes
  FOR UPDATE TO authenticated USING (public.es_operador()) WITH CHECK (public.es_operador());
CREATE POLICY "clientes_delete_admin" ON public.clientes
  FOR DELETE TO authenticated USING (public.es_admin());

-- =============================================================================
-- 5. VENTAS y VENTAS_DETALLES
--    - operador: lee y crea (también vía RPC definer).
--    - UPDATE/DELETE (cancelar venta): solo admin.
-- =============================================================================
CREATE POLICY "ventas_select_operador" ON public.ventas
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "ventas_insert_operador" ON public.ventas
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "ventas_update_admin" ON public.ventas
  FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "ventas_delete_admin" ON public.ventas
  FOR DELETE TO authenticated USING (public.es_admin());

CREATE POLICY "ventas_detalles_select_operador" ON public.ventas_detalles
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "ventas_detalles_insert_operador" ON public.ventas_detalles
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "ventas_detalles_delete_admin" ON public.ventas_detalles
  FOR DELETE TO authenticated USING (public.es_admin());

-- =============================================================================
-- 6. MOVIMIENTOS_CAJA
--    - operador: lee, abre turno, registra ingresos/egresos/cortes.
--    - UPDATE/DELETE: solo admin (la caja no se edita una vez registrada).
-- =============================================================================
CREATE POLICY "movimientos_caja_select_operador" ON public.movimientos_caja
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "movimientos_caja_insert_operador" ON public.movimientos_caja
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "movimientos_caja_update_admin" ON public.movimientos_caja
  FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "movimientos_caja_delete_admin" ON public.movimientos_caja
  FOR DELETE TO authenticated USING (public.es_admin());

-- =============================================================================
-- 7. PAGOS_CREDITO (abonos)
--    - operador: lee y registra abonos.
--    - DELETE (cancelar abono, revierte saldo vía trigger): solo admin.
-- =============================================================================
CREATE POLICY "pagos_credito_select_operador" ON public.pagos_credito
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "pagos_credito_insert_operador" ON public.pagos_credito
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "pagos_credito_delete_admin" ON public.pagos_credito
  FOR DELETE TO authenticated USING (public.es_admin());

-- =============================================================================
-- 8. MOVIMIENTOS_INVENTARIO
--    - operador: lee y registra entradas/salidas/ajustes.
--    - DELETE: solo admin.
-- =============================================================================
CREATE POLICY "movimientos_inventario_select_operador" ON public.movimientos_inventario
  FOR SELECT TO authenticated USING (public.es_operador());
CREATE POLICY "movimientos_inventario_insert_operador" ON public.movimientos_inventario
  FOR INSERT TO authenticated WITH CHECK (public.es_operador());
CREATE POLICY "movimientos_inventario_delete_admin" ON public.movimientos_inventario
  FOR DELETE TO authenticated USING (public.es_admin());
