import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';
import { generarSku } from '../../lib/folios';
import { totalesCompraLocal } from '../../lib/comprasLocales';
import { NumberInput } from '../../components/NumberInput';
import type { Proveedor } from '../../types';

interface CompraLocalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface ProductoOpcion {
  id: string;
  nombre: string;
  unidad: string;
  costo: number;
  precio_publico: number;
  precio_credito: number;
  precio_subdistribuidor: number;
  tasa_ieps: number;
}

interface PartidaForm {
  key: number;
  productoId: string;
  cantidad: number;
  costoUnitario: number;
  iepsPct: number;          // IEPS en % (0-100), como en el documento del comercio
  precioPublico: number;    // precios de venta (solo se aplican si "actualizar precios")
  precioCredito: number;
  precioSubdistribuidor: number;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

export const CompraLocalModal: React.FC<CompraLocalModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [folioProveedor, setFolioProveedor] = useState('');
  const [fecha, setFecha] = useState(hoyISO);
  const [metodoPago, setMetodoPago] = useState<'contado' | 'credito'>('contado');
  const [vencimiento, setVencimiento] = useState('');
  const [actualizarPrecios, setActualizarPrecios] = useState(false);
  const [partidas, setPartidas] = useState<PartidaForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const keyRef = useRef(1);

  // Sub-formulario "crear producto al vuelo"
  const [creando, setCreando] = useState(false);
  const [npNombre, setNpNombre] = useState('');
  const [npCategoria, setNpCategoria] = useState('');
  const [npUnidad, setNpUnidad] = useState('');
  const [npSku, setNpSku] = useState('');
  const [npCreaError, setNpCreaError] = useState<string | null>(null);
  const [npBusy, setNpBusy] = useState(false);

