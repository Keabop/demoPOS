-- =============================================================================
-- FLAG EXPLÍCITO DE CORTE DE CAJA
-- -----------------------------------------------------------------------------
-- El frontend detectaba los cortes leyendo el texto de la descripción
-- (descripcion ILIKE 'corte de caja%'), lo cual es frágil: cualquier cambio de
-- redacción rompe el emparejamiento apertura/corte y el cálculo de turnos.
-- Se agrega una columna booleana dedicada como fuente de verdad.
-- =============================================================================

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS es_corte BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: marcar los cortes históricos ya registrados por descripción.
UPDATE public.movimientos_caja
SET es_corte = TRUE
WHERE es_corte = FALSE
  AND tipo = 'egreso'
  AND descripcion ILIKE 'corte de caja%';

COMMENT ON COLUMN public.movimientos_caja.es_corte IS 'TRUE si el movimiento representa un corte/cierre de turno. Reemplaza la detección por texto.';

-- Índice parcial para localizar rápido el último corte de un turno.
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_cortes
  ON public.movimientos_caja (fecha DESC)
  WHERE es_corte = TRUE;
