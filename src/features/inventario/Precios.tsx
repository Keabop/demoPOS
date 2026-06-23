import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Producto } from '../../types';
import { Icon } from '../../components/Icon';
import { Topbar } from '../../components/Topbar';
import { fmtMXN } from '../../lib/format';
import { useConfig } from '../config/ConfigContext';

export const Precios: React.FC = () => {
  const { config } = useConfig();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todos');

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProductos(data || []);
    } catch (err) {
      console.error('Error al cargar precios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();

    // Suscribir a cambios en tiempo real
    const channel = supabase
      .channel('precios-realtime-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        () => {
          cargarDatos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = ['Todos', ...new Set(productos.map(p => p.categoria))];

  const filtered = productos.filter(p =>
    (selectedCat === 'Todos' || p.categoria === selectedCat) &&
    (p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search))
  );


  return (
    <>
      <Topbar
        title="Lista de Precios"
        subtitle={loading ? 'Cargando catálogo...' : `${filtered.length} productos en consulta`}
      >
        <button className="btn btn-secondary" onClick={cargarDatos} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
      </Topbar>

      <div className="content">
        <div className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            {/* Buscador */}
            <div
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
              <span>{productos.length} Productos Totales</span>
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
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Ningún producto coincide con la búsqueda.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                <thead>
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
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontWeight: 600 }}>Precio Público</th>
                    <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>Precio Mayoreo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
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

                        {/* Precio Público */}
                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700 }} className="num">
                          {fmtMXN(p.precio_publico)}
                        </td>

                        {/* Precio Mayoreo */}
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: 600, color: 'var(--green-2)' }} className="num">
                          {fmtMXN(p.precio_mayoreo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
