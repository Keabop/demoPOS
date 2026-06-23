-- 1. Eliminar políticas existentes restrictivas
DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON perfiles;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON productos;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON lotes;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON clientes;
DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON clientes;
DROP POLICY IF EXISTS "Permitir actualizacion a autenticados" ON clientes;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON ventas;
DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON ventas;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON ventas_detalles;
DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON ventas_detalles;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON movimientos_caja;
DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON movimientos_caja;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON pagos_credito;
DROP POLICY IF EXISTS "Permitir insercion a autenticados" ON pagos_credito;

DROP POLICY IF EXISTS "Permitir lectura general a autenticados" ON movimientos_inventario;
DROP POLICY IF EXISTS "Permitir escritura a autenticados" ON movimientos_inventario;

-- 2. Crear nuevas políticas que permitan TODO (Lectura/Escritura) tanto a roles 'anon' como 'authenticated'
CREATE POLICY "Permitir todo a anon y autenticados" ON perfiles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON productos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON lotes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON clientes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON ventas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON ventas_detalles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON movimientos_caja
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON pagos_credito
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a anon y autenticados" ON movimientos_inventario
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
