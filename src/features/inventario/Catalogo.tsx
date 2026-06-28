import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import type { Producto } from '../../types';
import { Icon } from '../../components/Icon';
import { BannerError } from '../../components/BannerError';
import { Topbar } from '../../components/Topbar';
import { NumberInput } from '../../components/NumberInput';
import { fmtMXN, fmtMXN0 } from '../../lib/format';
import { margen } from '../../lib/money';
import { EditarProductoModal } from './EditarProductoModal';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SHOW_BARCODE_FEATURES = true;


interface MovimientoReciente {
  id: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  referencia: string | null;
  motivo?: string | null;
  creado_en: string;
  productos: {
    nombre: string;
  } | null;
}

export const Catalogo: React.FC = () => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoReciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [verDescontinuados, setVerDescontinuados] = useState(false);
  const [catFiltro, setCatFiltro] = useState('todas');
  const [stockFiltro, setStockFiltro] = useState('todos');
  const [editProd, setEditProd] = useState<Producto | null>(null);
  const [moveType, setMoveType] = useState<'entrada' | 'salida'>('entrada');
  const [selProd, setSelProd] = useState<string>('');
  const [qty, setQty] = useState(10);
  const [costoEntrada, setCostoEntrada] = useState(0);
  const [refValue, setRefValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [motivoSalida, setMotivoSalida] = useState('ajuste');

  // New product modal states
  const [showModal, setShowModal] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newCategoria, setNewCategoria] = useState('Semillas');
  const [newUnidad, setNewUnidad] = useState('costal 20kg');
  const [newPrecioPublico, setNewPrecioPublico] = useState(100);
  const [newPrecioMayoreo, setNewPrecioMayoreo] = useState(90);
  const [newCosto, setNewCosto] = useState(0);
  const [newStockMinimo, setNewStockMinimo] = useState(5);
  const [newInitialStock, setNewInitialStock] = useState(0);

  // Webcam scanning states
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Play audio beep
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio beep no soportado:', e);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNombre || !newSku || !newUnidad || newPrecioPublico <= 0) {
      toast.error('Por favor completa todos los campos obligatorios.');
      return;
    }

    try {
      setLoading(true);
      // 1. Insert product
      const { data, error } = await supabase
        .from('productos')
        .insert({
          sku: newSku.trim(),
          nombre: newNombre.trim(),
          categoria: newCategoria,
          unidad: newUnidad.trim(),
          precio_publico: newPrecioPublico,
          precio_mayoreo: newPrecioMayoreo || newPrecioPublico,
          costo: newCosto,
          stock_minimo: newStockMinimo,
          stock: 0 // populated by the initial movement if specified
        })
        .select();

      if (error) throw error;

      const created = data?.[0];

      // 2. Insert initial inventory movement if stock > 0
      if (created && newInitialStock > 0) {
        const { data: movData, error: movError } = await supabase
          .from('movimientos_inventario')
          .insert({
            producto_id: created.id,
            tipo: 'entrada',
            cantidad: newInitialStock,
            referencia: 'STOCK-INIT',
            descripcion: 'Carga inicial del producto en catálogo'
          })
          .select('lote_id');
        if (movError) throw movError;

        // El trigger crea el lote en la entrada; le asignamos el costo de compra real.
        const loteId = movData?.[0]?.lote_id;
        if (loteId) {
          const { error: loteError } = await supabase
            .from('lotes')
            .update({ costo: newCosto })
            .eq('id', loteId);
          if (loteError) throw loteError;
        }
      }

      toast.success(`Producto "${newNombre}" creado con éxito.`);
      setShowModal(false);

      // Reset
      setNewNombre('');
      setNewSku('');
      setNewCategoria('Semillas');
      setNewUnidad('costal 20kg');
      setNewPrecioPublico(100);
      setNewPrecioMayoreo(90);
      setNewCosto(0);
      setNewStockMinimo(5);
      setNewInitialStock(0);

      cargarDatos();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar producto: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      // 1. Cargar productos
      const { data: prodsData, error: prodsError } = await supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true });

      if (prodsError) throw prodsError;
      setProductos(prodsData || []);

      if (prodsData && prodsData.length > 0 && !selProd) {
        setSelProd(prodsData[0].id);
      }

      // 2. Cargar movimientos recientes
      const { data: movsData, error: movsError } = await supabase
        .from('movimientos_inventario')
        .select('id, tipo, cantidad, referencia, motivo, creado_en, productos(nombre)')
        .order('creado_en', { ascending: false })
        .limit(5);

      if (movsError) throw movsError;
      setMovimientos((movsData as unknown as MovimientoReciente[]) || []);

    } catch (err) {
      console.error('Error al cargar datos de inventario:', err);
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el inventario. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Precargar el costo de entrada con el costo de referencia del producto seleccionado
  useEffect(() => {
    const prod = productos.find(p => p.id === selProd);
    if (prod) {
      setCostoEntrada(prod.costo ?? 0);
    }
  }, [selProd, productos]);

  const handleRegistrarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // evita doble registro por doble clic
    if (!selProd || qty <= 0) return;

    // En salidas, validar que no se descuente más de lo disponible.
    if (moveType === 'salida') {
      const prodSel = productos.find(p => p.id === selProd);
      const stockActual = Number(prodSel?.stock ?? 0);
      if (qty > stockActual) {
        toast.error(`Stock insuficiente. Disponible: ${stockActual}, intentas sacar: ${qty}.`);
        return;
      }
    }

    try {
      setLoading(true);
      const { data: movData, error } = await supabase
        .from('movimientos_inventario')
        .insert({
          producto_id: selProd,
          tipo: moveType,
          cantidad: qty,
          referencia: refValue || null,
          descripcion: descValue || null,
          motivo: moveType === 'salida' ? motivoSalida : null,
        })
        .select('lote_id');

      if (error) throw error;

      // En entradas el trigger crea un nuevo lote; le asignamos el costo de compra capturado.
      if (moveType === 'entrada') {
        const loteId = movData?.[0]?.lote_id;
        if (loteId) {
          const { error: loteError } = await supabase
            .from('lotes')
            .update({ costo: costoEntrada })
            .eq('id', loteId);
          if (loteError) throw loteError;
        }
      }

      toast.success(`Movimiento de ${moveType === 'entrada' ? 'entrada' : 'salida'} registrado con éxito.`);
      setRefValue('');
      setDescValue('');
      cargarDatos();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar movimiento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const setActivo = async (p: Producto, activo: boolean) => {
    const { error: e } = await supabase.from('productos').update({ activo }).eq('id', p.id);
    if (e) { setLoadError(e.message); return; }
    cargarDatos();
  };

  const categorias = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean))).sort();

  const filtered = productos.filter(p =>
    (verDescontinuados || p.activo !== false) &&
    (catFiltro === 'todas' || p.categoria === catFiltro) &&
    (stockFiltro === 'todos'
      || (stockFiltro === 'bajo' && (p.stock || 0) > 0 && (p.stock || 0) < p.stock_minimo)
      || (stockFiltro === 'agotado' && (p.stock || 0) === 0)) &&
    (p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.includes(search))
  );

  const inv = {
    total: productos.length,
    valorTotal: productos.reduce((s, p) => s + (p.stock || 0) * p.precio_publico, 0), // fallback if needed
    low: productos.filter(p => (p.stock || 0) < p.stock_minimo).length,
    out: productos.filter(p => (p.stock || 0) === 0).length,
  };

  // En base de datos el campo precio es precio_publico, verifiquemos si la interface de TS tiene precio_publico
  const valorTotalCalculado = productos.reduce((s, p) => s + (p.stock || 0) * p.precio_publico, 0);

  const stockStatus = (p: Producto) => {
    const stock = p.stock || 0;
    if (stock === 0) return { color: 'red', label: 'Agotado' };
    if (stock < p.stock_minimo / 2) return { color: 'red', label: 'Crítico' };
    if (stock < p.stock_minimo) return { color: 'amber', label: 'Bajo' };
    return { color: 'ok', label: 'Normal' };
  };

  return (
    <>
      <Topbar
        title="Inventario"
        subtitle={loading ? 'Cargando...' : `${productos.length} productos · Valor total ${fmtMXN0(valorTotalCalculado)}`}
      >
        <button className="btn btn-secondary" onClick={cargarDatos} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={16} />
          Nuevo Producto
        </button>
      </Topbar>

      <div className="content">
        <BannerError mensaje={loadError} onReintentar={cargarDatos} />
        {/* KPIs */}
        <div className="catalog-kpis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Productos', val: inv.total, sub: 'En catálogo', color: 'gray', icon: 'package' },
            { label: 'Valor en inventario', val: fmtMXN0(valorTotalCalculado), sub: 'P. Público consolidado', color: 'green', icon: 'cash' },
            { label: 'Stock bajo', val: inv.low, sub: 'Pedir pronto', color: 'amber', icon: 'alert' },
            { label: 'Agotados', val: inv.out, sub: 'Agotados', color: 'red', icon: 'x' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `var(--${
                    k.color === 'gray'
                      ? 'line-2'
                      : `${k.color === 'green' ? 'ok-soft' : k.color === 'amber' ? 'amber-soft' : 'red-soft'}`
                  })`,
                  color:
                    k.color === 'green'
                      ? 'var(--ok-2)'
                      : k.color === 'amber'
                      ? 'oklch(0.5 0.12 70)'
                      : k.color === 'red'
                      ? 'var(--red)'
                      : 'var(--ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name={k.icon} size={18} />
              </div>
              <div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {k.val}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {k.label} · {k.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="catalog-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
          {/* Product list */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 14px',
                  height: 38,
                  background: 'var(--surface-2)',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                }}
              >
                <Icon name="search" size={16} color="var(--muted)" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14 }}
                />
              </div>
              <select className="input" value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
                style={{ height: 38, fontSize: 13, flex: 'none', maxWidth: 160 }} title="Filtrar por categoría">
                <option value="todas">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" value={stockFiltro} onChange={e => setStockFiltro(e.target.value)}
                style={{ height: 38, fontSize: 13, flex: 'none', maxWidth: 140 }} title="Filtrar por estado de stock">
                <option value="todos">Todo el stock</option>
                <option value="bajo">Stock bajo</option>
                <option value="agotado">Agotados</option>
              </select>
              <button type="button" className="btn btn-secondary"
                onClick={() => setVerDescontinuados(v => !v)}
                style={{ height: 38, padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap', flex: 'none' }}
                title="Mostrar u ocultar productos descontinuados">
                <Icon name="eye" size={14} /> {verDescontinuados ? 'Ocultar baja' : 'Ver baja'}
              </button>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando catálogo...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      color: 'var(--muted)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Producto
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      SKU
                    </th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Stock
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Nivel
                    </th>
                    <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Precio
                    </th>
                    <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        No hay productos que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                  {filtered.map(p => {
                    const s = stockStatus(p);
                    const stockVal = p.stock || 0;
                    const pct = Math.min((stockVal / (p.stock_minimo * 2)) * 100, 100);
                    return (
                      <tr
                        key={p.id}
                        style={{ cursor: 'pointer', opacity: p.activo === false ? 0.55 : 1 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                        onClick={() => setSelProd(p.id)}
                      >
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: `repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--line-2) 4px 8px)`,
                                border: '1px solid var(--line)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                fontWeight: 700,
                                color: 'var(--muted)',
                                fontFamily: 'JetBrains Mono',
                                flex: 'none',
                              }}
                            >
                              {p.nombre.substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {p.unidad} · {p.categoria}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }} className="mono">
                          {p.sku}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              color: s.color === 'red' ? 'var(--red)' : s.color === 'amber' ? 'oklch(0.5 0.12 70)' : 'var(--ink)',
                            }}
                          >
                            {stockVal}
                          </span>
                          <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }}>/ {p.stock_minimo} mín</span>
                        </td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', width: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--line-2)', borderRadius: 999 }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: s.color === 'red' ? 'var(--red)' : s.color === 'amber' ? 'var(--amber)' : 'var(--ok)',
                                  borderRadius: 999,
                                }}
                              ></div>
                            </div>
                            <span className={`badge ${s.color}`} style={{ height: 20, fontSize: 10 }}>
                              {s.label}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--line-2)', fontWeight: 700 }}
                          className="num"
                        >
                          {fmtMXN(p.precio_publico)}
                          {(() => {
                            const m = margen(p.precio_publico, p.costo);
                            return (
                              <div style={{ fontSize: 10, fontWeight: 600, color: m.utilidad >= 0 ? 'var(--ok-2)' : 'var(--red)' }}
                                title="Margen sobre el costo">
                                {m.utilidad >= 0 ? '+' : ''}{fmtMXN(m.utilidad)} · {m.porcentaje}%
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--line-2)', whiteSpace: 'nowrap' }}
                          onClick={e => e.stopPropagation()}>
                          {p.activo === false ? (
                            <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              onClick={() => setActivo(p, true)} title="Reactivar producto">
                              <Icon name="check" size={13} /> Reactivar
                            </button>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                                onClick={() => setEditProd(p)} title="Editar producto">
                                <Icon name="edit" size={13} />
                              </button>
                              <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                                onClick={() => { if (confirm(`¿Descontinuar "${p.nombre}"? No se borra: deja de aparecer en el catálogo activo y conserva su historial.`)) setActivo(p, false); }}
                                title="Descontinuar (baja)">
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Side: Quick entry */}
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Icon name="sack" size={20} color="var(--green-2)" />
                <div className="h3">Registrar movimiento</div>
              </div>

              <form onSubmit={handleRegistrarMovimiento}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => setMoveType('entrada')}
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                      border: `1.5px solid ${moveType === 'entrada' ? 'var(--ok)' : 'var(--line)'}`,
                      background: moveType === 'entrada' ? 'var(--ok-soft)' : 'var(--surface)',
                      color: moveType === 'entrada' ? 'var(--ok-2)' : 'var(--ink-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="arrow-down" size={14} />
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setMoveType('salida')}
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                      border: `1.5px solid ${moveType === 'salida' ? 'oklch(0.55 0.16 25)' : 'var(--line)'}`,
                      background: moveType === 'salida' ? 'var(--red-soft)' : 'var(--surface)',
                      color: moveType === 'salida' ? 'var(--red)' : 'var(--ink-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="arrow-up" size={14} />
                    Salida
                  </button>
                </div>

                <div className="label">Producto</div>
                <select
                  className="input"
                  value={selProd}
                  onChange={e => setSelProd(e.target.value)}
                  style={{
                    marginBottom: 12,
                    appearance: 'none',
                    backgroundImage:
                      'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%237a827e\' stroke-width=\'2\'><path d=\'m6 9 6 6 6-6\'/></svg>")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    paddingRight: 32,
                  }}
                >
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>

                {moveType === 'salida' && (
                  <>
                    <div className="label">Motivo de la salida</div>
                    <select className="input" value={motivoSalida} onChange={e => setMotivoSalida(e.target.value)} style={{ marginBottom: 12 }}>
                      <option value="ajuste">Ajuste de inventario</option>
                      <option value="merma">Merma</option>
                      <option value="caducidad">Caducidad</option>
                      <option value="robo">Robo / extravío</option>
                      <option value="devolucion">Devolución a proveedor</option>
                    </select>
                  </>
                )}

                <div className="label">Cantidad</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="btn btn-secondary"
                    style={{ width: 40, height: 48, padding: 0 }}
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <NumberInput
                    className="input input-lg num"
                    value={qty}
                    onChange={n => setQty(n)}
                    style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }}
                  />
                  <button
                    type="button"
                    onClick={() => setQty(qty + 1)}
                    className="btn btn-secondary"
                    style={{ width: 40, height: 48, padding: 0 }}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>

                {moveType === 'entrada' && (
                  <>
                    <div className="label">Costo de compra unitario ($)</div>
                    <NumberInput
                      className="input num"
                      value={costoEntrada}
                      onChange={n => setCostoEntrada(n)}
                      placeholder="Costo real de este lote"
                      style={{ marginBottom: 12 }}
                    />
                  </>
                )}

                <div className="label">Referencia / Lote</div>
                <input
                  className="input"
                  value={refValue}
                  onChange={e => setRefValue(e.target.value)}
                  placeholder="Ej. LOTE-A190 o Proveedor"
                  style={{ marginBottom: 14 }}
                />

                <div className="label">Nota (opcional)</div>
                <textarea
                  className="input"
                  rows={2}
                  value={descValue}
                  onChange={e => setDescValue(e.target.value)}
                  style={{ height: 'auto', padding: '10px 14px', resize: 'none', marginBottom: 14 }}
                  placeholder="Observaciones de almacén..."
                ></textarea>

                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                  <Icon name="check" size={16} />
                  Registrar {moveType === 'entrada' ? 'entrada' : 'salida'} de {qty}
                </button>
              </form>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div className="h3" style={{ marginBottom: 12 }}>
                Movimientos recientes
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {movimientos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 10 }}>
                    Sin movimientos registrados
                  </div>
                ) : (
                  movimientos.map((m, i) => (
                    <div key={m.id || i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          flex: 'none',
                          background: m.tipo === 'entrada' ? 'var(--ok-soft)' : 'var(--red-soft)',
                          color: m.tipo === 'entrada' ? 'var(--ok-2)' : 'var(--red)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name={m.tipo === 'entrada' ? 'arrow-down' : 'arrow-up'} size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.productos?.nombre || 'Producto Desconocido'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {m.creado_en ? new Date(m.creado_en).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''} ·{' '}
                          {m.tipo === 'salida' && m.motivo ? `Motivo: ${m.motivo}` : (m.referencia || 'S/R')}
                        </div>
                      </div>
                      <div
                        className="num"
                        style={{ fontSize: 13, fontWeight: 700, color: m.tipo === 'entrada' ? 'var(--ok-2)' : 'var(--red)' }}
                      >
                        {m.tipo === 'entrada' ? '+' : '−'}
                        {m.cantidad}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NUEVO PRODUCTO MODAL */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 500, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h3">Nuevo Producto en Catálogo</div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="label">Nombre del Producto *</div>
                <input
                  className="input"
                  required
                  value={newNombre}
                  onChange={e => setNewNombre(e.target.value)}
                  placeholder="Ej. Semilla de Maíz Poncho"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="label">Código de Barras / SKU *</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="input mono"
                      required
                      value={newSku}
                      onChange={e => setNewSku(e.target.value)}
                      placeholder={SHOW_BARCODE_FEATURES ? "Escanea o teclea" : "Ingresar SKU / Código"}
                      style={{ flex: 1 }}
                    />
                    {SHOW_BARCODE_FEATURES && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowWebcamModal(true)}
                        style={{ width: 38, height: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        title="Escanear con cámara"
                      >
                        <Icon name="barcode" size={18} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="label">Categoría</div>
                  <select
                    className="input"
                    value={newCategoria}
                    onChange={e => setNewCategoria(e.target.value)}
                  >
                    <option value="Semillas">Semillas</option>
                    <option value="Herbicidas">Herbicidas</option>
                    <option value="Insecticidas">Insecticidas</option>
                    <option value="Foliares">Foliares</option>
                    <option value="Fungicidas">Fungicidas</option>
                    <option value="Abono">Abono</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="label">Unidad de Medida *</div>
                  <input
                    className="input"
                    required
                    value={newUnidad}
                    onChange={e => setNewUnidad(e.target.value)}
                    placeholder="Ej. costal 20kg, botella 1L"
                  />
                </div>
                <div>
                  <div className="label">Stock Mínimo Alerta</div>
                  <NumberInput
                    className="input num"
                    required
                    value={newStockMinimo}
                    onChange={n => setNewStockMinimo(n)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="label">Precio al Público ($) *</div>
                  <NumberInput
                    className="input num"
                    required
                    value={newPrecioPublico}
                    onChange={n => setNewPrecioPublico(n)}
                  />
                </div>
                <div>
                  <div className="label">Precio Mayoreo ($)</div>
                  <NumberInput
                    className="input num"
                    value={newPrecioMayoreo}
                    onChange={n => setNewPrecioMayoreo(n)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div className="label">Costo de Compra ($)</div>
                  <NumberInput
                    className="input num"
                    value={newCosto}
                    onChange={n => setNewCosto(n)}
                    placeholder="Costo de referencia"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {newPrecioPublico > 0 && (() => {
                    const m = margen(newPrecioPublico, newCosto);
                    return (
                      <div className="label" style={{ display: 'flex', justifyContent: 'space-between', color: m.utilidad >= 0 ? 'var(--ok-2)' : 'var(--red)', marginBottom: 8 }}>
                        <span>Margen</span>
                        <span className="num">{m.utilidad >= 0 ? '+' : ''}{fmtMXN(m.utilidad)} · {m.porcentaje}%</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
                <div className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Inventario Inicial (Opcional)</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 'normal' }}>Creará un lote FIFO inicial</span>
                </div>
                <NumberInput
                  className="input num"
                  placeholder="Ej. 10.00"
                  value={newInitialStock}
                  onChange={n => setNewInitialStock(n)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                style={{ marginTop: 8 }}
                disabled={loading}
              >
                <Icon name="check" size={16} />
                Guardar Producto en Catálogo
              </button>
            </form>
          </div>
        </div>
      )}

      {editProd && (
        <EditarProductoModal
          producto={editProd}
          onClose={() => setEditProd(null)}
          onSaved={() => { setEditProd(null); cargarDatos(); }}
        />
      )}

      {/* WEBCAM SCANNER MODAL */}
      {SHOW_BARCODE_FEATURES && showWebcamModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 440, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h3">Escanear Código de Barras</div>
              <button
                type="button"
                onClick={() => { setShowWebcamModal(false); setCameraError(null); }}
                style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            
            {cameraError ? (
              <div style={{ padding: 24, background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 8, fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Icon name="alert" size={24} />
                <div style={{ fontWeight: 600 }}>Acceso a Cámara Fallido</div>
                <div style={{ lineHeight: 1.4 }}>{cameraError}</div>
              </div>
            ) : (
              <>
                <div id="catalog-webcam-reader" style={{ width: '100%', aspectRatio: '1.2', background: '#000', borderRadius: 8, overflow: 'hidden' }}></div>
                <div style={{ padding: '0 8px' }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.4, margin: 0 }}>
                    Muestra el código de barras frente a la cámara.
                  </p>
                </div>
              </>
            )}

            <WebcamScannerRunner
              elementId="catalog-webcam-reader"
              setCameraError={setCameraError}
              onScan={(code) => {
                playBeep();
                setNewSku(code);
                setShowWebcamModal(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

// Runner helper for local webcam scanning inside the Catalog
interface WebcamRunnerProps {
  elementId: string;
  onScan: (code: string) => void;
  setCameraError: (err: string | null) => void;
}

const WebcamScannerRunner: React.FC<WebcamRunnerProps> = ({ elementId, onScan, setCameraError }) => {
  useEffect(() => {
    let isMounted = true;
    let qrCode: Html5Qrcode | null = null;

    const startScanner = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        let msg = 'Tu navegador no soporta el acceso a la cámara o la cámara está deshabilitada.';
        if (!window.isSecureContext) {
          msg += ' La cámara requiere un contexto seguro (HTTPS o http://127.0.0.1 / http://localhost).';
        }
        if (isMounted) setCameraError(msg);
        return;
      }

      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(elementId, {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        });
        qrCode = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15
          },
          (decodedText) => {
            if (isMounted) {
              onScan(decodedText);
            }
          },
          () => {} // ignore scan frame failures
        );

        if (!isMounted) {
          await html5QrCode.stop();
        }
      } catch (err) {
        console.error('Local camera scanner initiation failed:', err);
        if (!isMounted) return;
        const errName = err instanceof Error ? err.name : '';
        const errMsg = err instanceof Error ? err.message : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setCameraError('Permiso denegado. Por favor, permite el acceso a la cámara en el navegador.');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError('No se encontró ninguna cámara conectada en este dispositivo.');
        } else {
          setCameraError('Error al iniciar la cámara: ' + (errMsg || errName));
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (qrCode) {
        const activeQrCode = qrCode;
        if (activeQrCode.isScanning) {
          activeQrCode.stop().catch(err => console.error('Error stopping local camera scanner:', err));
        } else {
          // If it was in the middle of starting, wait a bit and stop it
          setTimeout(() => {
            if (activeQrCode.isScanning) {
              activeQrCode.stop().catch(err => console.error('Error stopping local camera scanner in timeout:', err));
            }
          }, 800);
        }
      }
    };
  }, [elementId, onScan, setCameraError]);

  return null;
};
