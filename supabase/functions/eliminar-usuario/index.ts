// Edge Function: eliminar-usuario
//
// Permite que un usuario con rol 'admin' (verificado contra public.perfiles)
// elimine usuarios de Supabase Auth de forma segura desde el POS.
//
// Eliminar un usuario de auth.users borra en cascada su fila en public.perfiles
// (FK ON DELETE CASCADE). Sin embargo, si el usuario tiene ventas o movimientos
// de caja, las FK ON DELETE RESTRICT bloquearán el borrado para conservar el
// historial; en ese caso se devuelve un mensaje claro.
//
// IMPORTANTE: nunca expongas SUPABASE_SERVICE_ROLE_KEY en el navegador.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido. Usa POST.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(
        { error: 'Configuración del servidor incompleta. Faltan variables de entorno.' },
        500,
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Falta el encabezado Authorization.' }, 401);
    }

    // Cliente con el contexto del que llama, para identificarlo y verificar su rol.
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

    const { data: perfilCaller, error: perfilError } = await supabaseCaller
      .from('perfiles')
      .select('rol, activo')
      .eq('id', caller.id)
      .single();

    if (perfilError || !perfilCaller) {
      return json({ error: 'No se pudo verificar el perfil del usuario.' }, 403);
    }

    // Un admin desactivado (soft-delete) no debe poder operar aunque su JWT siga vigente.
    if (perfilCaller.activo === false) {
      return json({ error: 'Tu cuenta está desactivada. No tienes acceso.' }, 403);
    }

    if (perfilCaller.rol !== 'admin') {
      return json(
        { error: 'Acceso denegado. Solo un administrador puede eliminar usuarios.' },
        403,
      );
    }

    // Parsear y validar el cuerpo.
    let body: { id?: unknown };
    try {
      body = (await req.json()) as { id?: unknown };
    } catch {
      return json({ error: 'Cuerpo de la petición inválido (JSON esperado).' }, 400);
    }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return json({ error: 'Falta el id del usuario a eliminar.' }, 400);
    }

    // Guardia: el admin no puede eliminar su propia cuenta (evita auto-bloqueo).
    if (id === caller.id) {
      return json({ error: 'No puedes eliminar tu propia cuenta.' }, 400);
    }

    // Eliminar con service_role. Borra auth.users → cascada a perfiles.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteError) {
      // Causa típica: FK ON DELETE RESTRICT (el usuario tiene ventas/movimientos).
      const msg = deleteError.message ?? '';
      const esFk =
        msg.toLowerCase().includes('foreign key') ||
        msg.toLowerCase().includes('violates') ||
        msg.toLowerCase().includes('restrict');
      return json(
        {
          error: esFk
            ? 'No se puede eliminar: el usuario tiene ventas o movimientos registrados. Se conserva para no perder el historial.'
            : `No se pudo eliminar el usuario: ${msg}`,
        },
        400,
      );
    }

    return json({ message: 'Usuario eliminado correctamente.' }, 200);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error inesperado en el servidor.';
    return json({ error: mensaje }, 500);
  }
});
