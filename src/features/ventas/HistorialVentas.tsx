import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import {
  rangoDeFechas,
  filtrarVentas,
  calcularKpis,
  formatFechaHora,
  nombreCliente,
  ETIQUETA_TIPO_PAGO,
  ETIQUETA_ESTADO,
  COLUMNAS_EXPORT,
  construirFilasExport,
  totalDeExport,
  type PeriodoOpcion,
  type VentaHistorial,
} from './historialModel';
import { exportarHistorialXLSX } from '../../lib/excel/historialVentasXLSX';
import { exportarHistorialPDF } from '../../lib/pdf/historialVentasPDF';

const SELECT_VENTAS =
  'id, folio, fecha, tipo_pago, estado, subtotal, iva, total, plazo_dias, cliente_id, vendedor_id, ' +
  'clientes:cliente_id(nombre, rancho), perfiles:vendedor_id(nombre)';

interface LineaDetalle {
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  productos: { nombre: string } | null;
}

export interface HistorialVentasProps {
  rol: 'admin' | 'vendedor' | 'visitante';
  vendedorId: string;
}

export const HistorialVentas: React.FC<HistorialVentasProps> = ({ rol, vendedorId }) => {
  const [ventas, setVentas] = useState<VentaHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodoSel, setPeriodoSel] = useState<PeriodoOpcion>('mes');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [search, setSearch] = useState('');
  const [tipoPago, setTipoPago] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, LineaDetalle[]>>({});
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = rangoDeFechas(periodoSel, customDesde, customHasta);
      let query = supabase
        .from('ventas')
        .select(SELECT_VENTAS)
        .gte('fecha', startDate.toISOString())
        .lte('fecha', endDate.toISOString())
        .order('fecha', { ascending: false });
      if (rol === 'vendedor') query = query.eq('vendedor_id', vendedorId);
      const { data, error: err } = await query;
      if (err) throw err;
      setVentas((data as unknown as VentaHistorial[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las ventas.');
    } finally {
      setLoading(false);
    }
  }, [periodoSel, customDesde, customHasta, rol, vendedorId]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  const anularVenta = async (v: VentaHistorial) => {
    if (!confirm(`¿Anular la venta ${v.folio}? Se repondrá el inventario y se revertirá su efecto en caja/crédito. No se puede deshacer.`)) return;
    setAnulandoId(v.id);
    try {
      const { error } = await supabase.rpc('fn_cancelar_venta', { p_venta_id: v.id });
      if (error) throw error;
      await fetchVentas();
      toast.success(`Venta ${v.folio} anulada y revertida.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anular la venta.');
    } finally {
      setAnulandoId(null);
    }
  };

  const ventasFiltradas = filtrarVentas(ventas, { search, tipoPago, estado, vendedorId: vendedorFiltro });
  const kpis = calcularKpis(ventasFiltradas);
  const vendedores = Array.from(
    new Map(ventas.filter(v => v.perfiles).map(v => [v.vendedor_id, v.perfiles!.nombre])).entries(),
  ).map(([id, nombre]) => ({ id, nombre }));

  const toggleSel = (id: string) => setSeleccion(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todasVisiblesSeleccionadas = ventasFiltradas.length > 0 && ventasFiltradas.every(v => seleccion.has(v.id));
  const toggleTodas = () => setSeleccion(() =>
    todasVisiblesSeleccionadas ? new Set() : new Set(ventasFiltradas.map(v => v.id)));
  const ventasParaExportar = (): VentaHistorial[] =>
    seleccion.size === 0 ? ventasFiltradas : ventasFiltradas.filter(v => seleccion.has(v.id));

  const abrirDetalle = async (ventaId: string) => {
    setExpandedId(prev => (prev === ventaId ? null : ventaId));
    if (detalles[ventaId]) return;
    const { data } = await supabase
      .from('ventas_detalles')
      .select('cantidad, precio_unitario, subtotal, productos(nombre)')
      .eq('venta_id', ventaId);
    setDetalles(prev => ({ ...prev, [ventaId]: (data as unknown as LineaDetalle[]) || [] }));
  };

  const etiquetaPeriodo = (): { desde: string; hasta: string } => {
    const { startDate, endDate } = rangoDeFechas(periodoSel, customDesde, customHasta);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    return { desde: f(startDate), hasta: f(endDate) };
  };

  const handleExportExcel = () => {
    const datos = ventasParaExportar();
    const { desde, hasta } = etiquetaPeriodo();
    exportarHistorialXLSX({
      columnas: COLUMNAS_EXPORT,
      filas: construirFilasExport(datos),
      total: totalDeExport(datos),
      desde,
      hasta,
    });
  };

  const handleExportPDF = (modo: 'descargar' | 'imprimir' = 'descargar') => {
    const datos = ventasParaExportar();
    const { desde, hasta } = etiquetaPeriodo();
    void exportarHistorialPDF({
      columnas: COLUMNAS_EXPORT,
      filas: construirFilasExport(datos),
      total: totalDeExport(datos),
      desde,
      hasta,
      subtitulo: seleccion.size > 0 ? `${seleccion.size} ventas seleccionadas` : undefined,
    }, modo);
  };

  return (
    <>
      <style>{`
        .hv-select {
          height: 44px; border-radius: 12px; border: 1px solid var(--line);
          background: var(--surface); padding: 0 12px; font-size: 14px;
          color: var(--ink); cursor: pointer; outline: none;
        }
        .hv-row-main { cursor: pointer; }
        .hv-row-main:hover { background: var(--surface-2); }
      `}</style>

      <Topbar title="Historial de ventas" subtitle="Consulta y auditoría de ventas" />

      <div className="content">
        {error && (
          <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={16} /> <span>{error}</span>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Total vendido</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{fmtMXN(kpis.totalVendido)}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>N.º de ventas</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{kpis.numVentas}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Ticket promedio</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{fmtMXN(kpis.ticketPromedio)}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Contado / Crédito</div>
            <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>{fmtMXN(kpis.totalContado)} / {fmtMXN(kpis.totalCredito)}</div>
          </div>
        </div>

        {/* Periodo + rango personalizado */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', padding: 4, borderRadius: 9 }}>
            {([['hoy', 'Hoy'], ['7dias', '7 días'], ['mes', 'Mes'], ['ano', 'Año']] as [PeriodoOpcion, string][]).map(([id, label]) => (
              <button key={id} className={`seg ${periodoSel === id ? 'active' : ''}`} onClick={() => setPeriodoSel(id)}>{label}</button>
            ))}
          </div>
          <input type="date" className="input" value={customDesde}
            onChange={e => { setCustomDesde(e.target.value); setPeriodoSel('personalizado'); }} />
          <span style={{ color: 'var(--muted)' }}>a</span>
          <input type="date" className="input" value={customHasta}
            onChange={e => { setCustomHasta(e.target.value); setPeriodoSel('personalizado'); }} />
        </div>

        {/* Búsqueda + chips */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '0 14px', height: 44 }}>
            <Icon name="search" size={18} color="var(--muted)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por folio o cliente…"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 14 }} />
          </div>
          <select className="hv-select" value={tipoPago} onChange={e => setTipoPago(e.target.value)}>
            <option value="todos">Todos los pagos</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="debito">Débito</option>
            <option value="transferencia">Transferencia</option>
            <option value="credito">Crédito</option>
          </select>
          <select className="hv-select" value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="cobrada">Cobrada</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelada">Cancelada</option>
          </select>
          {rol === 'admin' && (
            <select className="hv-select" value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}>
              <option value="todos">Todos los vendedores</option>
              {vendedores.map(vd => <option key={vd.id} value={vd.id}>{vd.nombre}</option>)}
            </select>
          )}
        </div>

        {/* Barra de acciones */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {seleccion.size > 0 ? `${seleccion.size} seleccionadas` : `${ventasFiltradas.length} ventas`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleExportExcel} disabled={ventasFiltradas.length === 0}>
              <Icon name="download" size={16} /> Exportar Excel
            </button>
            <button className="btn btn-secondary" onClick={() => handleExportPDF('descargar')} disabled={ventasFiltradas.length === 0}>
              <Icon name="download" size={16} /> Exportar PDF
            </button>
            <button className="btn btn-secondary" onClick={() => handleExportPDF('imprimir')} disabled={ventasFiltradas.length === 0}>
              <Icon name="printer" size={16} /> Imprimir
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando ventas…</div>
          ) : ventasFiltradas.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No hay ventas que coincidan.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', background: 'var(--surface-2)' }}>
                    <th style={{ width: 36, padding: '12px 8px' }}>
                      <input type="checkbox" checked={todasVisiblesSeleccionadas} onChange={toggleTodas} aria-label="Seleccionar todo" />
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Folio</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Fecha</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Vendedor</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Pago</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Estado</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasFiltradas.map(v => (
                    <React.Fragment key={v.id}>
                      <tr className="hv-row-main" onClick={() => abrirDetalle(v.id)}>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={seleccion.has(v.id)} onChange={() => toggleSel(v.id)} aria-label={`Seleccionar ${v.folio}`} />
                        </td>
                        <td className="mono" style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', fontWeight: 600 }}>{v.folio}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{formatFechaHora(v.fecha)}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{nombreCliente(v)}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{v.perfiles?.nombre ?? '—'}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{ETIQUETA_TIPO_PAGO[v.tipo_pago] ?? v.tipo_pago}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{ETIQUETA_ESTADO[v.estado] ?? v.estado}</td>
                        <td className="num" style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', textAlign: 'right' }}>{fmtMXN(Number(v.total))}</td>
                      </tr>
                      {expandedId === v.id && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--surface-2)', padding: 16, borderBottom: '1px solid var(--line-2)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>Productos</div>
                            {(detalles[v.id] ?? []).length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando detalle…</div>
                            ) : (
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead><tr style={{ color: 'var(--muted)' }}>
                                  <th style={{ textAlign: 'left', padding: 6 }}>Producto</th>
                                  <th style={{ textAlign: 'right', padding: 6 }}>Cantidad</th>
                                  <th style={{ textAlign: 'right', padding: 6 }}>P. Unit.</th>
                                  <th style={{ textAlign: 'right', padding: 6 }}>Subtotal</th>
                                </tr></thead>
                                <tbody>
                                  {detalles[v.id].map((d, i) => (
                                    <tr key={i}>
                                      <td style={{ padding: 6 }}>{d.productos?.nombre ?? 'Producto'}</td>
                                      <td className="num" style={{ padding: 6, textAlign: 'right' }}>{d.cantidad}</td>
                                      <td className="num" style={{ padding: 6, textAlign: 'right' }}>{fmtMXN(Number(d.precio_unitario))}</td>
                                      <td className="num" style={{ padding: 6, textAlign: 'right' }}>{fmtMXN(Number(d.subtotal))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {v.tipo_pago === 'credito' && v.plazo_dias != null && (
                              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Plazo de crédito: {v.plazo_dias} días</div>
                            )}
                            {v.estado !== 'cancelada' && (
                              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary"
                                  style={{ height: 32, padding: '0 12px', fontSize: 12, color: 'var(--red)', borderColor: 'oklch(0.58 0.16 25 / 0.3)' }}
                                  disabled={anulandoId === v.id}
                                  onClick={() => anularVenta(v)}>
                                  <Icon name="trash" size={14} /> {anulandoId === v.id ? 'Anulando…' : 'Anular venta'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
