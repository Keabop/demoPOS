import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import type { OrdenCompra } from '../../types';
import { CompraLocalModal } from './CompraLocalModal';
import { PagoProveedorModal } from './PagoProveedorModal';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { Paginator } from '../../components/Paginator';

interface CompraLocalRow extends OrdenCompra {
  proveedor_nombre: string | null;
}

interface LocalesKpis { comprado: number; por_pagar: number; n: number }

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

export const ComprasLocalesTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [pagoRow, setPagoRow] = useState<CompraLocalRow | null>(null);
  const [kpis, setKpis] = useState<LocalesKpis>({ comprado: 0, por_pagar: 0, n: 0 });

  const cargarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('fn_compras_locales_kpis');
    if (data) setKpis(data as LocalesKpis);
  }, []);

  const { data: compras, count, page, loading, error, setPage, refetch } = useSupabasePaginated<CompraLocalRow>(
    (from, to) => {
      let q = supabase
        .from('vw_ordenes_compra')
        .select('*', { count: 'exact' })
        .eq('tipo', 'local')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      const s = sanitizar(search);
      if (s) q = q.or(`folio.ilike.%${s}%,folio_proveedor.ilike.%${s}%,proveedor_nombre.ilike.%${s}%`);
      return q;
    },
    [search],
    PAGE_SIZE,
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarKpis(); }, [cargarKpis]);
  const recargar = useCallback(() => { refetch(); cargarKpis(); }, [refetch, cargarKpis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Compras locales</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{kpis.n}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Total comprado</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: 'var(--green-2)' }}>{fmtMXN(kpis.comprado)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Por pagar a proveedores</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: kpis.por_pagar > 0 ? 'var(--red)' : 'var(--ink)' }}>{fmtMXN(kpis.por_pagar)}</div>
        </div>
      </div>

      {/* Buscador + nueva */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <Icon name="search" size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por folio, folio del comercio o proveedor…"
            style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }} />
        </div>
        <button className="btn btn-primary" style={{ flex: 'none' }} onClick={() => setNuevaOpen(true)}>
          <Icon name="plus" size={16} />Nueva compra local
        </button>
      </div>

      {/* Lista */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando compras...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>No se pudieron cargar las compras.</div>
        ) : compras.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {search ? 'No hay compras que coincidan.' : 'Aún no hay compras locales. Registra la primera con "Nueva compra local".'}
          </div>
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {compras.map((c, i) => {
                const esCredito = c.metodo_pago === 'credito';
                const saldo = Number(c.saldo_proveedor || 0);
                const pagada = esCredito && saldo <= 0;
                return (
                  <li key={c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{c.folio}</span>
                        {c.folio_proveedor && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· doc {c.folio_proveedor}</span>}
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: esCredito ? 'var(--amber-soft)' : 'var(--green-soft, oklch(0.95 0.04 145))', color: esCredito ? 'oklch(0.5 0.12 70)' : 'var(--green-2)' }}>
                          {esCredito ? (pagada ? 'Crédito · pagada' : 'Crédito') : 'Contado'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.proveedor_nombre ?? '—'}{c.fecha ? ` · ${new Date(c.fecha).toLocaleDateString('es-MX')}` : ''}
                        {esCredito && !pagada ? ` · por pagar ${fmtMXN(saldo)}` : ''}
                      </div>
                    </div>
                    <div className="num" style={{ flex: 'none', fontWeight: 700, fontSize: 14 }}>{fmtMXN(c.total)}</div>
                    {esCredito && !pagada && (
                      <button className="btn btn-secondary" style={{ flex: 'none', height: 34, padding: '0 12px', fontSize: 13 }} onClick={() => setPagoRow(c)}>
                        Registrar pago
                      </button>
                    )}
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

      <CompraLocalModal isOpen={nuevaOpen} onClose={() => setNuevaOpen(false)}
        onSaved={() => { setNuevaOpen(false); recargar(); }} />
      <PagoProveedorModal isOpen={pagoRow !== null} ordenId={pagoRow?.id ?? null}
        folio={pagoRow?.folio} proveedorNombre={pagoRow?.proveedor_nombre ?? undefined}
        saldo={Number(pagoRow?.saldo_proveedor || 0)}
        onClose={() => setPagoRow(null)} onSaved={() => { setPagoRow(null); recargar(); }} />
    </div>
  );
};
