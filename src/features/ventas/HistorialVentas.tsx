import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import {
  rangoDeFechas,
  formatFechaHora,
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
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { useAlActivar } from '../../hooks/useAlActivar';
import { Paginator } from '../../components/Paginator';
import { fetchAll } from '../../lib/fetchAll';
import { DevolucionModal } from './DevolucionModal';
import { TicketTermico } from '../pos/TicketTermico';
import { ticketDesdeVentaGuardada, ticketHTML, type TicketData, type DetalleTicket } from '../pos/ticketModel';
import { imprimirTicket } from '../../lib/printing/qz';
import { getConfig } from '../../lib/configNegocio';

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

// Fila de vw_ventas_historial (nombre de cliente/vendedor planos).
type VentaHistorialRow = Omit<VentaHistorial, 'clientes' | 'perfiles'> & {
  cliente_nombre: string | null;
  cliente_rancho: string | null;
  vendedor_nombre: string | null;
};

const toVentaHistorial = (r: VentaHistorialRow): VentaHistorial => ({
  id: r.id, folio: r.folio, fecha: r.fecha, tipo_pago: r.tipo_pago, estado: r.estado,
  subtotal: r.subtotal, iva: r.iva, total: r.total, plazo_dias: r.plazo_dias,
  cliente_id: r.cliente_id, vendedor_id: r.vendedor_id,
  clientes: r.cliente_nombre ? { nombre: r.cliente_nombre, rancho: r.cliente_rancho } : null,
  perfiles: r.vendedor_nombre ? { nombre: r.vendedor_nombre } : null,
});

interface LineaDetalle {
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  productos: { nombre: string } | null;
}

interface DevolucionResumen {
  folio: string;
  fecha: string;
  monto_devuelto: number;
  metodo_reembolso: string | null;
}

interface KpisHist { totalVendido: number; numVentas: number; ticketPromedio: number; totalContado: number; totalCredito: number }
const EMPTY_KPIS: KpisHist = { totalVendido: 0, numVentas: 0, ticketPromedio: 0, totalContado: 0, totalCredito: 0 };

export interface HistorialVentasProps {
  rol: 'admin' | 'vendedor' | 'visitante';
  vendedorId: string;
  activo?: boolean;
}

export const HistorialVentas: React.FC<HistorialVentasProps> = ({ rol, vendedorId, activo }) => {
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
  const [devs, setDevs] = useState<Record<string, DevolucionResumen[]>>({});
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [devolviendoVenta, setDevolviendoVenta] = useState<VentaHistorialRow | null>(null);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const printSolicitado = useRef(false);

  // Imprime el ticket cuando ya está montado el portal de respaldo (tras setTicketData).
  useEffect(() => {
    if (printSolicitado.current && ticketData) {
      printSolicitado.current = false;
      const ancho = getConfig().anchoTicket;
      void imprimirTicket(ticketHTML(ticketData, ancho), ancho, () => window.print());
    }
  }, [ticketData]);

  const nombreProd = (p: unknown): string =>
    Array.isArray(p) ? ((p[0] as { nombre?: string })?.nombre ?? 'Producto') : ((p as { nombre?: string })?.nombre ?? 'Producto');

  const reimprimirTicket = async (v: VentaHistorialRow) => {
    const { data: dets } = await supabase
      .from('ventas_detalles')
      .select('cantidad, precio_unitario, subtotal, ieps, productos(nombre)')
      .eq('venta_id', v.id);
    const detalles: DetalleTicket[] = (dets ?? []).map((d) => ({
      cantidad: Number(d.cantidad),
      nombre: nombreProd(d.productos),
      precio_unitario: Number(d.precio_unitario),
      importe: Number(d.subtotal),
    }));
    const ieps = (dets ?? []).reduce((s, d) => s + Number(d.ieps ?? 0), 0);
    const td = ticketDesdeVentaGuardada(
      { folio: v.folio, fecha: formatFechaHora(v.fecha), tipo_pago: v.tipo_pago, subtotal: Number(v.subtotal), ieps, total: Number(v.total) },
      detalles,
      v.cliente_nombre,
      null,
      v.vendedor_nombre,
    );
    printSolicitado.current = true;
    setTicketData(td);
  };
  const [kpis, setKpis] = useState<KpisHist>(EMPTY_KPIS);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);

  // Construye la consulta base (filtros) sin paginar; el hook le agrega .range.
  // El conteo solo se pide cuando se necesita (lista paginada), nunca en la exportación
  // por lotes: pedir count:'exact' en cada lote del fetchAll recalcularía el total entero
  // una y otra vez. El desempate por `id` es obligatorio: la vista tiene miles de filas con
  // el mismo `fecha`, y sin un orden total las páginas/lotes de .range() se solapan y
  // pierden o duplican filas (provocaba que la exportación saliera corta).
  const construirQueryBase = useCallback((opts?: { count?: 'exact' }) => {
    const { startDate, endDate } = rangoDeFechas(periodoSel, customDesde, customHasta);
    let q = supabase
      .from('vw_ventas_historial')
      .select('*', opts?.count ? { count: opts.count } : undefined)
      .gte('fecha', startDate.toISOString())
      .lte('fecha', endDate.toISOString())
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (rol === 'vendedor') q = q.eq('vendedor_id', vendedorId);
    else if (vendedorFiltro !== 'todos') q = q.eq('vendedor_id', vendedorFiltro);
    if (estado !== 'todos') q = q.eq('estado', estado);
    if (tipoPago !== 'todos') q = q.eq('tipo_pago', tipoPago);
    const s = sanitizar(search);
    if (s) q = q.or(`folio.ilike.%${s}%,cliente_nombre.ilike.%${s}%`);
    return q;
  }, [periodoSel, customDesde, customHasta, rol, vendedorId, vendedorFiltro, estado, tipoPago, search]);

  const { data: ventas, count, page, loading, error, setPage, refetch } = useSupabasePaginated<VentaHistorialRow>(
    (from, to) => construirQueryBase({ count: 'exact' }).range(from, to),
    [periodoSel, customDesde, customHasta, rol, vendedorId, vendedorFiltro, estado, tipoPago, search],
    PAGE_SIZE,
  );

  const cargarKpis = useCallback(async () => {
    try {
      const { startDate, endDate } = rangoDeFechas(periodoSel, customDesde, customHasta);
      const s = sanitizar(search);
      const { data } = await supabase.rpc('fn_historial_ventas_kpis', {
        p_start: startDate.toISOString(),
        p_end: endDate.toISOString(),
        p_vendedor: rol === 'vendedor' ? vendedorId : (vendedorFiltro !== 'todos' ? vendedorFiltro : null),
        p_estado: estado !== 'todos' ? estado : null,
        p_tipo_pago: tipoPago !== 'todos' ? tipoPago : null,
        p_search: s || null,
      });
      if (data) setKpis(data as KpisHist);
    } catch {
      /* Los KPIs no son críticos: si la consulta falla, quedan en cero. */
    }
  }, [periodoSel, customDesde, customHasta, rol, vendedorId, vendedorFiltro, estado, tipoPago, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarKpis(); }, [cargarKpis]);

  // Lista de vendedores para el filtro (admin); son pocos perfiles.
  useEffect(() => {
    if (rol !== 'admin') return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('perfiles').select('id, nombre').order('nombre');
      if (active && data) setVendedores(data as { id: string; nombre: string }[]);
    })();
    return () => { active = false; };
  }, [rol]);

  const recargar = useCallback(() => { refetch(); cargarKpis(); }, [refetch, cargarKpis]);

  // Keep-alive: al regresar a esta pantalla, refresca la lista de ventas y los KPIs.
  useAlActivar(activo ?? true, recargar);

  const anularVenta = async (v: VentaHistorialRow) => {
    if (!confirm(`¿Anular la venta ${v.folio}? Se repondrá el inventario y se revertirá su efecto en caja/crédito. No se puede deshacer.`)) return;
    setAnulandoId(v.id);
    try {
      const { error: e } = await supabase.rpc('fn_cancelar_venta', { p_venta_id: v.id });
      if (e) throw e;
      recargar();
      toast.success(`Venta ${v.folio} anulada y revertida.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anular la venta.');
    } finally {
      setAnulandoId(null);
    }
  };

  const toggleSel = (id: string) => setSeleccion(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todasVisiblesSeleccionadas = ventas.length > 0 && ventas.every(v => seleccion.has(v.id));
  const toggleTodas = () => setSeleccion(prev => {
    if (todasVisiblesSeleccionadas) {
      const next = new Set(prev);
      ventas.forEach(v => next.delete(v.id));
      return next;
    }
    return new Set([...prev, ...ventas.map(v => v.id)]);
  });

  // Para exportar: trae TODO el conjunto filtrado (en lotes); si hay selección, filtra.
  const obtenerVentasExport = async (): Promise<VentaHistorial[]> => {
    const rows = await fetchAll<VentaHistorialRow>((from, to) => construirQueryBase().range(from, to));
    let vh = rows.map(toVentaHistorial);
    if (seleccion.size > 0) vh = vh.filter(v => seleccion.has(v.id));
    return vh;
  };

  const cargarDetalleYDevs = async (ventaId: string) => {
    const [{ data: det }, { data: dv }] = await Promise.all([
      supabase.from('ventas_detalles')
        .select('cantidad, precio_unitario, subtotal, productos(nombre)')
        .eq('venta_id', ventaId),
      supabase.from('devoluciones')
        .select('folio, fecha, monto_devuelto, metodo_reembolso')
        .eq('venta_id', ventaId)
        .order('fecha', { ascending: true }),
    ]);
    setDetalles(prev => ({ ...prev, [ventaId]: (det as unknown as LineaDetalle[]) || [] }));
    setDevs(prev => ({ ...prev, [ventaId]: (dv as unknown as DevolucionResumen[]) || [] }));
  };

  const abrirDetalle = async (ventaId: string) => {
    setExpandedId(prev => (prev === ventaId ? null : ventaId));
    if (detalles[ventaId]) return;
    await cargarDetalleYDevs(ventaId);
  };

  const onDevolucionRegistrada = (ventaId: string) => {
    setDevolviendoVenta(null);
    void cargarDetalleYDevs(ventaId); // refresca detalle/devoluciones de la fila abierta
    recargar();                        // refresca lista (estado/badge) y KPIs
  };

  const etiquetaPeriodo = (): { desde: string; hasta: string } => {
    const { startDate, endDate } = rangoDeFechas(periodoSel, customDesde, customHasta);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    return { desde: f(startDate), hasta: f(endDate) };
  };

  const handleExportExcel = async () => {
    const datos = await obtenerVentasExport();
    const { desde, hasta } = etiquetaPeriodo();
    exportarHistorialXLSX({ columnas: COLUMNAS_EXPORT, filas: construirFilasExport(datos), total: totalDeExport(datos), desde, hasta });
  };

  const handleExportPDF = async (modo: 'descargar' | 'imprimir' = 'descargar') => {
    const datos = await obtenerVentasExport();
    const { desde, hasta } = etiquetaPeriodo();
    void exportarHistorialPDF({
      columnas: COLUMNAS_EXPORT, filas: construirFilasExport(datos), total: totalDeExport(datos), desde, hasta,
      subtitulo: seleccion.size > 0 ? `${seleccion.size} ventas seleccionadas` : undefined,
    }, modo);
  };

  return (
    <>
      <style>{`
        .hv-select { height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); padding: 0 12px; font-size: 14px; color: var(--ink); cursor: pointer; outline: none; }
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
        <div data-tour="hv-busqueda" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
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
            <option value="devuelta">Devuelta</option>
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
            {seleccion.size > 0 ? `${seleccion.size} seleccionadas` : `${count.toLocaleString('es-MX')} ventas`}
          </span>
          <div data-tour="hv-export" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleExportExcel} disabled={count === 0}>
              <Icon name="download" size={16} /> Exportar Excel
            </button>
            <button className="btn btn-secondary" onClick={() => handleExportPDF('descargar')} disabled={count === 0}>
              <Icon name="download" size={16} /> Exportar PDF
            </button>
            <button className="btn btn-secondary" onClick={() => handleExportPDF('imprimir')} disabled={count === 0}>
              <Icon name="printer" size={16} /> Imprimir
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando ventas…</div>
          ) : ventas.length === 0 ? (
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
                  {ventas.map((v, i) => (
                    <React.Fragment key={v.id}>
                      <tr className="hv-row-main" data-tour={i === 0 ? 'hv-fila' : undefined} onClick={() => abrirDetalle(v.id)}>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={seleccion.has(v.id)} onChange={() => toggleSel(v.id)} aria-label={`Seleccionar ${v.folio}`} />
                        </td>
                        <td className="mono" style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', fontWeight: 600 }}>{v.folio}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{formatFechaHora(v.fecha)}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{v.cliente_nombre ?? 'Mostrador'}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{v.vendedor_nombre ?? '—'}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>{ETIQUETA_TIPO_PAGO[v.tipo_pago] ?? v.tipo_pago}</td>
                        <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }}>
                          {ETIQUETA_ESTADO[v.estado] ?? v.estado}
                          {v.tiene_devolucion_parcial && v.estado !== 'devuelta' && (
                            <span title="Esta venta tiene una devolución parcial" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'var(--amber-soft)', color: 'oklch(0.52 0.13 75)', whiteSpace: 'nowrap' }}>dev. parcial</span>
                          )}
                        </td>
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
                            {(devs[v.id]?.length ?? 0) > 0 && (
                              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 4 }}>Devoluciones</div>
                                {devs[v.id].map((d, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                    <span>#{d.folio} · {formatFechaHora(d.fecha)} · {d.metodo_reembolso === 'credito' ? 'a la nota' : (d.metodo_reembolso ?? '—')}</span>
                                    <span className="num" style={{ color: 'var(--red)', fontWeight: 600 }}>−{fmtMXN(Number(d.monto_devuelto))}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div data-tour={i === 0 ? 'hv-acciones' : undefined} style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              <button type="button" className="btn btn-secondary"
                                style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                                onClick={() => reimprimirTicket(v)}>
                                <Icon name="printer" size={14} /> Reimprimir ticket
                              </button>
                              {v.estado !== 'cancelada' && v.estado !== 'devuelta' && (
                                <>
                                  <button type="button" className="btn btn-secondary"
                                    style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                                    onClick={() => setDevolviendoVenta(v)}>
                                    <Icon name="arrow-right" size={14} /> Devolver
                                  </button>
                                  {(devs[v.id]?.length ?? 0) === 0 && (
                                    <button type="button" className="btn btn-secondary"
                                      style={{ height: 32, padding: '0 12px', fontSize: 12, color: 'var(--red)', borderColor: 'oklch(0.58 0.16 25 / 0.3)' }}
                                      disabled={anulandoId === v.id}
                                      onClick={() => anularVenta(v)}>
                                      <Icon name="trash" size={14} /> {anulandoId === v.id ? 'Anulando…' : 'Anular venta'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '0 8px' }}>
                <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
              </div>
            </div>
          )}
        </div>
      </div>

      {devolviendoVenta && (
        <DevolucionModal
          venta={{
            id: devolviendoVenta.id,
            folio: devolviendoVenta.folio,
            tipo_pago: devolviendoVenta.tipo_pago,
            total: Number(devolviendoVenta.total),
          }}
          onClose={() => setDevolviendoVenta(null)}
          onSuccess={() => onDevolucionRegistrada(devolviendoVenta.id)}
        />
      )}

      {ticketData && <TicketTermico data={ticketData} anchoMm={getConfig().anchoTicket} />}
    </>
  );
};
