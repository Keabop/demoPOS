-- M3: soft-delete / descontinuar productos sin borrar su historial.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos (activo) WHERE activo = false;
