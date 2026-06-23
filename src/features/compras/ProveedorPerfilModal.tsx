import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { fmtMXN } from '../../lib/format';
import { generarSku } from '../../lib/folios';
import type { Proveedor } from '../../types';

interface ProveedorPerfilModalProps {
  isOpen: boolean;
  proveedor: Proveedor | null;
  onClose: () => void;
}

interface ProductoProveedor {
  id: string;          // id de proveedor_productos
  producto_id: string;
  nombre: string;
  unidad: string;
  precio_compra: number;
}

interface ProductoCatalogo {
  id: string;
  nombre: string;
  unidad: string;
}

export const ProveedorPerfilModal: React.FC<ProveedorPerfilModalProps> = ({ isOpen, proveedor, onClose }) => {
  const [items, setItems] = useState<ProductoProveedor[]>([]);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edición de precio en línea
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrecio, setEditPrecio] = useState(0);

  // Agregar producto: modo y formularios
  const [addMode, setAddMode] = useState<'none' | 'link' | 'new'>('none');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // vincular existente
  const [linkProductoId, setLinkProductoId] = useState('');
  const [linkPrecio, setLinkPrecio] = useState(0);
  // crear nuevo
  const [npNombre, setNpNombre] = useState('');
  const [npCategoria, setNpCategoria] = useState('');
  const [npUnidad, setNpUnidad] = useState('');
  const [npSku, setNpSku] = useState('');
  const [npCosto, setNpCosto] = useState(0);
  const [npPublico, setNpPublico] = useState(0);
  const [npMayoreo, setNpMayoreo] = useState(0);

  const load = useCallback(async () => {
    if (!proveedor) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e1 } = await supabase
        .from('proveedor_productos')
        .select('id, precio_compra, productos:producto_id ( id, nombre, unidad )')
        .eq('proveedor_id', proveedor.id);
      if (e1) throw e1;
      const lista: ProductoProveedor[] = (data ?? []).map((r) => {
        const prod = (Array.isArray(r.productos) ? r.productos[0] : r.productos) as { id: string; nombre: string; unidad: string } | null;
        return {
          id: r.id as string,
          producto_id: prod?.id ?? '',
          nombre: prod?.nombre ?? '(producto eliminado)',
          unidad: prod?.unidad ?? '',
          precio_compra: Number(r.precio_compra),
        };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      setItems(lista);

      const { data: cat, error: e2 } = await supabase.from('productos').select('id, nombre, unidad').order('nombre');
      if (e2) throw e2;
      setCatalogo((cat as ProductoCatalogo[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los productos del proveedor.');
    } finally {
      setLoading(false);
    }
  }, [proveedor]);

  useEffect(() => {
    if (isOpen && proveedor) {
      setAddMode('none');
      setEditId(null);
      setAddError(null);
      load();
    }
  }, [isOpen, proveedor, load]);

  if (!isOpen || !proveedor) return null;

  const disponibles = catalogo.filter((c) => !items.some((i) => i.producto_id === c.id));

  const limpiarFormularios = () => {
    setLinkProductoId(''); setLinkPrecio(0);
    setNpNombre(''); setNpCategoria(''); setNpUnidad(''); setNpSku('');
    setNpCosto(0); setNpPublico(0); setNpMayoreo(0);
    setAddError(null);
  };

  const vincularExistente = async () => {
    setAddError(null);
    if (!linkProductoId) { setAddError('Selecciona un producto del catálogo.'); return; }
    try {
      setBusy(true);
      const { error: e } = await supabase.from('proveedor_productos').insert({
        proveedor_id: proveedor.id, producto_id: linkProductoId, precio_compra: linkPrecio || 0,
      });
      if (e) throw e;
      limpiarFormularios();
      setAddMode('none');
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'No se pudo vincular el producto.');
    } finally {
      setBusy(false);
    }
  };

  const crearYVincular = async () => {
    setAddError(null);
    if (!npNombre.trim()) { setAddError('El nombre es obligatorio.'); return; }
    if (!npCategoria.trim() || !npUnidad.trim()) { setAddError('Categoría y unidad son obligatorias.'); return; }
    if (npPublico <= 0) { setAddError('El precio público debe ser mayor a 0.'); return; }
    try {
      setBusy(true);
      const sku = npSku.trim() || generarSku();
      const { data: nuevo, error: e1 } = await supabase.from('productos').insert({
        sku,
        nombre: npNombre.trim(),
        categoria: npCategoria.trim(),
        unidad: npUnidad.trim(),
        costo: npCosto || 0,
        precio_publico: npPublico,
        precio_mayoreo: npMayoreo || npPublico,
        tasa_iva: 0,
      }).select('id').single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('proveedor_productos').insert({
        proveedor_id: proveedor.id, producto_id: nuevo.id, precio_compra: npCosto || 0,
      });
      if (e2) throw e2;
      limpiarFormularios();
      setAddMode('none');
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'No se pudo crear el producto.');
    } finally {
      setBusy(false);
    }
  };

  const guardarPrecio = async (item: ProductoProveedor) => {
    try {
      setBusy(true);
      const { error: e } = await supabase.from('proveedor_productos')
        .update({ precio_compra: editPrecio || 0, actualizado_en: new Date().toISOString() })
        .eq('id', item.id);
      if (e) throw e;
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el precio.');
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (item: ProductoProveedor) => {
    try {
      setBusy(true);
      const { error: e } = await supabase.from('proveedor_productos').delete().eq('id', item.id);
      if (e) throw e;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el producto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <style>{`
        .pp-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-lg); width: 100%; max-width: 720px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
        .pp-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line-2); }
        .pp-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .pp-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); }
        .pp-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .pp-mini-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .pp-error { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25); border-radius: var(--radius-sm); color: var(--red); font-size: 13px; }
      `}</style>
      <div className="pp-card" onClick={(e) => e.stopPropagation()}>
        <div className="pp-header">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{proveedor.nombre}</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {[proveedor.contacto, proveedor.telefono, proveedor.rfc].filter(Boolean).join(' · ') || 'Proveedor'}
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={() => !busy && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="pp-body">
          {error && <div className="pp-error"><Icon name="alert" size={16} /><span>{error}</span></div>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="label" style={{ margin: 0 }}>Productos que provee</span>
            {addMode === 'none' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={() => { limpiarFormularios(); setAddMode('link'); }} disabled={busy || disponibles.length === 0}>
                  <Icon name="plus" size={14} />Vincular existente
                </button>
                <button type="button" className="btn btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={() => { limpiarFormularios(); setAddMode('new'); }} disabled={busy}>
                  <Icon name="plus" size={14} />Nuevo producto
                </button>
              </div>
            )}
          </div>

          {addMode === 'link' && (
            <div style={{ border: '1px dashed var(--green)', background: 'var(--green-soft)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Vincular producto del catálogo</div>
              {addError && <div className="pp-error"><Icon name="alert" size={16} /><span>{addError}</span></div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
                <div className="pp-field"><span className="pp-mini-label">Producto</span>
                  <select className="input" value={linkProductoId} onChange={(e) => setLinkProductoId(e.target.value)} disabled={busy}>
                    <option value="">Selecciona…</option>
                    {disponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="pp-field"><span className="pp-mini-label">Precio del proveedor</span>
                  <NumberInput className="input num" value={linkPrecio} onChange={(n) => setLinkPrecio(n)} disabled={busy} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" style={{ height: 34, fontSize: 13 }} onClick={() => setAddMode('none')} disabled={busy}>Cancelar</button>
                <button type="button" className="btn btn-primary" style={{ height: 34, fontSize: 13 }} onClick={vincularExistente} disabled={busy}>{busy ? 'Guardando...' : 'Vincular'}</button>
              </div>
            </div>
          )}

          {addMode === 'new' && (
            <div style={{ border: '1px dashed var(--green)', background: 'var(--green-soft)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Nuevo producto del proveedor</div>
              {addError && <div className="pp-error"><Icon name="alert" size={16} /><span>{addError}</span></div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 10 }}>
                <div className="pp-field"><span className="pp-mini-label">Nombre *</span>
                  <input className="input" value={npNombre} onChange={(e) => setNpNombre(e.target.value)} disabled={busy} placeholder="Ej. Fertilizante triple 17" /></div>
                <div className="pp-field"><span className="pp-mini-label">Categoría *</span>
                  <input className="input" value={npCategoria} onChange={(e) => setNpCategoria(e.target.value)} disabled={busy} placeholder="Ej. Herbicidas" /></div>
                <div className="pp-field"><span className="pp-mini-label">Unidad *</span>
                  <input className="input" value={npUnidad} onChange={(e) => setNpUnidad(e.target.value)} disabled={busy} placeholder="Ej. costal, litro, pieza" /></div>
                <div className="pp-field"><span className="pp-mini-label">SKU (opcional)</span>
                  <input className="input" value={npSku} onChange={(e) => setNpSku(e.target.value)} disabled={busy} placeholder="Se genera solo si lo dejas vacío" /></div>
                <div className="pp-field"><span className="pp-mini-label">Costo (precio del proveedor) *</span>
                  <NumberInput className="input num" value={npCosto} onChange={(n) => setNpCosto(n)} disabled={busy} /></div>
                <div className="pp-field"><span className="pp-mini-label">Precio público *</span>
                  <NumberInput className="input num" value={npPublico} onChange={(n) => setNpPublico(n)} disabled={busy} /></div>
                <div className="pp-field"><span className="pp-mini-label">Precio mayoreo (opcional)</span>
                  <NumberInput className="input num" value={npMayoreo} onChange={(n) => setNpMayoreo(n)} disabled={busy} placeholder="Igual al público si lo dejas en 0" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" style={{ height: 34, fontSize: 13 }} onClick={() => setAddMode('none')} disabled={busy}>Cancelar</button>
                <button type="button" className="btn btn-primary" style={{ height: 34, fontSize: 13 }} onClick={crearYVincular} disabled={busy}>{busy ? 'Guardando...' : 'Crear y vincular'}</button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Este proveedor aún no tiene productos. Agrega el primero con los botones de arriba.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it) => (
                <div key={it.id} className="pp-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.unidad}</div>
                  </div>
                  {editId === it.id ? (
                    <NumberInput className="input num" value={editPrecio} autoFocus
                      onChange={(n) => setEditPrecio(n)} disabled={busy} style={{ width: 110 }} />
                  ) : (
                    <div className="num" style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(it.precio_compra)}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {editId === it.id ? (
                      <>
                        <button type="button" className="btn btn-primary" style={{ height: 32, padding: '0 10px', fontSize: 12 }} onClick={() => guardarPrecio(it)} disabled={busy}>Guardar</button>
                        <button type="button" className="btn btn-secondary" style={{ height: 32, padding: '0 10px', fontSize: 12 }} onClick={() => setEditId(null)} disabled={busy}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" title="Editar precio" onClick={() => { setEditId(it.id); setEditPrecio(it.precio_compra); }} disabled={busy}
                          style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', height: 32, width: 32, cursor: 'pointer' }}>
                          <Icon name="edit" size={14} />
                        </button>
                        <button type="button" title="Quitar del proveedor" onClick={() => quitar(it)} disabled={busy}
                          style={{ background: 'transparent', border: '1px solid oklch(0.85 0.1 25)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', height: 32, width: 32, cursor: 'pointer' }}>
                          <Icon name="trash" size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
