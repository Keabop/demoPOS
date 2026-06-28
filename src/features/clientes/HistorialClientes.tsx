import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Cliente } from '../../types';
import { Icon } from '../../components/Icon';
import { Topbar } from '../../components/Topbar';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';
import { EstadoCuenta } from './EstadoCuenta';

/**
 * Vista de SOLO LECTURA para el rol visitante: lista de clientes con búsqueda
 * y consulta del estado de cuenta de cada uno (reutiliza EstadoCuenta en modo
 * readOnly). No incluye acciones de escritura (crear, editar, abonar).
 */
export const HistorialClientes: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Cliente | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('clientes')
          .select('*')
          .order('nombre', { ascending: true });
        if (err) throw err;
        if (active) setClientes((data as Cliente[]) || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los clientes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.rancho || '').toLowerCase().includes(q) ||
      (c.telefono || '').includes(q)
    );
  }, [clientes, search]);

  // Cliente seleccionado → su estado de cuenta en solo-lectura.
  if (selected) {
    return (
      <EstadoCuenta
        cliente={selected}
        onBack={() => setSelected(null)}
        onOpenAbono={() => { /* no-op: el visitante no registra abonos */ }}
        readOnly
      />
    );
  }

  return (
    <>
      <Topbar title="Historial de Clientes" subtitle="Consulta de estados de cuenta" />
      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="search" size={18} style={{ color: 'var(--muted)', flex: 'none' }} />
          <input
            className="input"
            style={{ border: 0, background: 'transparent', padding: 0, height: 24 }}
            placeholder="Buscar por nombre, rancho o teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Cargando clientes…</div>
        )}

        {error && (
          <div className="card" style={{ padding: 24, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={16} color="var(--red)" /> {error}
          </div>
        )}

        {!loading && !error && filtrados.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            {clientes.length === 0 ? 'No hay clientes registrados.' : 'Sin resultados para tu búsqueda.'}
          </div>
        )}

        {!loading && !error && filtrados.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
            {filtrados.map(c => {
              const saldo = round2(Number(c.saldo_deudor) || 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className="card"
                  style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                      {c.rancho && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.rancho}</div>}
                    </div>
                    <span className={`badge ${saldo > 0 ? 'amber' : 'ok'}`} style={{ flex: 'none' }}>
                      {saldo > 0 ? 'Con saldo' : 'Al día'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {c.telefono ? (<><Icon name="phone" size={12} /> {c.telefono}</>) : 'Sin teléfono'}
                    </span>
                    <span className="num" style={{ fontWeight: 800, fontSize: 15, color: saldo > 0 ? 'oklch(0.52 0.13 75)' : 'var(--ok-2)' }}>{fmtMXN(saldo)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-2)', fontSize: 13, fontWeight: 600, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
                    <Icon name="file" size={14} /> Ver estado de cuenta
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
