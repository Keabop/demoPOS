import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Producto } from '../../types';
import { Icon } from '../../components/Icon';
import { Topbar } from '../../components/Topbar';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';
import { useConfig } from '../config/ConfigContext';
import { useCan } from '../auth/useCan';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { useAlActivar } from '../../hooks/useAlActivar';
import { Paginator } from '../../components/Paginator';

const PAGE_SIZE = 50;

// Sanitiza el texto de búsqueda para usarlo en un filtro .or de PostgREST
// (las comas y paréntesis separan condiciones y romperían la expresión).
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

interface PreciosProps {
  activo?: boolean;
}

export const Precios: React.FC<PreciosProps> = ({ activo }) => {
  const { config } = useConfig();
  const can = useCan();
  const verCostos = can('ver_costos');
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todos');
  const [categories, setCategories] = useState<string[]>(['Todos']);
  const [totalActivos, setTotalActivos] = useState(0);

  // Metadatos (categorías y total de catálogo) que no caben en una página.
  const cargarMeta = useCallback(async () => {
    const [{ data: cats }, { count }] = await Promise.all([
      supabase.rpc('fn_categorias_productos'),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
    ]);
    setCategories(['Todos', ...((cats as string[] | null) ?? [])]);
    setTotalActivos(count ?? 0);
  }, []);

  const { data: productos, count, page, loading, setPage, refetch } = useSupabasePaginated<Producto>(
    (from, to) => {
      let q = supabase
        .from('productos')
        .select('*', { count: 'exact' })
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .order('id', { ascending: true }) // desempate único: hay productos con el mismo nombre
        .range(from, to);
      if (selectedCat !== 'Todos') q = q.eq('categoria', selectedCat);
      const s = sanitizar(search);
      if (s) q = q.or(`nombre.ilike.%${s}%,sku.ilike.%${s}%`);
      return q;
    },
    [search, selectedCat],
    PAGE_SIZE,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarMeta();
    // Nota: el catálogo se refresca al regresar a la pantalla vía useAlActivar (abajo),
    // igual que el Catálogo de inventario. En la demo no se suscribe un canal realtime:
    // el bus de tiempo real del shim es global (no filtra por tabla) y, combinado con el
    // refetch del propio canal, mantenía esta lista en "Cargando…" de forma indefinida.
  }, [cargarMeta]);

  // Keep-alive: al regresar a esta pantalla, refresca catálogo y metadatos del servidor.
  useAlActivar(activo ?? true, () => { cargarMeta(); refetch(); });

  return (
    <>
      <Topbar
        title="Lista de Precios"
        subtitle={loading ? 'Cargando catálogo...' : `${count.toLocaleString('es-MX')} productos en consulta`}
      >
        <button className="btn btn-secondary" onClick={refetch} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
      </Topbar>

      <div className="content">
        <div className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            {/* Buscador */}
            <div
              data-tour="precios-buscar"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 14px',
                height: 44,
                background: 'var(--surface-2)',
                borderRadius: 10,
                border: '1px solid var(--line)',
              }}
            >
              <Icon name="search" size={18} color="var(--muted)" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar insumo por nombre o SKU..."
                style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none', color: 'var(--ink)' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer', padding: 4 }}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>

            {/* Total Badge */}
            <div
              style={{
                padding: '0 16px',
                height: 44,
                borderRadius: 10,
                background: 'var(--green-soft)',
                border: '1px solid var(--green-line)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--green-2)',
              }}
            >
              <Icon name="package" size={16} />
              <span>{totalActivos.toLocaleString('es-MX')} Productos Totales</span>
            </div>
          </div>

          {/* Filtros de Categoría */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setSelectedCat(c)}
                style={{
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 999,
                  background: selectedCat === c ? 'var(--ink)' : 'var(--surface-2)',
                  color: selectedCat === c ? '#fff' : 'var(--ink-2)',
                  border: `1px solid ${selectedCat === c ? 'var(--ink)' : 'var(--line)'}`,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla de Resultados */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Cargando productos de {config.nombre}...
            </div>
          ) : productos.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Ningún producto coincide con la búsqueda.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                <thead data-tour="precios-niveles">
                  <tr
                    style={{
                      color: 'var(--muted)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600 }}>Producto</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>SKU</th>
                    <th style={{ textAlign: 'left', padding: '12px 12px', fontWeight: 600, width: 140 }}>Disponibilidad</th>
                    {verCostos && <th style={{ textAlign: 'right', padding: '12px 12px', fontWeight: 600 }}>Costo</th>}
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontWeight: 600 }}>Contado</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontWeight: 600 }}>Crédito</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontWeight: 600 }}>Subdistribuidor</th>
                    <th data-tour="precios-ieps" style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>IEPS</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => {
                    const stockVal = p.stock || 0;
                    return (
                      <tr
                        key={p.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                        style={{ borderBottom: '1px solid var(--line-2)', transition: 'background 0.1s ease' }}
                      >
                        {/* Producto Info */}
                        <td style={{ padding: '12px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                background: `repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--line-2) 4px 8px)`,
                                border: '1px solid var(--line)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'var(--muted)',
                                flex: 'none',
                              }}
                            >
                              {p.nombre.substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.nombre}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                {p.unidad} · {p.categoria}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* SKU */}
                        <td style={{ padding: '12px 8px' }} className="mono">
                          {p.sku}
                        </td>

                        {/* Disponibilidad */}
                        <td style={{ padding: '12px 12px' }}>
                          <span
                            className={`badge ${stockVal > 0 ? 'green' : 'red'}`}
                            style={{ height: 20, fontSize: 10, padding: '0 8px', display: 'inline-flex', alignItems: 'center', fontWeight: 600 }}
                          >
                            {stockVal > 0 ? 'Disponible' : 'Agotado'}
                          </span>
                        </td>

                        {/* Costo (solo con capacidad ver_costos) */}
                        {verCostos && (
                          <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }} className="num">
                            {fmtMXN(Number(p.costo) || 0)}
                          </td>
                        )}

                        {/* Contado */}
                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700 }} className="num">
                          {fmtMXN(p.precio_publico)}
                        </td>

                        {/* Crédito */}
                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 600 }} className="num">
                          {fmtMXN(p.precio_credito ?? p.precio_publico)}
                        </td>

                        {/* Subdistribuidor */}
                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--green-2)' }} className="num">
                          {fmtMXN(p.precio_subdistribuidor ?? p.precio_publico)}
                        </td>

                        {/* IEPS */}
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }} className="num">
                          {Number(p.tasa_ieps || 0) > 0 ? `${round2(Number(p.tasa_ieps) * 100)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '0 18px' }}>
                <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
