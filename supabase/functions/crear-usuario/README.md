# Edge Function: `crear-usuario`

Crea usuarios de Supabase Auth (vendedores, visitantes u otros admins) desde el
POS, de forma segura. La creación de usuarios requiere la `service_role` key, que
NUNCA debe exponerse en el navegador; por eso se hace en esta Edge Function (Deno).

## Qué hace

1. Lee el JWT del encabezado `Authorization` del que llama.
2. Crea un cliente Supabase con el **anon key + ese JWT** para identificar al
   usuario y consulta `public.perfiles` para verificar que su `rol = 'admin'`.
   Si no es admin, responde **403**.
3. Con un cliente **service_role**, llama a
   `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, rol } })`.
   El trigger `handle_new_user` crea automáticamente la fila en `public.perfiles`
   (lee `nombre` y `rol` desde `raw_user_meta_data`).
4. Valida el input (`email`, `password >= 6`, `nombre`, `rol ∈ admin|vendedor|visitante`),
   maneja CORS (responde a `OPTIONS`) y devuelve JSON.

## Variables de entorno

El runtime de Edge Functions de Supabase ya inyecta estas por defecto, no hace
falta configurarlas manualmente:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

> Si en algún entorno (p. ej. self-hosted) no estuvieran disponibles, la función
> responde 500 con un mensaje claro. Puedes definirlas como secretos con:
> `supabase secrets set NOMBRE=valor`. No es necesario en Supabase Cloud.

## Desplegar

Desde la raíz del proyecto (donde está la carpeta `supabase/`):

```bash
# Inicia sesión y vincula el proyecto una sola vez (si aún no lo hiciste):
supabase login
supabase link --project-ref vfpupvzqdthrglrtkymt

# Desplegar la función:
supabase functions deploy crear-usuario
```

### Nota sobre verificación de JWT

Esta función valida el JWT manualmente (verifica que el llamante sea admin), así
que es compatible con el comportamiento por defecto de Supabase (la pasarela
valida el JWT antes de ejecutar la función). No despliegues con
`--no-verify-jwt` salvo que sepas lo que haces; el cliente debe enviar siempre un
`Authorization: Bearer <access_token>` válido. `supabase.functions.invoke` lo
hace automáticamente con la sesión activa.

## Probar localmente (opcional)

```bash
supabase functions serve crear-usuario
```

## Ejemplo de invocación desde el frontend

`supabase.functions.invoke` adjunta automáticamente el JWT de la sesión actual en
el encabezado `Authorization`.

```ts
import { supabase } from '../../lib/supabase';

const { data, error } = await supabase.functions.invoke('crear-usuario', {
  body: {
    nombre: 'Juan Pérez',
    email: 'juan@agromar.com',
    password: 'unaContraseñaSegura',
    rol: 'vendedor', // 'admin' | 'vendedor' | 'visitante'
  },
});

if (error) {
  // error.message contiene el detalle (403 si no es admin, 400 si input inválido, etc.)
  console.error(error);
} else {
  console.log(data.message); // "Usuario creado correctamente."
}
```

## Respuestas

| Código | Significado |
| ------ | ----------- |
| 201    | Usuario creado. Cuerpo: `{ message, user: { id, email, nombre, rol } }` |
| 400    | Input inválido o email ya registrado. Cuerpo: `{ error }` |
| 401    | Falta `Authorization` o token inválido |
| 403    | El llamante no es admin |
| 405    | Método distinto de POST |
| 500    | Error de configuración o inesperado |

> Nota sobre `functions.invoke`: cuando la función responde con un código de error
> (4xx/5xx), `error` será un `FunctionsHttpError`. Para leer el mensaje exacto del
> cuerpo puedes hacer `await error.context.json()` según la versión de
> `supabase-js`. El código de `CrearUsuarioModal.tsx` ya contempla este caso.