  // Precio de compra de cada producto para el proveedor seleccionado (para pre-llenar el costo).
  const [preciosProveedor, setPreciosProveedor] = useState<Record<string, number>>({});

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos')
      .select('id, nombre, unidad, costo, precio_publico, precio_credito, precio_subdistribuidor, tasa_ieps')
      .order('nombre');
    setProductos((data as ProductoOpcion[]) ?? []);
  };

  useEffect(() => {
    if (!isOpen) return;
    setProveedorId(''); setFolioProveedor(''); setFecha(hoyISO()); setMetodoPago('contado');
    setVencimiento(''); setActualizarPrecios(false); setPartidas([]); setErrorMsg(null);
    setCreando(false); setPreciosProveedor({});
    (async () => {
      const { data: prov } = await supabase.from('proveedores').select('id, nombre, local').eq('activo', true).order('nombre');
      // Los proveedores locales primero (son el caso de uso de esta pantalla).
      const lista = ((prov as Proveedor[]) ?? []).sort((a, b) => Number(b.local) - Number(a.local) || a.nombre.localeCompare(b.nombre));
      setProveedores(lista);
      await cargarProductos();
    })();
  }, [isOpen]);

  // Al cambiar de proveedor, carga sus precios de compra para pre-llenar el costo.
  useEffect(() => {
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
    setPartidas((prev) => [...prev, {
      key: keyRef.current++, productoId: '', cantidad: 1, costoUnitario: 0, iepsPct: 0,
      precioPublico: 0, precioCredito: 0, precioSubdistribuidor: 0,
    }]);
  };
  const quitarPartida = (key: number) => setPartidas((prev) => prev.filter((p) => p.key !== key));

  const cambiarProducto = (key: number, productoId: string) => {
    const prod = productos.find((p) => p.id === productoId);
    const precioProv = preciosProveedor[productoId];
    const costo = precioProv != null ? precioProv : (prod ? Number(prod.costo) || 0 : 0);
    setPartidas((prev) => prev.map((p) => p.key === key ? {
      ...p,
      productoId,
      costoUnitario: costo,
      iepsPct: prod ? Math.round(Number(prod.tasa_ieps || 0) * 100) : 0,
      precioPublico: prod ? Number(prod.precio_publico) || 0 : 0,
      precioCredito: prod ? Number(prod.precio_credito) || 0 : 0,
      precioSubdistribuidor: prod ? Number(prod.precio_subdistribuidor) || 0 : 0,
    } : p));
  };

  const cambiarCampo = (key: number, campo: keyof PartidaForm, valor: number) => {
    setPartidas((prev) => prev.map((p) => p.key === key ? { ...p, [campo]: valor } : p));
  };

  const totales = totalesCompraLocal(
    partidas.filter((p) => p.productoId).map((p) => ({ cantidad: p.cantidad, costoUnitario: p.costoUnitario, tasaIeps: (p.iepsPct || 0) / 100 })),
  );

  const crearProducto = async () => {
    setNpCreaError(null);
    if (!npNombre.trim()) { setNpCreaError('El nombre es obligatorio.'); return; }
    if (!npCategoria.trim() || !npUnidad.trim()) { setNpCreaError('Categoría y unidad son obligatorias.'); return; }
    try {
      setNpBusy(true);
      const sku = npSku.trim() || generarSku();
      const { data: nuevo, error } = await supabase.from('productos').insert({
        sku, nombre: npNombre.trim(), categoria: npCategoria.trim(), unidad: npUnidad.trim(),
        precio_publico: 0, precio_credito: 0, precio_subdistribuidor: 0, costo: 0, tasa_ieps: 0,
      }).select('id').single();
      if (error) throw error;
      await cargarProductos();
      // Agrega una partida con el producto recién creado seleccionado.
      const nid = (nuevo as { id: string }).id;
      setPartidas((prev) => [...prev, {
        key: keyRef.current++, productoId: nid, cantidad: 1, costoUnitario: 0, iepsPct: 0,
        precioPublico: 0, precioCredito: 0, precioSubdistribuidor: 0,
      }]);
      setNpNombre(''); setNpCategoria(''); setNpUnidad(''); setNpSku('');
      setCreando(false);
    } catch (err) {
      setNpCreaError(err instanceof Error ? err.message : 'No se pudo crear el producto.');
    } finally {
      setNpBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!proveedorId) { setErrorMsg('Selecciona un proveedor.'); return; }
    const validas = partidas.filter((p) => p.productoId && p.cantidad > 0);
    if (validas.length === 0) { setErrorMsg('Agrega al menos una partida con producto y cantidad.'); return; }
    if (metodoPago === 'credito' && !vencimiento) { setErrorMsg('Indica la fecha de vencimiento del pagaré.'); return; }
    if (metodoPago === 'credito' && vencimiento && vencimiento < new Date().toLocaleDateString('en-CA')) { setErrorMsg('La fecha de vencimiento no puede ser anterior a hoy.'); return; }

    setLoading(true);
    try {
      const lineas = validas.map((p) => {
        const base: Record<string, unknown> = {
          producto_id: p.productoId,
          cantidad: p.cantidad,
          costo_unitario: p.costoUnitario,
          tasa_ieps: round2((p.iepsPct || 0) / 100),
        };
        if (actualizarPrecios) {
          base.precio_publico = p.precioPublico;
          base.precio_credito = p.precioCredito;
          base.precio_subdistribuidor = p.precioSubdistribuidor;
        }
        return base;
      });
      const { data, error } = await supabase.rpc('fn_registrar_compra_local', {
        p_proveedor_id: proveedorId,
        p_folio_proveedor: folioProveedor.trim() || null,
        p_metodo_pago: metodoPago,
        p_fecha: new Date(fecha + 'T12:00:00').toISOString(),
        p_vencimiento: metodoPago === 'credito' ? vencimiento : null,
        p_lineas: lineas,
        p_actualizar_precios: actualizarPrecios,
      });
      if (error) throw new Error(error.message);
      void data;
      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo registrar la compra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}>
      <style>{`
        .modal-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .cl-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-lg); width: 100%; max-width: 860px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
        .cl-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line-2); }
        .cl-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
        .cl-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 22px; background: var(--surface-2); border-top: 1px solid var(--line-2); flex-wrap: wrap; }
        .cl-partida { display: grid; grid-template-columns: 2fr 0.8fr 1fr 0.7fr auto; gap: 8px; align-items: end; }
        .cl-precios { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 8px 0 4px; }
        @media (max-width: 700px) { .cl-partida { grid-template-columns: 1fr 1fr; } .cl-precios { grid-template-columns: 1fr; } }
        .cl-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .cl-mini-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .cl-error { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25); border-radius: var(--radius-sm); color: var(--red); font-size: 13px; }
      `}</style>
      <div className="cl-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="cl-header">
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Nueva compra local</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Captura la remisión/pagaré del comercio; entra a inventario al guardar.</div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => !loading && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <div className="cl-body">
            {errorMsg && <div className="cl-error"><Icon name="alert" size={16} /><span>{errorMsg}</span></div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
              <div className="cl-field"><span className="cl-mini-label">Proveedor *</span>
                <select className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} disabled={loading}>
                  <option value="">Selecciona…</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.local ? ' · Local' : ''}</option>)}
                </select>
              </div>
              <div className="cl-field"><span className="cl-mini-label">Folio del comercio</span>
                <input className="input" value={folioProveedor} onChange={(e) => setFolioProveedor(e.target.value)} disabled={loading} placeholder="Ej. I163894" />
              </div>
              <div className="cl-field"><span className="cl-mini-label">Fecha</span>
                <input type="date" className="input" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} disabled={loading} />
              </div>
              <div className="cl-field"><span className="cl-mini-label">Forma de pago</span>
                <select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as 'contado' | 'credito')} disabled={loading}>
                  <option value="contado">Contado (pagado)</option>
                  <option value="credito">Crédito / pagaré (queda a deber)</option>
                </select>
              </div>
              {metodoPago === 'credito' && (
                <div className="cl-field"><span className="cl-mini-label">Vence *</span>
                  <input type="date" className="input" min={new Date().toLocaleDateString('en-CA')} value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} disabled={loading} />
                </div>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={actualizarPrecios} onChange={(e) => setActualizarPrecios(e.target.checked)} disabled={loading} />
              Actualizar precios de venta del producto con esta compra
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span className="label" style={{ margin: 0 }}>Partidas</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={() => { setNpCreaError(null); setCreando((v) => !v); }} disabled={loading}>
                    <Icon name="plus" size={14} />Nuevo producto
                  </button>
                  <button type="button" className="btn btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 13 }} onClick={agregarPartida} disabled={loading || productos.length === 0}>
                    <Icon name="plus" size={14} />Agregar partida
                  </button>
                </div>
              </div>

              {creando && (
                <div style={{ border: '1px dashed var(--green)', background: 'var(--green-soft)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Crear producto nuevo (el costo y los precios se ajustan en la partida)</div>
                  {npCreaError && <div className="cl-error"><Icon name="alert" size={16} /><span>{npCreaError}</span></div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 10 }}>
                    <div className="cl-field"><span className="cl-mini-label">Nombre *</span>
                      <input className="input" value={npNombre} onChange={(e) => setNpNombre(e.target.value)} disabled={npBusy} placeholder="Ej. Sencor 480 SC" /></div>
                    <div className="cl-field"><span className="cl-mini-label">Categoría *</span>
                      <input className="input" value={npCategoria} onChange={(e) => setNpCategoria(e.target.value)} disabled={npBusy} placeholder="Ej. Herbicidas" /></div>
                    <div className="cl-field"><span className="cl-mini-label">Unidad *</span>
                      <input className="input" value={npUnidad} onChange={(e) => setNpUnidad(e.target.value)} disabled={npBusy} placeholder="Ej. litro, pieza" /></div>
                    <div className="cl-field"><span className="cl-mini-label">SKU (opcional)</span>
                      <input className="input" value={npSku} onChange={(e) => setNpSku(e.target.value)} disabled={npBusy} placeholder="Se genera solo" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" style={{ height: 34, fontSize: 13 }} onClick={() => setCreando(false)} disabled={npBusy}>Cancelar</button>
                    <button type="button" className="btn btn-primary" style={{ height: 34, fontSize: 13 }} onClick={crearProducto} disabled={npBusy}>{npBusy ? 'Creando…' : 'Crear y agregar'}</button>
                  </div>
                </div>
              )}

              {partidas.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Agrega las partidas del documento del comercio.</div>}
              {partidas.map((p) => {
                const prod = productos.find((x) => x.id === p.productoId);
                return (
                  <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--line-2)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                    <div className="cl-partida">
                      <div className="cl-field">
                        <span className="cl-mini-label">Producto</span>
                        <select className="input" value={p.productoId} onChange={(e) => cambiarProducto(p.key, e.target.value)} disabled={loading}>
                          <option value="">Producto…</option>
                          {productos.map((prd) => <option key={prd.id} value={prd.id}>{prd.nombre}</option>)}
                        </select>
                      </div>
                      <div className="cl-field"><span className="cl-mini-label">Cantidad</span>
                        <NumberInput className="input num" value={p.cantidad} onChange={(n) => cambiarCampo(p.key, 'cantidad', n)} disabled={loading} /></div>
                      <div className="cl-field"><span className="cl-mini-label">Costo unit.</span>
                        <NumberInput className="input num" value={p.costoUnitario} onChange={(n) => cambiarCampo(p.key, 'costoUnitario', n)} disabled={loading} /></div>
                      <div className="cl-field"><span className="cl-mini-label">IEPS %</span>
                        <NumberInput className="input num" value={p.iepsPct} onChange={(n) => cambiarCampo(p.key, 'iepsPct', n)} disabled={loading} /></div>
                      <button type="button" onClick={() => quitarPartida(p.key)} title="Quitar partida"
                        style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', height: 40, width: 40, cursor: 'pointer', flex: 'none' }}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                    {actualizarPrecios && p.productoId && (
                      <div className="cl-precios">
                        <div className="cl-field"><span className="cl-mini-label">Precio contado</span>
                          <NumberInput className="input num" value={p.precioPublico} onChange={(n) => cambiarCampo(p.key, 'precioPublico', n)} disabled={loading} /></div>
                        <div className="cl-field"><span className="cl-mini-label">Precio crédito</span>
                          <NumberInput className="input num" value={p.precioCredito} onChange={(n) => cambiarCampo(p.key, 'precioCredito', n)} disabled={loading} /></div>
                        <div className="cl-field"><span className="cl-mini-label">Precio subdist.</span>
                          <NumberInput className="input num" value={p.precioSubdistribuidor} onChange={(n) => cambiarCampo(p.key, 'precioSubdistribuidor', n)} disabled={loading} /></div>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {prod ? `${prod.unidad} · importe ${fmtMXN(round2(p.cantidad * p.costoUnitario * (1 + (p.iepsPct || 0) / 100)))}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cl-footer">
            <div className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>
              Subtotal {fmtMXN(totales.subtotal)} · IEPS {fmtMXN(totales.ieps)} · <strong style={{ color: 'var(--ink)', fontSize: 15 }}>Total {fmtMXN(totales.total)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => !loading && onClose()} disabled={loading}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Guardando…' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
