import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import type { OrdenCompra, EstadoOrden } from '../../types';
import { NuevaOrdenModal } from './NuevaOrdenModal';
import { OrdenDetalleModal } from './OrdenDetalleModal';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { Paginator } from '../../components/Paginator';

interface OrdenRow extends OrdenCompra {
  proveedor_nombre: string | null;
}

interface OrdenesKpis { total: number; pendientes: number; comprado: number }

const ESTADO_BADGE: Record<EstadoOrden, { bg: string; fg: string; label: string }> = {
  borrador: { bg: 'var(--surface-2)', fg: 'var(--ink-2)', label: 'Borrador' },
  enviada: { bg: 'var(--amber-soft)', fg: 'oklch(0.5 0.12 70)', label: 'Enviada' },
  recibida: { bg: 'var(--green-soft, oklch(0.95 0.04 145))', fg: 'var(--green-2)', label: 'Recibida' },
  cancelada: { bg: 'var(--red-soft)', fg: 'var(--red)', label: 'Cancelada' },
};

type Filtro = 'todos' | EstadoOrden;

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

interface OrdenesTabProps {
  vendedorId: string;
}

export const OrdenesTab: React.FC<OrdenesTabProps> = ({ vendedorId }) => {
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<OrdenesKpis>({ total: 0, pendientes: 0, comprado: 0 });

  const cargarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('fn_ordenes_kpis');
    if (data) setKpis(data as OrdenesKpis);
  }, []);

  const { data: ordenes, count, page, loading, error, setPage, refetch } = useSupabasePaginated<OrdenRow>(
    (from, to) => {
      let q = supabase
        .from('vw_ordenes_compra')
        .select('*', { count: 'exact' })
        .order('fecha', { ascending: false })
        .order('id', { ascending: false }) // desempate único para una paginación estable
        .range(from, to);
      q = q.eq('tipo', 'formal');
      if (filtro !== 'todos') q = q.eq('estado', filtro);
      const s = sanitizar(search);
      if (s) q = q.or(`folio.ilike.%${s}%,proveedor_nombre.ilike.%${s}%`);
      return q;
    },
    [search, filtro],
    PAGE_SIZE,
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarKpis(); }, [cargarKpis]);
  const recargar = useCallback(() => { refetch(); cargarKpis(); }, [refetch, cargarKpis]);

  const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todas' },
    { id: 'borrador', label: 'Borrador' },
    { id: 'enviada', label: 'Enviadas' },
    { id: 'recibida', label: 'Recibidas' },
    { id: 'cancelada', label: 'Canceladas' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Órdenes totales</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{kpis.total}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Pendientes</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{kpis.pendientes}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Total comprado (recibido)</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: 'var(--green-2)' }}>{fmtMXN(kpis.comprado)}</div>
        </div>
      </div>

      {/* Buscador + filtros + nueva */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <Icon name="search" size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por folio o proveedor…"
            style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }} />
        </div>
        <button className="btn btn-primary" data-tour="ordenes-nueva" style={{ flex: 'none' }} onClick={() => setNuevaOpen(true)}>
          <Icon name="plus" size={16} />Nueva orden
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)', alignSelf: 'flex-start' }}>
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 0, cursor: 'pointer', background: filtro === f.id ? 'var(--surface)' : 'transparent', color: filtro === f.id ? 'var(--ink)' : 'var(--muted)', boxShadow: filtro === f.id ? 'var(--shadow-sm)' : 'none' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando órdenes...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>No se pudieron cargar las órdenes.</div>
        ) : ordenes.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {search || filtro !== 'todos' ? 'No hay órdenes que coincidan.' : 'Aún no hay órdenes de compra.'}
          </div>
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {ordenes.map((o, i) => {
                const badge = ESTADO_BADGE[o.estado];
                return (
                  <li key={o.id} onClick={() => setDetalleId(o.id)} data-tour={i === 0 ? 'ordenes-fila' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)', cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{o.folio}</span>
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {o.proveedor_nombre ?? '—'}{o.fecha ? ` · ${new Date(o.fecha).toLocaleDateString('es-MX')}` : ''}
                      </div>
                    </div>
                    <div className="num" style={{ flex: 'none', fontWeight: 700, fontSize: 14 }}>{fmtMXN(o.total)}</div>
                    <Icon name="chevron-right" size={16} color="var(--muted-2)" />
                  </li>
                );
              })}
            </ul>
            <div style={{ padding: '0 16px' }}>
              <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <NuevaOrdenModal isOpen={nuevaOpen} vendedorId={vendedorId} onClose={() => setNuevaOpen(false)}
        onSaved={() => { setNuevaOpen(false); recargar(); }} />
      <OrdenDetalleModal isOpen={detalleId !== null} ordenId={detalleId} onClose={() => setDetalleId(null)}
        onChanged={recargar} />
    </div>
  );
};
