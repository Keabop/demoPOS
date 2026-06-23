-- M1: enriquecer movimientos_caja para que sea la fuente única de verdad del dinero.
-- Aditivo y no destructivo (datos de prueba intactos).

-- 1. Columnas de método y categoría, y vínculo a venta/pago para idempotencia y trazabilidad.
ALTER TABLE public.movimientos_caja ADD COLUMN IF NOT EXISTS metodo    VARCHAR;
ALTER TABLE public.movimientos_caja ADD COLUMN IF NOT EXISTS categoria VARCHAR;
ALTER TABLE public.movimientos_caja ADD COLUMN IF NOT EXISTS venta_id  UUID REFERENCES public.ventas(id) ON DELETE CASCADE;
ALTER TABLE public.movimientos_caja ADD COLUMN IF NOT EXISTS pago_id   UUID REFERENCES public.pagos_credito(id) ON DELETE CASCADE;

-- 2. Extender el CHECK de tipo para admitir 'abono' (cobranza a crédito).
ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo IN ('apertura','ingreso','egreso','venta','abono'));

-- 3. CHECKs de método y categoría (NULL permitido para apertura/ingreso/egreso manuales).
ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_metodo_check;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_metodo_check
  CHECK (metodo IS NULL OR metodo IN ('efectivo','transferencia','tarjeta','debito'));

ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_categoria_check;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_categoria_check
  CHECK (categoria IS NULL OR categoria IN ('caja','banco'));

-- 4. Un movimiento como máximo por venta y por pago (idempotencia / anti doble conteo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_movcaja_venta ON public.movimientos_caja (venta_id) WHERE venta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_movcaja_pago  ON public.movimientos_caja (pago_id)  WHERE pago_id  IS NOT NULL;
