// Edge Function: crear-usuario
//
// Permite que un usuario con rol 'admin' (verificado contra public.perfiles)
// cree nuevos usuarios de Supabase Auth de forma segura desde el POS.
//
// IMPORTANTE: nunca expongas SUPABASE_SERVICE_ROLE_KEY en el navegador. Esta
// función corre en el runtime de Edge Functions de Supabase (Deno), donde esa
// llave está disponible como variable de entorno y nunca llega al cliente.
//
// El trigger `handle_new_user` (ver migración 20260613000000_configurar_supabase_auth.sql)
// crea automáticamente la fila en public.perfiles a partir de user_metadata.nombre / rol.
//
// Guía de configuración del Deno language server para autocompletado:
// https://deno.land/manual/getting_started/setup_your_environment

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Roles válidos para un perfil del POS.
const ROLES_VALIDOS = ['admin', 'vendedor', 'visitante'] as const;
type RolValido = (typeof ROLES_VALIDOS)[number];

// Política de contraseña: debe coincidir con CrearUsuarioModal.tsx y con la
// política configurada en Supabase Auth (mín 8, mayúscula, minúscula y dígito).
function passwordCumple(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}

// Cabeceras CORS para poder invocar la función desde el navegador.
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Forma esperada del cuerpo de la petición.
interface CrearUsuarioBody {
  email?: unknown;
  password?: unknown;
  nombre?: unknown;
  rol?: unknown;
}

// Respuesta JSON helper, siempre con cabeceras CORS.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Validación de email sencilla (no exhaustiva, solo formato razonable).
function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. Responder al preflight CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido. Usa POST.' }, 405);
  }

  try {
    // 2. Leer variables de entorno del runtime de Edge Functions.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(
        {
          error:
            'Configuración del servidor incompleta. Faltan variables de entorno.',
        },
        500,
      );
    }

    // 3. Verificar que venga el JWT del que llama.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Falta el encabezado Authorization.' }, 401);
    }

    // 4. Cliente con el contexto del usuario que llama (anon key + su JWT).
    //    Sirve para identificar al usuario y verificar su rol vía RLS.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseCaller.auth.getUser(token);

    if (callerError || !caller) {
      return json({ error: 'No autenticado o token inválido.' }, 401);
    }

    // 5. Verificar que el perfil del que llama tenga rol 'admin' y esté activo.
    const { data: perfilCaller, error: perfilError } = await supabaseCaller
      .from('perfiles')
      .select('rol, activo')
      .eq('id', caller.id)
      .single();

    if (perfilError || !perfilCaller) {
      return json(
        { error: 'No se pudo verificar el perfil del usuario.' },
        403,
      );
    }

    // Un admin desactivado (soft-delete) no debe poder operar aunque su JWT siga vigente.
    if (perfilCaller.activo === false) {
      return json(
        { error: 'Tu cuenta está desactivada. No tienes acceso.' },
        403,
      );
    }

    if (perfilCaller.rol !== 'admin') {
      return json(
        { error: 'Acceso denegado. Solo un administrador puede crear usuarios.' },
        403,
      );
    }

    // 6. Parsear y validar el cuerpo.
    let body: CrearUsuarioBody;
    try {
      body = (await req.json()) as CrearUsuarioBody;
    } catch {
      return json({ error: 'Cuerpo de la petición inválido (JSON esperado).' }, 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const rol = typeof body.rol === 'string' ? body.rol.trim() : '';

    if (!nombre) {
      return json({ error: 'El nombre es obligatorio.' }, 400);
    }
    if (!email || !esEmailValido(email)) {
      return json({ error: 'El email no es válido.' }, 400);
    }
    if (!passwordCumple(password)) {
      return json(
        {
          error:
            'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y un número.',
        },
        400,
      );
    }
    if (!ROLES_VALIDOS.includes(rol as RolValido)) {
      return json(
        {
          error: `Rol inválido. Debe ser uno de: ${ROLES_VALIDOS.join(', ')}.`,
        },
        400,
      );
    }

    // 7. Cliente admin (service_role) para crear el usuario en auth.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol },
      });

    if (createError) {
      // Errores comunes: email ya registrado, password débil, etc.
      return json({ error: createError.message }, 400);
    }

    // El trigger handle_new_user crea la fila en public.perfiles automáticamente.
    return json(
      {
        message: 'Usuario creado correctamente.',
        user: {
          id: created.user?.id ?? null,
          email: created.user?.email ?? null,
          nombre,
          rol,
        },
      },
      201,
    );
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : 'Error inesperado en el servidor.';
    return json({ error: mensaje }, 500);
  }
});
