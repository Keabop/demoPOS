-- M5a: capa de Configuración de empresa (singleton) para productizar (modelo A).
CREATE TABLE IF NOT EXISTS public.configuracion (
  id              integer       PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  razon_social    varchar       NOT NULL DEFAULT 'AGROMAR',
  descripcion     varchar       NOT NULL DEFAULT '',
  responsable     varchar       NOT NULL DEFAULT '',
  rfc             varchar       NOT NULL DEFAULT '',
  direccion       varchar       NOT NULL DEFAULT '',
  cp              varchar       NOT NULL DEFAULT '',
  ciudad          varchar       NOT NULL DEFAULT '',
  telefono        varchar       NOT NULL DEFAULT '',
  tel_pagare      varchar       NOT NULL DEFAULT '',
  email           varchar       NOT NULL DEFAULT '',
  logo_url        text          DEFAULT '/logo-agromar.png',
  moneda_simbolo  varchar       NOT NULL DEFAULT '$',
  moneda_iso      varchar       NOT NULL DEFAULT 'MXN',
  locale          varchar       NOT NULL DEFAULT 'es-MX',
  iva_default     numeric(4,2)  NOT NULL DEFAULT 0,
  actualizado_en  timestamptz   DEFAULT now()
);

-- Fila única con los datos actuales de AGROMAR (de src/lib/datosNegocio.ts).
INSERT INTO public.configuracion (
  id, razon_social, descripcion, responsable, rfc, direccion, cp, ciudad, telefono, tel_pagare, email
) VALUES (
  1, 'AGROMAR',
  'Semillas, Herbicidas, Insecticidas, Foliares, Fungicidas y Abono.',
  'MAURICIO AGUILAR RAZO',
  'AURM-640315-V77',
  'Av. San José de Jorge López No. 1691, San José de Jorge López, Irapuato, Gto.',
  '36648',
  'Irapuato, Guanajuato',
  '(462) 107-8185',
  '01-(462)-62-2-00-39',
  'agromar_irapuato@hotmail.com'
) ON CONFLICT (id) DO NOTHING;

-- RLS: todos leen (Login muestra branding sin auth); solo admin edita.
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS configuracion_select_todos ON public.configuracion;
CREATE POLICY configuracion_select_todos ON public.configuracion
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS configuracion_update_admin ON public.configuracion;
CREATE POLICY configuracion_update_admin ON public.configuracion
  FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());

GRANT SELECT ON public.configuracion TO anon, authenticated;
GRANT UPDATE ON public.configuracion TO authenticated;
