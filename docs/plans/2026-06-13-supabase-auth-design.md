# Diseño de Integración: Supabase Auth y Control de Acceso

**Fecha:** 13 de junio de 2026  
**Proyecto:** POS AGROMAR  
**Módulo:** Autenticación Real y Gestión de Perfiles (Supabase Auth)

---

## 1. Resumen
Este documento detalla el plan de diseño para migrar el sistema de autenticación ficticio actual a una integración real con **Supabase Auth**. Además de validar credenciales, se introduce un mecanismo automatizado en la base de datos para sincronizar los usuarios autenticados con la tabla de `public.perfiles` y un contexto global en React (`AuthContext`) para manejar el estado de sesión y permisos a lo largo del frontend.

---

## 2. Arquitectura de Base de Datos

### 2.1 Trigger de Sincronización
Para mantener `public.perfiles` sincronizada con los usuarios registrados en Supabase Auth, se implementará una función y un trigger en el esquema de Postgres. Esta función leerá los campos `nombre` y `rol` pasados en los metadatos de usuario (`raw_user_meta_data`) al momento del registro.

```sql
-- Función de sincronización
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

-- Trigger
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2.2 Integración de Llave Foránea
Para robustecer la integridad relacional de la base de datos, agregaremos la restricción de llave foránea en `public.perfiles` apuntando a `auth.users(id)` con eliminación en cascada.

```sql
ALTER TABLE public.perfiles 
  ADD CONSTRAINT fk_perfiles_users 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

### 2.3 Semilla (Seed) de Usuarios en Desarrollo
Se creará un script de base de datos que removerá los perfiles ficticios antiguos e insertará los tres nuevos usuarios reales con contraseñas encriptadas mediante `pgcrypto`:

* **Admin:** `admin@agromar.com` / Contraseña: `adminAgromar`
* **Vendedor:** `vendedor@agromar.com` / Contraseña: `vendedorAgromar`
* **Visitante:** `visitante@agromar.com` / Contraseña: `visitanteAgromar`

---

## 3. Frontend Architecture (React)

### 3.1 AuthContext y useAuth Hook
Se creará un React Context (`src/features/auth/AuthContext.tsx`) que centralizará:
* `user`: Objeto `User` del SDK de Supabase.
* `profile`: Datos del perfil del usuario (`id`, `nombre`, `rol`) recuperados de `public.perfiles`.
* `loading`: Estado de carga durante la verificación de sesión inicial.
* `login(email, password)`: Función asíncrona para iniciar sesión.
* `logout()`: Función asíncrona para cerrar sesión.

El estado se sincronizará automáticamente mediante un listener a `supabase.auth.onAuthStateChange()`.

### 3.2 Actualización del Componente `Login.tsx`
* Los botones rápidos completarán automáticamente las credenciales reales (`admin@agromar.com`, etc.) según el rol seleccionado.
* Al hacer click en "Entrar al sistema", llamará a `login` del contexto de autenticación.
* Manejará y mostrará errores amigables si el login falla.
* Deshabilitará el botón y mostrará "Cargando..." durante la llamada de API.

### 3.3 Flujo de Enrutamiento en `App.tsx`
* Envolveremos toda la aplicación en el `<AuthProvider>`.
* Si `loading` está activo, renderizaremos una pantalla de transición con logo y mensaje.
* Si el usuario no está autenticado (`profile === null`), renderizaremos `<Login />`.
* Al detectar el perfil, redirigiremos al usuario a su pantalla por defecto basada en su rol:
  * `admin` -> `/dashboard`
  * `vendedor` -> `/pos`
  * `visitante` -> `/precios` (Catálogo en modo lectura)

---

## 4. Plan de Pruebas y Criterios de Aceptación
1. **Persistencia:** Si el usuario refresca la página o cierra la pestaña del navegador, la sesión debe mantenerse activa y cargar directamente la última pantalla sin requerir login.
2. **Validación de Roles:**
   * Un usuario con rol `vendedor` no debe tener acceso al Dashboard en el menú lateral ni poder navegar a él.
   * Un usuario con rol `visitante` debe tener bloqueado el carrito del POS y solo poder ver la lista de precios.
3. **Cierre de Sesión:** Hacer clic en "Cerrar sesión" en el Sidebar debe destruir el token de Supabase en LocalStorage y devolver al usuario de inmediato a `/login`.
4. **Manejo de Errores:** Ingresar credenciales inválidas debe mostrar un cartel de error y no permitir el ingreso al sistema.
