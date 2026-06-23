-- Storage para el logo de la empresa (subida desde el dispositivo del admin).
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública del logo (la app lo muestra sin auth en Login).
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'branding');

-- Subir/editar/borrar: solo admin.
DROP POLICY IF EXISTS "branding_admin_insert" ON storage.objects;
CREATE POLICY "branding_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding' AND public.es_admin());

DROP POLICY IF EXISTS "branding_admin_update" ON storage.objects;
CREATE POLICY "branding_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'branding' AND public.es_admin())
  WITH CHECK (bucket_id = 'branding' AND public.es_admin());

DROP POLICY IF EXISTS "branding_admin_delete" ON storage.objects;
CREATE POLICY "branding_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'branding' AND public.es_admin());
