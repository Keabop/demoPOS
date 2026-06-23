-- ============================================================
-- Migración: Convertir TIMESTAMP -> TIMESTAMPTZ
-- ============================================================
-- PROBLEMA: Todas las columnas 'fecha' estaban definidas como TIMESTAMP 
-- (sin timezone). PostgreSQL almacenaba la hora UTC del servidor, pero 
-- el frontend la interpretaba sin offset, causando que se mostrara la 
-- hora UTC en vez de la hora local (UTC-6 México Central).
--
-- SOLUCIÓN: Cambiar a TIMESTAMPTZ (timestamp with time zone). 
-- Los valores existentes se reinterpretarán como UTC, y el frontend 
-- los parseará correctamente con offset.
-- ============================================================

-- Configurar la timezone del proyecto a México Central
ALTER DATABASE postgres SET timezone TO 'America/Mexico_City';

-- 1. Tabla productos: creado_en
ALTER TABLE productos ALTER COLUMN creado_en TYPE TIMESTAMPTZ USING creado_en AT TIME ZONE 'UTC';

-- 2. Tabla lotes: fecha_entrada
ALTER TABLE lotes ALTER COLUMN fecha_entrada TYPE TIMESTAMPTZ USING fecha_entrada AT TIME ZONE 'UTC';

-- 3. Tabla clientes: creado_en
ALTER TABLE clientes ALTER COLUMN creado_en TYPE TIMESTAMPTZ USING creado_en AT TIME ZONE 'UTC';

-- 4. Tabla ventas: fecha
ALTER TABLE ventas ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC';

-- 5. Tabla movimientos_caja: fecha
ALTER TABLE movimientos_caja ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC';

-- 6. Tabla pagos_credito: fecha
ALTER TABLE pagos_credito ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC';

-- Verificar: los nuevos inserts con NOW() incluirán timezone info automáticamente
