-- Q7: motivo tipificado en salidas de inventario (merma/caducidad/robo/ajuste/devolución).
ALTER TABLE public.movimientos_inventario ADD COLUMN IF NOT EXISTS motivo varchar;
ALTER TABLE public.movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_motivo_check;
ALTER TABLE public.movimientos_inventario ADD CONSTRAINT movimientos_inventario_motivo_check
  CHECK (motivo IS NULL OR motivo IN ('merma','caducidad','robo','ajuste','devolucion'));
