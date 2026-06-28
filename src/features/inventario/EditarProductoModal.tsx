import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { margen } from '../../lib/money';
import { fmtMXN } from '../../lib/format';
import type { Producto } from '../../types';

// Categorías del giro (mismas que en el alta de producto).
const CATEGORIAS = ['Semillas', 'Herbicidas', 'Insecticidas', 'Foliares', 'Fungicidas', 'Abono'];

interface Props {
  producto: Producto;
  onClose: () => void;
  onSaved: () => void;
}

export const EditarProductoModal: React.FC<Props> = ({ producto, onClose, onSaved }) => {
  const [nombre, setNombre] = useState(producto.nombre);
  const [sku, setSku] = useState(producto.sku);
  const [categoria, setCategoria] = useState(producto.categoria);
  const [unidad, setUnidad] = useState(producto.unidad);
  const [precioPublico, setPrecioPublico] = useState(producto.precio_publico);
  const [precioMayoreo, setPrecioMayoreo] = useState(producto.precio_mayoreo);
  const [costo, setCosto] = useState(producto.costo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!sku.trim()) { setError('El SKU es obligatorio.'); return; }
    if (precioPublico <= 0) { setError('El precio al público debe ser mayor a 0.'); return; }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from('productos').update({
        nombre: nombre.trim(),
        sku: sku.trim(),
        categoria,
        unidad: unidad.trim(),
        precio_publico: precioPublico,
        precio_mayoreo: precioMayoreo || precioPublico,
        costo,
      }).eq('id', producto.id);
      if (upErr) throw upErr;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto. Verifica que el SKU no esté duplicado.');
    } finally {
      setSaving(false);
    }
  };

  const m = margen(precioPublico, costo);

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--line-2)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Editar producto</h3>
          <button type="button" className="modal-close-btn" onClick={() => !saving && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid oklch(0.58 0.16 25 / 0.25)', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)' }}>
              <Icon name="alert" size={16} color="var(--red)" />{error}
            </div>
          )}

          <div>
            <div className="label">Nombre *</div>
            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="label">SKU *</div>
              <input className="input num" value={sku} onChange={e => setSku(e.target.value)} required />
            </div>
            <div>
              <div className="label">Unidad</div>
              <input className="input" value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="pza, kg, L..." />
            </div>
          </div>

          <div>
            <div className="label">Categoría</div>
            <select className="input" value={categoria} onChange={e => setCategoria(e.target.value)}>
              {!CATEGORIAS.includes(categoria) && categoria && <option value={categoria}>{categoria}</option>}
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="label">Precio al Público ($) *</div>
              <NumberInput className="input num" required value={precioPublico} onChange={setPrecioPublico} />
            </div>
            <div>
              <div className="label">Precio Mayoreo ($)</div>
              <NumberInput className="input num" value={precioMayoreo} onChange={setPrecioMayoreo} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <div className="label">Costo de Compra ($)</div>
              <NumberInput className="input num" value={costo} onChange={setCosto} />
            </div>
            {precioPublico > 0 && (
              <div className="label" style={{ display: 'flex', justifyContent: 'space-between', color: m.utilidad >= 0 ? 'var(--ok-2)' : 'var(--red)', marginBottom: 8 }}>
                <span>Margen</span>
                <span className="num">{m.utilidad >= 0 ? '+' : ''}{fmtMXN(m.utilidad)} · {m.porcentaje}%</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>El stock se ajusta con movimientos de inventario, no aquí.</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: '1px solid var(--line-2)' }}>
          <button type="button" className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </div>
  );
};
