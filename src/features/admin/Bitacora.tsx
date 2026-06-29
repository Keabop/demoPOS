import React, { useState, useEffect, useCallback } from 'react';
import { Topbar } from '../../components/Topbar';
import { supabase } from '../../lib/supabase';
import { formatFechaHoraMX } from '../../lib/dates';

// Bitácora de auditoría (solo admin: la RLS de audit_log exige es_admin()).
// Lista los eventos registrados por el trigger fn_audit() en las tablas de negocio.

const PAGE_SIZE = 50;

const TABLAS = [
  'clientes', 'configuracion', 'devoluciones', 'devoluciones_detalles', 'lotes',
  'movimientos_caja', 'movimientos_inventario', 'ordenes_compra', 'ordenes_compra_detalles',
  'pagos_credito', 'pagos_proveedor', 'perfiles', 'productos', 'proveedor_productos',
  'proveedores', 'ventas', 'ventas_detalles',
];

const OP_LABEL: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Cambio', DELETE: 'Baja' };

interface AuditRow {
  id: number;
  ocurrido_en: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  tabla: string;
  operacion: string;
  registro_id: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontWeight: 600, fontSize: 12, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid var(--line-2)', verticalAlign: 'top' };
const preStyle: React.CSSProperties = { margin: 0, padding: 8, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 6, fontSize: 11, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

function opBadge(op: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    INSERT: ['var(--green-soft)', 'var(--green-2)'],
    UPDATE: ['var(--amber-soft)', 'oklch(0.52 0.13 75)'],
    DELETE: ['var(--red-soft)', 'var(--red)'],
  };
  const [bg, color] = map[op] ?? ['var(--surface-2)', 'var(--ink-2)'];
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color };
}

export const Bitacora: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabla, setTabla] = useState('todos');
  const [operacion, setOperacion] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('audit_log').select('*', { count: 'exact' });
      if (tabla !== 'todos') q = q.eq('tabla', tabla);
      if (operacion !== 'todos') q = q.eq('operacion', operacion);
      const s = busqueda.trim();
      if (s) q = q.ilike('usuario_nombre', `%${s}%`);
      q = q
        .order('ocurrido_en', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, count, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
      setTotal(count ?? 0);
    } catch (err) {
      console.error('Error cargando la bitácora:', err);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tabla, operacion, busqueda, page]);

  useEffect(() => { cargar(); }, [cargar]);
  // Reinicia a la primera página al cambiar un filtro.
  useEffect(() => { setPage(0); }, [tabla, operacion, busqueda]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Topbar title="Bitácora de auditoría" subtitle="Registro de cambios del sistema (solo administrador)" />
      <div style={{ padding: 16 }}>
        <div data-tour="aud-filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select className="input" value={tabla} onChange={(e) => setTabla(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="todos">Todas las tablas</option>
            {TABLAS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input" data-tour="aud-operacion" value={operacion} onChange={(e) => setOperacion(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="todos">Toda operación</option>
            <option value="INSERT">Alta</option>
            <option value="UPDATE">Cambio</option>
            <option value="DELETE">Baja</option>
          </select>
          <input className="input" placeholder="Buscar por usuario…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ maxWidth: 240 }} />
          <button className="btn" onClick={() => cargar()} disabled={loading} style={{ marginLeft: 'auto' }}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={thStyle}>Fecha / hora</th>
                <th style={thStyle}>Usuario</th>
                <th style={thStyle}>Tabla</th>
                <th style={thStyle}>Operación</th>
                <th style={thStyle}>Registro</th>
                <th style={thStyle}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td style={tdStyle}>{formatFechaHoraMX(r.ocurrido_en)}</td>
                    <td style={tdStyle}>{r.usuario_nombre ?? (r.usuario_id ? '—' : 'sistema')}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.tabla}</td>
                    <td style={tdStyle}><span style={opBadge(r.operacion)}>{OP_LABEL[r.operacion] ?? r.operacion}</span></td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.registro_id ?? '—'}</td>
                    <td style={tdStyle}>
                      <button className="btn-ghost" data-tour={index === 0 ? 'aud-detalle' : undefined} style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                        {expandedId === r.id ? 'Ocultar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, background: 'var(--surface-2)', borderBottom: '1px solid var(--line-2)' }}>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: 'var(--ink-2)' }}>Antes</div>
                            <pre style={preStyle}>{r.datos_antes ? JSON.stringify(r.datos_antes, null, 2) : '—'}</pre>
                          </div>
                          <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: 'var(--ink-2)' }}>Después</div>
                            <pre style={preStyle}>{r.datos_despues ? JSON.stringify(r.datos_despues, null, 2) : '—'}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2)' }}>Sin registros en la bitácora.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{total} registro(s)</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</button>
            <span style={{ fontSize: 12 }}>Página {page + 1} de {totalPages}</span>
            <button className="btn" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
        </div>
      </div>
    </>
  );
};
