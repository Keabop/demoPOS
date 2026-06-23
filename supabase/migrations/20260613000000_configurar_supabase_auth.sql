-- 1. Habilitar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Limpiar perfiles temporales de maqueta
DELETE FROM public.perfiles WHERE id IN (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003'
);

-- 3. Crear función de sincronización auth.users -> public.perfiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'vendedor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Crear el disparador en auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Insertar los tres usuarios iniciales directamente en auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at,
  confirmation_token, email_change_token_new, email_change, recovery_token,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) VALUES 
-- Administrador (admin@agromar.com / adminAgromar)
(
  '00000000-0000-0000-0000-000000000000',
  'e0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 
  'admin@agromar.com', crypt('adminAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Admin Agromar","rol":"admin"}', now(), now(),
  '', '', '', '', '', '', '', ''
),
-- Vendedor (vendedor@agromar.com / vendedorAgromar)
(
  '00000000-0000-0000-0000-000000000000',
  'e0000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 
  'vendedor@agromar.com', crypt('vendedorAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Vendedor Agromar","rol":"vendedor"}', now(), now(),
  '', '', '', '', '', '', '', ''
),
-- Visitante (visitante@agromar.com / visitanteAgromar)
(
  '00000000-0000-0000-0000-000000000000',
  'e0000000-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 
  'visitante@agromar.com', crypt('visitanteAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Visitante Agromar","rol":"visitante"}', now(), now(),
  '', '', '', '', '', '', '', ''
);


-- 6. Añadir la llave foránea fk_perfiles_users apuntando a auth.users(id)
ALTER TABLE public.perfiles 
  ADD CONSTRAINT fk_perfiles_users 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
