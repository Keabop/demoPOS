// src/lib/demo/client.ts
// Ensambla el objeto `supabase` del shim: from/rpc/auth/storage/channel.
import { from } from './queryBuilder';
import { auth } from './auth';
import { storage } from './storage';
import { channel, removeChannel, emitChange } from './realtime';
import { getDB } from './db';
import { lit } from './postgrest';
import type { PostgrestResult } from './types';

// Orden posicional de los argumentos de cada RPC (firmas del snapshot §5).
const RPC_ARGS: Record<string, string[]> = {
  fn_registrar_venta_completa: ['p_folio', 'p_cliente_id', 'p_vendedor_id', 'p_tipo_pago', 'p_subtotal', 'p_iva', 'p_total', 'p_detalles', 'p_plazo_dias'],
  fn_registrar_abono: ['p_venta_id', 'p_monto', 'p_metodo'],
  fn_cancelar_venta: ['p_venta_id', 'p_motivo'],
  fn_recibir_orden_compra: ['p_orden_id'],
};
const JSONB_ARGS = new Set(['p_detalles']);

async function rpc(fn: string, params: Record<string, unknown> = {}): Promise<PostgrestResult> {
  const db = await getDB();
  try {
    const order = RPC_ARGS[fn] ?? Object.keys(params);
    // Tomar args hasta el último provisto (respeta defaults: p_plazo_dias, p_motivo).
    const present = order.filter((k) => k in params);
    const args = present.map((k) => {
      if (JSONB_ARGS.has(k)) return `${lit(JSON.stringify(params[k]))}::jsonb`;
      return lit(params[k]);
    });
    const res = await db.query<Record<string, unknown>>(`SELECT public.${fn}(${args.join(', ')}) AS r`);
    emitChange('*');
    const r = res.rows[0]?.r ?? null;
    return { data: r as unknown, error: null, count: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null };
  }
}

// Edge Functions: la demo implementa localmente las que usa la gestión de usuarios
// (admin). El resto devuelve un error claro de "no disponible en la demo".
async function invoke(name: string, opts?: { body?: Record<string, unknown> }): Promise<PostgrestResult> {
  const body = opts?.body ?? {};
  const db = await getDB();
  try {
    if (name === 'crear-usuario') {
      await db.query(
        `INSERT INTO perfiles(id,email,nombre,rol,activo)
         VALUES (gen_random_uuid(), ${lit(body.email)}, ${lit(body.nombre)}, ${lit(body.rol)}, true)`);
      emitChange('perfiles');
      return { data: { ok: true }, error: null, count: null };
    }
    if (name === 'eliminar-usuario') {
      // El trigger fn_proteger_ultimo_admin impide borrar al último admin (lanza excepción).
      await db.query(`DELETE FROM perfiles WHERE id = ${lit(body.id)}`);
      emitChange('perfiles');
      return { data: { ok: true }, error: null, count: null };
    }
    return { data: null, error: { message: `Función "${name}" no disponible en la demo.` }, count: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null };
  }
}

const functions = { invoke };

export const supabase = {
  from,
  rpc,
  auth,
  storage,
  channel,
  removeChannel,
  functions,
};
