import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { calcularTotalesOrden, subtotalPartida, generarFolioOC } from '../../lib/compras';
import { NumberInput } from '../../components/NumberInput';
import type { Proveedor } from '../../types';

interface NuevaOrdenModalProps {
  isOpen: boolean;
  vendedorId: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface ProductoOpcion {
  id: string;
  nombre: string;
  unidad: string;
  costo: number;
}

interface PartidaForm {
  key: number;
  productoId: string;
  descripcion: string;
  presentacion: string;
  cantidad: number;
  precioUnitario: number;
}

export const NuevaOrdenModal: React.FC<NuevaOrdenModalProps> = ({ isOpen, vendedorId, onClose, onSaved }) => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [partidas, setPartidas] = useState<PartidaForm[]>([]);
  // AGROMAR no maneja IVA (insumos agrícolas, sector primario): tasa fija en 0.
  const tasaIva = 0;
  const [instrucciones, setInstrucciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const keyRef = useRef(1);

  // Precio de compra de cada producto para el proveedor seleccionado (para pre-llenar).
  const [preciosProveedor, setPreciosProveedor] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setProveedorId('');
    setPartidas([]);
    setInstrucciones('');
    setErrorMsg(null);
    setPreciosProveedor({});
    (async () => {
      const { data: prov } = await supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre');
      setProveedores((prov as Proveedor[]) ?? []);
      const { data: prods } = await supabase.from('productos').select('id, nombre, unidad, costo').order('nombre');
      setProductos((prods as ProductoOpcion[]) ?? []);
    })();
  }, [isOpen]);

  // Al cambiar de proveedor, carga sus precios de compra por producto y limpia
  // las partidas (los productos disponibles dependen del proveedor).
  useEffect(() => {
    setPartidas([]);
    if (!proveedorId) { setPreciosProveedor({}); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('proveedor_productos').select('producto_id, precio_compra').eq('proveedor_id', proveedorId);
      if (cancel) return;
      const map: Record<string, number> = {};
      (data as { producto_id: string; precio_compra: number }[] ?? []).forEach((r) => { map[r.producto_id] = Number(r.precio_compra); });
      setPreciosProveedor(map);
    })();
    return () => { cancel = true; };
  }, [proveedorId]);

  if (!isOpen) return null;

  const agregarPartida = () => {
    setPartidas((prev) => [...prev, { key: keyRef.current++, productoId: '', descripcion: '', presentacion: '', cantidad: 1, precioUnitario: 0 }]);
  };

  const quitarPartida = (key: number) => setPartidas((prev) => prev.filter((p) => p.key !== key));

  const cambiarProducto = (key: number, productoId: string) => {
    const prod = productos.find((p) => p.id === productoId);
    // Pre-llena con el precio que este proveedor ofrece por el producto; si no hay,
    // cae al costo de referencia del producto.
    const precioProv = preciosProveedor[productoId];
    const precio = precioProv != null ? precioProv : (prod ? Number(prod.costo) || 0 : 0);
    setPartidas((prev) => prev.map((p) => p.key === key ? {
      ...p,
      productoId,
      descripcion: prod?.nombre ?? '',
      presentacion: prod?.unidad ?? '',
      precioUnitario: precio,
    } : p));
  };

  const cambiarCampo = (key: number, campo: 'cantidad' | 'precioUnitario', valor: number) => {
    setPartidas((prev) => prev.map((p) => p.key === key ? { ...p, [campo]: valor } : p));
  };

  // Solo se pueden ordenar productos que ese proveedor provee (los de su perfil).
  const productosDelProveedor = productos.filter((p) => preciosProveedor[p.id] != null);

  const totales = calcularTotalesOrden(
    partidas.map((p) => ({ cantidad: p.cantidad, precioUnitario: p.precioUnitario })),
    tasaIva,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!proveedorId) { setErrorMsg('Selecciona un proveedor.'); return; }
    const validas = partidas.filter((p) => p.productoId && p.cantidad > 0);
    if (validas.length === 0) { setErrorMsg('Agrega al menos una partida con producto y cantidad.'); return; }

    setLoading(true);
    try {
      // Crear la cabecera (reintenta una vez si el folio choca).
      let ordenId: string | null = null;
      for (let intento = 0; intento < 2 && !ordenId; intento++) {
        const folio = generarFolioOC(new Date());
        const { data, error } = await supabase
          .from('ordenes_compra')
          .insert({
            folio,
            proveedor_id: proveedorId,
            estado: 'borrador',
            tasa_iva: tasaIva,
            subtotal: totales.subtotal,
            iva: totales.iva,
            total: totales.total,
            instrucciones: instrucciones.trim() || null,
            creado_por: vendedorId,
          })
          .select('id')
          .single();
        if (error) {
          if (intento === 1) throw new Error(error.message);
          continue;
        }
        ordenId = data.id;
      }
      if (!ordenId) throw new Error('No se pudo generar el folio de la orden.');

      const detalles = validas.map((p) => ({
        orden_id: ordenId,
        producto_id: p.productoId,
        descripcion: p.descripcion,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        precio_unitario: p.precioUnitario,
        subtotal: subtotalPartida(p.cantidad, p.precioUnitario),
      }));
      const { error: detError } = await supabase.from('ordenes_compra_detalles').insert(detalles);
      if (detError) {
        // No es transaccional: si fallan los detalles, borramos la cabecera
        // para no dejar una orden huérfana sin partidas.
        await supabase.from('ordenes_compra').delete().eq('id', ordenId);
        throw new Error(detError.message);
      }

      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo crear la orden.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}>
      <style>{`
        .modal-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .oc-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-lg); width: 100%; max-width: 760px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
        .oc-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line-2); }
        .oc-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .oc-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 22px; background: var(--surface-2); border-top: 1px solid var(--line-2); flex-wrap: wrap; }
        .oc-partida { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; align-items: end; }
        @media (max-width: 640px) { .oc-partida { grid-template-columns: 1fr 1fr; } }
        .oc-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .oc-mini-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .oc-error { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25); border-radius: var(--radius-sm); color: var(--red); font-size: 13px; }
      `}</style>
      <div className="oc-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="oc-header">
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Nueva Orden de Compra</h3>
            <button type="button" className="modal-close-btn" onClick={() => !loading && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <div className="oc-body">
            {errorMsg && <div className="oc-error"><Icon name="alert" size={16} /><span>{errorMsg}</span></div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Proveedor *</label>
                <select className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} disabled={loading}>
                  <option value="">Selecciona…</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span className="label" style={{ margin: 0 }}>Partidas</span>
                <button type="button" className="btn btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={agregarPartida} disabled={loading || !proveedorId || productosDelProveedor.length === 0}>
                  <Icon name="plus" size={14} />Agregar
                </button>
              </div>

              {proveedorId && productosDelProveedor.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0', lineHeight: 1.5 }}>
                  Este proveedor aún no tiene productos. Agrégalos desde su perfil en la pestaña <strong>Proveedores</strong>.
                </div>
              )}

              {proveedorId && productosDelProveedor.length > 0 && partidas.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Agrega productos a comprar con el botón "Agregar".</div>}
              {partidas.map((p) => (
                <div key={p.key} className="oc-partida">
                  <div className="oc-field">
                    <span className="oc-mini-label">Producto</span>
                    <select className="input" value={p.productoId} onChange={(e) => cambiarProducto(p.key, e.target.value)} disabled={loading}>
                      <option value="">Producto…</option>
                      {productosDelProveedor.map((prod) => <option key={prod.id} value={prod.id}>{prod.nombre}</option>)}
                    </select>
                  </div>
                  <div className="oc-field">
                    <span className="oc-mini-label">Cantidad</span>
                    <NumberInput className="input num" placeholder="Cant." value={p.cantidad}
                      onChange={(n) => cambiarCampo(p.key, 'cantidad', n)} disabled={loading} />
                  </div>
                  <div className="oc-field">
                    <span className="oc-mini-label">Precio unit.</span>
                    <NumberInput className="input num" placeholder="Costo" value={p.precioUnitario}
                      onChange={(n) => cambiarCampo(p.key, 'precioUnitario', n)} disabled={loading} />
                  </div>
                  <button type="button" onClick={() => quitarPartida(p.key)} title="Quitar partida"
                    style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', height: 40, width: 40, cursor: 'pointer', flex: 'none' }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="label">Instrucciones (opcional)</label>
              <input className="input" value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} disabled={loading} placeholder="Ej. Entregar en sucursal Centro" />
            </div>
          </div>

          <div className="oc-footer">
            <div className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>
              Subtotal {fmtMXN(totales.subtotal)} · <strong style={{ color: 'var(--ink)', fontSize: 15 }}>Total {fmtMXN(totales.total)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => !loading && onClose()} disabled={loading}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Guardando...' : 'Crear orden (borrador)'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
