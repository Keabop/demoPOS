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
  // Núcleo del guión (firmas nuevas post-escalabilidad/G1-G7)
  fn_registrar_venta_completa: ['p_cliente_id', 'p_vendedor_id', 'p_tipo_pago', 'p_subtotal', 'p_iva', 'p_total', 'p_detalles', 'p_plazo_dias', 'p_ieps', 'p_nivel_precio'],
  fn_registrar_abono: ['p_venta_id', 'p_monto', 'p_metodo', 'p_fecha'],
  fn_cancelar_venta: ['p_venta_id', 'p_motivo'],
  fn_recibir_orden_compra: ['p_orden_id'],
  // Interés (RETURNS TABLE → set-returning, ver SET_RETURNING)
  fn_saldo_nota: ['p_venta_id', 'p_fecha_corte'],
  fn_saldo_cliente: ['p_cliente_id', 'p_fecha_corte'],
  fn_estado_cuenta_cliente: ['p_cliente_id', 'p_fecha_corte'],
  // Devoluciones
  fn_registrar_devolucion: ['p_venta_id', 'p_lineas', 'p_motivo', 'p_metodo_reembolso'],
  // Cartera (excepción/archivado)
  fn_cliente_exentar: ['p_cliente', 'p_exento'],
  fn_cliente_archivar: ['p_cliente'],
  fn_cliente_reactivar: ['p_cliente'],
  // Compras locales / cuentas por pagar (G7)
  fn_registrar_compra_local: ['p_proveedor_id', 'p_folio_proveedor', 'p_metodo_pago', 'p_fecha', 'p_vencimiento', 'p_lineas', 'p_actualizar_precios'],
  fn_registrar_pago_proveedor: ['p_orden_id', 'p_monto', 'p_metodo', 'p_fecha'],
  // Listados/KPIs/dashboard/reportes
  fn_clientes_listado: ['p_busqueda', 'p_filtro', 'p_offset', 'p_limit'],
  fn_creditos_listado: ['p_busqueda', 'p_filtro', 'p_offset', 'p_limit'],
  fn_dashboard: ['p_hoy_inicio'],
  fn_dashboard_serie: ['p_inicio', 'p_modo'],
  fn_reporte_ventas: ['p_start', 'p_end'],
  fn_reporte_cobranza: ['p_start', 'p_end'],
  fn_reporte_inventario: ['p_start', 'p_end'],
  fn_reporte_caja: ['p_start', 'p_end'],
  // Sin args: fn_categorias_productos, fn_siguiente_folio_cotizacion, fn_*_kpis → caen a Object.keys(params)=[]
};
const JSONB_ARGS = new Set(['p_detalles', 'p_lineas']);
// Funciones RETURNS TABLE/SETOF: el front espera un ARREGLO de filas (data[0]).
const SET_RETURNING = new Set(['fn_saldo_nota', 'fn_saldo_cliente']);

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
    if (SET_RETURNING.has(fn)) {
      // RETURNS TABLE/SETOF: devolver todas las filas como arreglo (el front hace data[0]).
      const res = await db.query<Record<string, unknown>>(`SELECT * FROM public.${fn}(${args.join(', ')})`);
      emitChange('*');
      return { data: res.rows as unknown, error: null, count: null };
    }
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
    if (name === 'cambiar-password') {
      // Reseteo de contraseña (admin): no-op exitoso en la demo (no hay auth real).
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
