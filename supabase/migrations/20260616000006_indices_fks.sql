-- =====================================================================
-- Índices en columnas de llave foránea que no tenían uno de apoyo.
-- Mejora joins y, sobre todo, los borrados ON DELETE RESTRICT/CASCADE
-- (Postgres no crea índice automático para las FK). Todos aditivos.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_lotes_producto_id ON public.lotes (producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON public.ventas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor_id ON public.ventas (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalles_lote_id ON public.ventas_detalles (lote_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalles_producto_id ON public.ventas_detalles (producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalles_venta_id ON public.ventas_detalles (venta_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_vendedor_id ON public.movimientos_caja (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pagos_credito_venta_id ON public.pagos_credito (venta_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_lote_id ON public.movimientos_inventario (lote_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_producto_id ON public.movimientos_inventario (producto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_creado_por ON public.ordenes_compra (creado_por);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_detalles_producto_id ON public.ordenes_compra_detalles (producto_id);
