-- =============================================================================
-- COSTO DE COMPRA PARA VALUACIÓN DE INVENTARIO
-- -----------------------------------------------------------------------------
-- La valuación de inventario usaba precio_publico (precio de VENTA), que infla
-- el valor del almacén. Contablemente el inventario se valúa a COSTO.
--   * lotes.costo: costo real unitario de ESE lote (fuente de verdad para PEPS).
--   * productos.costo: último costo de referencia (para mostrar y precargar el
--     formulario de entrada de stock). La valuación real suma por lote.
-- Default 0.00 para no romper datos existentes; se irá capturando en cada entrada.
-- =============================================================================

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS costo DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (costo >= 0);

ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS costo DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (costo >= 0);

COMMENT ON COLUMN public.productos.costo IS 'Último costo de compra de referencia (MXN). La valuación real se calcula por lote.';
COMMENT ON COLUMN public.lotes.costo IS 'Costo de compra unitario real de este lote (MXN), usado para valuar inventario a costo.';
