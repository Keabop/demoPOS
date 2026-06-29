import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import type { Proveedor } from '../../types';
import { NuevoProveedorModal } from './NuevoProveedorModal';
import { ProveedorPerfilModal } from './ProveedorPerfilModal';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { useAlActivar } from '../../hooks/useAlActivar';
import { useNavegacionLista } from '../../hooks/useNavegacionLista';
import { useAtajosPantalla } from '../../hooks/useAtajosPantalla';
import { Paginator } from '../../components/Paginator';
import { fmtMXN } from '../../lib/format';

interface ProveedorRow extends Proveedor { saldo_por_pagar?: number }

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

interface ProveedoresTabProps {
  activo?: boolean;
}

export const ProveedoresTab: React.FC<ProveedoresTabProps> = ({ activo }) => {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);

  const [perfil, setPerfil] = useState<Proveedor | null>(null);
  const [confirmando, setConfirmando] = useState<Proveedor | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: proveedores, count, page, loading, error, setPage, refetch } = useSupabasePaginated<ProveedorRow>(
    (from, to) => {
      let q = supabase
        .from('vw_proveedores_saldo')
        .select('*', { count: 'exact' })
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .order('id', { ascending: true }) // desempate único: puede haber proveedores homónimos
        .range(from, to);
      const s = sanitizar(search);
      if (s) q = q.or(`nombre.ilike.%${s}%,contacto.ilike.%${s}%,telefono.ilike.%${s}%`);
      return q;
    },
    [search],
    PAGE_SIZE,
  );

  // Keep-alive: al volver a esta pestaña, refrescar la lista del servidor sin perder búsqueda/estado.
  useAlActivar(activo ?? true, refetch);

  // Volver al buscador (Escape o ↑ desde la primera tarjeta), acotado a la pantalla activa.
  const enfocarBuscador = () =>
    (document.activeElement?.closest('[data-keepalive]') ?? document)
      .querySelector<HTMLElement>('[data-atajo="buscar"]')?.focus();

  // Navegación por teclado de la rejilla de tarjetas.
  const onListKeyDown = useNavegacionLista(proveedores.length, {
    onActivar: (i) => { const p = proveedores[i]; if (p) setPerfil(p); },
    onEscape: enfocarBuscador,
  });

  // Atajo "n" = nuevo proveedor (solo en la pantalla activa).
  useAtajosPantalla(activo ?? true, { n: () => { setEditando(null); setModalOpen(true); } });

  const handleEliminar = async () => {
    if (!confirmando) return;
    setDeleteLoading(true);
    setDeleteError(null);
    // Intentar borrado físico; si tiene órdenes (FK RESTRICT), hacer soft-delete.
    const { error } = await supabase.from('proveedores').delete().eq('id', confirmando.id);
    if (error) {
      const { error: softError } = await supabase
        .from('proveedores')
        .update({ activo: false })
        .eq('id', confirmando.id);
      if (softError) {
        setDeleteError('No se pudo eliminar el proveedor.');
        setDeleteLoading(false);
        return;
      }
    }
    setDeleteLoading(false);
    setConfirmando(null);
    refetch();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <Icon name="search" size={16} color="var(--muted)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proveedor…"
            data-atajo="buscar"
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('[data-keepalive]') ?? document).querySelector<HTMLElement>('[data-nav-index="0"]')?.focus(); } }}
            style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }} />
        </div>
        <button className="btn btn-primary" style={{ flex: 'none' }} onClick={() => { setEditando(null); setModalOpen(true); }}>
          <Icon name="plus" size={16} />
          Nuevo proveedor
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando proveedores...</div>
      ) : error ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>No se pudieron cargar los proveedores.</div>
      ) : proveedores.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {search ? 'No hay proveedores que coincidan.' : 'Aún no hay proveedores. Crea el primero.'}
        </div>
      ) : (
        <>
          <div onKeyDown={onListKeyDown} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
            {proveedores.map((p, i) => (
              <div key={p.id} className="card" tabIndex={0} data-nav-index={i} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, flex: 'none', background: 'var(--green-soft, oklch(0.95 0.04 145))', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                    {iniciales(p.nombre)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
                      {p.local && (
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--green-soft, oklch(0.95 0.04 145))', color: 'var(--green)' }}>Local</span>
                      )}
                    </div>
                    {p.contacto && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.contacto}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  {p.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="phone" size={12} />{p.telefono}</span>}
                  {p.rfc && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="file" size={12} />{p.rfc}</span>}
                  {Number(p.saldo_por_pagar) > 0 && (
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>Por pagar: {fmtMXN(Number(p.saldo_por_pagar))}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setPerfil(p)}>
                    <Icon name="sack" size={14} />Productos
                  </button>
                  <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
                    onClick={() => { setEditando(p); setModalOpen(true); }}>
                    <Icon name="edit" size={14} />Editar
                  </button>
                  <button
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, background: 'transparent', border: '1px solid oklch(0.85 0.1 25)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                    onClick={() => { setDeleteError(null); setConfirmando(p); }}>
                    <Icon name="trash" size={14} />Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
        </>
      )}

      <NuevoProveedorModal
        isOpen={modalOpen}
        proveedor={editando}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); }}
      />

      <ProveedorPerfilModal
        isOpen={!!perfil}
        proveedor={perfil}
        onClose={() => setPerfil(null)}
      />

      {confirmando && (
        <div onClick={() => !deleteLoading && setConfirmando(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.18))', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: 'var(--red-soft)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trash" size={18} />
              </span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Eliminar proveedor</h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              ¿Eliminar a <strong>{confirmando.nombre}</strong>? Si tiene órdenes registradas se conservará desactivado para no perder el historial.
            </p>
            {deleteError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--red-soft)', border: '1px solid oklch(0.85 0.1 25)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontSize: 13 }}>
                <Icon name="alert" size={16} /><span>{deleteError}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmando(null)} disabled={deleteLoading}>Cancelar</button>
              <button onClick={handleEliminar} disabled={deleteLoading}
                style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: deleteLoading ? 'default' : 'pointer', opacity: deleteLoading ? 0.7 : 1 }}>
                {deleteLoading ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
