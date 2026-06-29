import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import type { PagoCredito } from '../../types';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { RegistrarPagoModal } from '../clientes/RegistrarPagoModal';
import { exportarNotaPagarePDF } from '../../lib/pdf/notaCreditoPagarePDF';
import { useCan } from '../auth/useCan';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { Paginator } from '../../components/Paginator';
import { useAlActivar } from '../../hooks/useAlActivar';
import { useNavegacionLista } from '../../hooks/useNavegacionLista';
import { useAtajosPantalla } from '../../hooks/useAtajosPantalla';

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

// Fila de la vista vw_creditos_resumen (saldo/atraso ya calculados en SQL).
interface CreditoRow {
  id: string; folio: string; fecha: string; total: number; plazo_dias: number | null;
  estado: string; cliente_id: string | null; numero_cliente: number | null;
  cliente_nombre: string | null; cliente_rancho: string | null; cliente_telefono: string | null;
  dias_credito: number | null; abonado: number; saldo: number; fecha_venc: string; atraso: number;
}

type Status = 'VENCIDA' | 'AL CORRIENTE' | 'PAGADA';
const deriveStatus = (r: CreditoRow): Status => {
  if (r.estado === 'cancelada' || Number(r.saldo) <= 0) return 'PAGADA';
  if (Number(r.atraso) > 0) return 'VENCIDA';
  return 'AL CORRIENTE';
};

interface CreditosKpis { totalEnCartera: number; totalVencido: number; totalClientesDeudores: number }

interface CreditosListProps { activo?: boolean }

export const CreditosList: React.FC<CreditosListProps> = ({ activo }) => {
  const can = useCan();
  const puedeGestionar = can('gestionar_clientes'); // perfiles de solo consulta ven, pero no abonan

  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('todos'); // todos | pendientes | al_corriente | vencidas | pagadas

  const [expandedVentaId, setExpandedVentaId] = useState<string | null>(null);
  const [pagosPorVenta, setPagosPorVenta] = useState<Record<string, PagoCredito[]>>({});
  const [kpis, setKpis] = useState<CreditosKpis>({ totalEnCartera: 0, totalVencido: 0, totalClientesDeudores: 0 });

  // RegistrarPagoModal integration
  const [isAbonoOpen, setIsAbonoOpen] = useState<boolean>(false);
  const [abonoVentaId, setAbonoVentaId] = useState<string>('');
  const [abonoVentaFolio, setAbonoVentaFolio] = useState<string>('');
  const [abonoVentaSaldo, setAbonoVentaSaldo] = useState<number>(0);

  // Delete payment confirmation modal state
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [confirmDeleteVentaId, setConfirmDeleteVentaId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const getLocalDate = (dateInput?: string | Date) => {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return new Date(dateInput);
  };
  const formatDDMMYYYY = (dateInput?: string | Date) => {
    if (!dateInput) return '';
    const d = getLocalDate(dateInput);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const cargarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('fn_creditos_kpis');
    if (data) setKpis(data as CreditosKpis);
  }, []);

  const { data: creditos, count, page, loading, error, setPage, refetch } = useSupabasePaginated<CreditoRow>(
    async (from, to) => {
      // Listado paginado en servidor. fn_creditos_listado pagina las notas a crédito
      // con índices parciales y deriva el saldo de ventas.abonado (materializado),
      // sin re-sumar los pagos de toda la cartera. Devuelve { rows, total }.
      const { data, error } = await supabase.rpc('fn_creditos_listado', {
        p_busqueda: sanitizar(search),
        p_filtro: filterStatus,
        p_offset: from,
        p_limit: to - from + 1,
      });
      if (error) return { data: null, count: null, error };
      const r = (data ?? { rows: [], total: 0 }) as { rows: CreditoRow[]; total: number };
      return { data: r.rows, count: r.total, error: null };
    },
    [search, filterStatus],
    PAGE_SIZE,
  );

  // Keep-alive: refrescar al reactivar la pantalla (conserva búsqueda/filtros de la UI).
  useAlActivar(activo ?? true, refetch);

  const enfocarBuscador = () => (document.activeElement?.closest('[data-keepalive]') ?? document).querySelector<HTMLElement>('[data-atajo="buscar"]')?.focus();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarKpis(); }, [cargarKpis]);

  const recargar = useCallback(() => { refetch(); cargarKpis(); }, [refetch, cargarKpis]);

  const cargarPagos = useCallback(async (ventaId: string) => {
    const { data } = await supabase
      .from('pagos_credito')
      .select('id, venta_id, monto, metodo, fecha, folio_pago')
      .eq('venta_id', ventaId)
      .order('fecha', { ascending: true });
    setPagosPorVenta(prev => ({ ...prev, [ventaId]: (data as PagoCredito[]) ?? [] }));
  }, []);

  const toggleRowExpand = (ventaId: string) => {
    const next = expandedVentaId === ventaId ? null : ventaId;
    setExpandedVentaId(next);
    if (next && !pagosPorVenta[ventaId]) void cargarPagos(ventaId);
  };

  const handleOpenAbono = (ventaId: string, folio: string, saldo: number) => {
    setAbonoVentaId(ventaId);
    setAbonoVentaFolio(folio);
    setAbonoVentaSaldo(saldo);
    setIsAbonoOpen(true);
  };

  // Navegación por teclado de la lista (flechas/Enter/Escape) sobre el <tbody>.
  const onListKeyDown = useNavegacionLista(creditos.length, {
    onActivar: (i) => { const c = creditos[i]; if (c) toggleRowExpand(c.id); },
    onEscape: enfocarBuscador,
  });

  // Atajo "p": registrar pago de la fila enfocada.
  useAtajosPantalla(activo ?? true, {
    p: () => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.matches('[data-nav-index]')) {
        const c = creditos[Number(el.getAttribute('data-nav-index'))];
        if (c) handleOpenAbono(c.id, c.folio, Number(c.saldo));
      }
    },
  });

  const handleAbonoSuccess = () => {
    if (abonoVentaId) void cargarPagos(abonoVentaId);
    recargar();
  };

  const handleCancelPayment = async (paymentId: string, ventaId: string | null) => {
    setIsDeleting(true);
    try {
      const { error: deleteError } = await supabase.from('pagos_credito').delete().eq('id', paymentId);
      if (deleteError) throw deleteError;
      setConfirmDeletePaymentId(null);
      setConfirmDeleteVentaId(null);
      if (ventaId) void cargarPagos(ventaId);
      recargar();
    } catch (err) {
      console.error('Error al cancelar el pago:', err);
      toast.error(err instanceof Error ? err.message : 'Error al procesar la cancelación del pago.');
    } finally {
      setIsDeleting(false);
    }
  };

  const descargarNotaPagare = async (c: CreditoRow, modo: 'descargar' | 'imprimir' = 'descargar') => {
    const { data } = await supabase
      .from('ventas_detalles')
      .select('cantidad, precio_unitario, subtotal, ieps, productos(nombre, unidad, tasa_iva, tasa_ieps)')
      .eq('venta_id', c.id);
    const dets = (data as {
      cantidad: number; precio_unitario: number; subtotal: number; ieps: number | null;
      productos: { nombre: string; unidad: string | null; tasa_iva: number | null; tasa_ieps: number | null } | null;
    }[] | null) ?? [];
    const partidas = dets.map((d) => ({
      cantidad: d.cantidad,
      unidad: d.productos?.unidad ?? '',
      descripcion: d.productos?.nombre ?? 'Producto',
      ivaPct: Math.round(Number(d.productos?.tasa_iva ?? 0) * 100),
      iepsPct: Math.round(Number(d.productos?.tasa_ieps ?? 0) * 100),
      pu: d.precio_unitario,
      importe: d.subtotal,
    }));
    const subtotal = dets.reduce((s, d) => s + Number(d.subtotal), 0);
    const ieps = dets.reduce((s, d) => s + Number(d.ieps ?? 0), 0);
    const iva = dets.reduce((s, d) => s + Number(d.subtotal) * Number(d.productos?.tasa_iva ?? 0), 0);
    await exportarNotaPagarePDF({
      folio: c.folio,
      claveCliente: c.numero_cliente != null ? String(c.numero_cliente) : '—',
      cliente: { nombre: c.cliente_nombre ?? 'Cliente', direccion: c.cliente_rancho ?? undefined },
      fechaEmision: formatDDMMYYYY(c.fecha),
      fechaLimite: formatDDMMYYYY(c.fecha_venc),
      partidas,
      totalPiezas: partidas.reduce((s, p) => s + Number(p.cantidad), 0),
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      ieps: Math.round(ieps * 100) / 100,
      total: Number(c.total),
    }, modo);
  };

  return (
    <>
      <style>{`
        .creditos-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .creditos-kpi-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--shadow-sm); }
        .creditos-kpi-icon-box { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
        .creditos-kpi-icon-box.cartera { background: var(--green-soft); color: var(--green); }
        .creditos-kpi-icon-box.vencido { background: var(--red-soft); color: var(--red); }
        .creditos-kpi-icon-box.deudores { background: oklch(0.96 0.03 220); color: oklch(0.5 0.15 220); }
        .creditos-kpi-content { display: flex; flex-direction: column; gap: 2px; }
        .creditos-kpi-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .creditos-kpi-value { font-size: 20px; font-weight: 800; color: var(--ink); }
        .creditos-filter-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .creditos-search-container { flex: 1; min-width: 250px; display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 0 14px; height: 48px; }
        .creditos-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .creditos-status-badge.vencida { background: var(--red-soft); color: var(--red); }
        .creditos-status-badge.al_corriente { background: var(--green-soft); color: var(--green-2); }
        .creditos-status-badge.pagada { background: var(--line-2); color: var(--muted); }
        .creditos-row-main { cursor: pointer; transition: background 0.15s ease; }
        .creditos-row-main:hover { background: var(--surface-2); }
        .creditos-row-expanded { background: var(--surface-3, oklch(0.98 0.005 0)); }
        .creditos-expanded-container { padding: 16px 24px; border-left: 3px solid var(--green); }
        .creditos-payments-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
        .creditos-payments-table th { background: var(--surface-2); padding: 8px 12px; font-weight: 600; color: var(--muted); text-align: left; border-bottom: 1px solid var(--line); }
        .creditos-payments-table td { padding: 10px 12px; border-bottom: 1px solid var(--line-2); color: var(--ink-2); vertical-align: middle; }
        .cancel-payment-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; transition: all 0.2s; }
        .cancel-payment-btn:hover { color: var(--red); background: var(--red-soft); border-color: oklch(0.58 0.16 25 / 0.1); }
        @media (max-width: 768px) { .creditos-kpi-grid { grid-template-columns: 1fr; } .creditos-filter-row { flex-direction: column; align-items: stretch; } }
      `}</style>

      <Topbar
        title="Notas a Crédito"
        subtitle={loading ? 'Cargando cartera...' : `${count.toLocaleString('es-MX')} notas a crédito en sistema`}
      >
        <button className="btn btn-secondary" onClick={recargar} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
      </Topbar>

      <div className="content">
        {error && (
          <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* KPI METRICS */}
        <div className="creditos-kpi-grid">
          <div className="creditos-kpi-card">
            <div className="creditos-kpi-icon-box cartera"><Icon name="credit" size={24} /></div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label">Total en Cartera</span>
              <span className="creditos-kpi-value num">{fmtMXN(kpis.totalEnCartera)}</span>
            </div>
          </div>
          <div className="creditos-kpi-card">
            <div className="creditos-kpi-icon-box vencido"><Icon name="alert" size={24} /></div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label" style={{ color: kpis.totalVencido > 0 ? 'var(--red)' : 'var(--muted)' }}>Total Vencido</span>
              <span className="creditos-kpi-value num" style={{ color: kpis.totalVencido > 0 ? 'var(--red)' : 'var(--ink)' }}>{fmtMXN(kpis.totalVencido)}</span>
            </div>
          </div>
          <div className="creditos-kpi-card">
            <div className="creditos-kpi-icon-box deudores"><Icon name="users" size={24} /></div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label">Clientes Deudores</span>
              <span className="creditos-kpi-value num">{kpis.totalClientesDeudores}</span>
            </div>
          </div>
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="creditos-filter-row">
          <div className="creditos-search-container">
            <Icon name="search" size={18} color="var(--muted)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('[data-keepalive]') ?? document).querySelector<HTMLElement>('[data-nav-index="0"]')?.focus(); } }}
              data-atajo="buscar"
              placeholder="Buscar por cliente, rancho o folio de remisión..."
              style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--muted)', padding: 4, background: 'transparent', border: 0, cursor: 'pointer' }}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendientes', label: 'Pendientes' },
              { id: 'al_corriente', label: 'Al corriente' },
              { id: 'vencidas', label: 'Vencidas' },
              { id: 'pagadas', label: 'Pagadas' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterStatus(t.id)}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 0, cursor: 'pointer',
                  background: filterStatus === t.id ? 'var(--surface)' : 'transparent',
                  color: filterStatus === t.id ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: filterStatus === t.id ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* LIST TABLE */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando notas a crédito...</div>
          ) : creditos.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              {search || filterStatus !== 'todos' ? 'No se encontraron créditos que coincidan con la búsqueda.' : 'No hay notas a crédito registradas.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)' }}>
                    <th style={{ width: 40 }}></th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Folio</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Cliente</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 110 }}>Fecha Venta</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 110 }}>Vencimiento</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>Total</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>Saldo Restante</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>Estado</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 140 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody onKeyDown={onListKeyDown}>
                  {creditos.map((c, i) => {
                    const isExpanded = expandedVentaId === c.id;
                    const status = deriveStatus(c);
                    const saldo = Number(c.saldo);
                    const pagos = pagosPorVenta[c.id];
                    return (
                      <React.Fragment key={c.id}>
                        <tr className={`creditos-row-main ${isExpanded ? 'creditos-row-expanded' : ''}`} tabIndex={0} data-nav-index={i} onClick={() => toggleRowExpand(c.id)}>
                          <td style={{ textAlign: 'center', padding: '12px 0 12px 12px', borderBottom: '1px solid var(--line-2)' }}>
                            <Icon name="chevron-down" size={16} color="var(--muted)" style={{ display: 'block', margin: 'auto', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                          </td>
                          <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', fontWeight: 600 }} className="mono">{c.folio}</td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                {c.cliente_nombre || <span style={{ color: 'var(--muted-2)' }}>Cliente Desconocido</span>}
                              </div>
                              {c.cliente_rancho && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Rancho: {c.cliente_rancho}</div>}
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}>{formatDDMMYYYY(c.fecha)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)', fontWeight: status === 'VENCIDA' ? 'bold' : 'normal', color: status === 'VENCIDA' ? 'var(--red)' : 'inherit' }}>{formatDDMMYYYY(c.fecha_venc)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">{fmtMXN(Number(c.total))}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">
                            <span style={{ fontWeight: saldo > 0 ? 700 : 500, color: saldo > 0 ? 'var(--red)' : 'var(--muted)' }}>
                              {saldo > 0 ? fmtMXN(saldo) : 'Liquidada'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}>
                            <span className={`creditos-status-badge ${status.toLowerCase().replace(' ', '_')}`}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'VENCIDA' ? 'var(--red)' : status === 'AL CORRIENTE' ? 'var(--green)' : 'var(--muted-2)', display: 'inline-block', marginRight: 6 }} />
                              {status === 'AL CORRIENTE' ? 'Al corriente' : status === 'VENCIDA' ? 'Vencida' : 'Pagada'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }} onClick={(e) => e.stopPropagation()}>
                            {saldo > 0 ? (
                              puedeGestionar ? (
                                <button data-tour="cred-cobrar" className="btn btn-primary" style={{ height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6, gap: 4 }} onClick={() => handleOpenAbono(c.id, c.folio, saldo)}>
                                  <Icon name="cash" size={14} />Registrar Pago
                                </button>
                              ) : (<span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>)
                            ) : (
                              <button className="btn btn-secondary" style={{ height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6, opacity: 0.5, cursor: 'not-allowed' }} disabled>
                                <Icon name="check" size={14} />Liquidada
                              </button>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="creditos-row-expanded">
                            <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--line-2)' }}>
                              <div className="creditos-expanded-container">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--ink-2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Icon name="clock" size={16} color="var(--green)" />Historial de Pagos Registrados
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }} onClick={() => descargarNotaPagare(c, 'descargar')} title="Descargar nota/pagaré (PDF)">
                                      <Icon name="download" size={12} />Nota/Pagaré
                                    </button>
                                    <button className="btn btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }} onClick={() => descargarNotaPagare(c, 'imprimir')} title="Imprimir nota/pagaré">
                                      <Icon name="printer" size={12} />Imprimir
                                    </button>
                                    {puedeGestionar && saldo > 0 && (
                                      <button className="btn btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }} onClick={() => handleOpenAbono(c.id, c.folio, saldo)}>
                                        <Icon name="plus" size={12} />Registrar Abono
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {pagos === undefined ? (
                                  <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--muted)' }}>Cargando pagos…</div>
                                ) : pagos.length > 0 ? (
                                  <table className="creditos-payments-table">
                                    <thead>
                                      <tr>
                                        <th>Folio Pago</th><th>Fecha y Hora</th><th>Método</th>
                                        <th style={{ textAlign: 'right' }}>Monto Abonado</th>
                                        <th style={{ textAlign: 'center', width: 80 }}>Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {pagos.map((pago) => (
                                        <tr key={pago.id}>
                                          <td className="mono" style={{ fontWeight: 600 }}>{pago.folio_pago}</td>
                                          <td>{formatDDMMYYYY(pago.fecha)} {pago.fecha ? new Date(pago.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</td>
                                          <td style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>
                                            <span style={{ padding: '2px 6px', borderRadius: 4, background: pago.metodo === 'transferencia' ? 'oklch(0.96 0.03 220)' : 'oklch(0.96 0.03 140)', color: pago.metodo === 'transferencia' ? 'oklch(0.5 0.15 220)' : 'oklch(0.4 0.15 140)' }}>
                                              {pago.metodo || 'efectivo'}
                                            </span>
                                          </td>
                                          <td style={{ textAlign: 'right', fontWeight: 'bold' }} className="num">{fmtMXN(Number(pago.monto))}</td>
                                          <td style={{ textAlign: 'center' }}>
                                            {puedeGestionar ? (
                                              <button type="button" className="cancel-payment-btn" title="Cancelar/Eliminar este abono" onClick={() => { setConfirmDeletePaymentId(pago.id); setConfirmDeleteVentaId(c.id); }}>
                                                <Icon name="trash" size={14} />
                                              </button>
                                            ) : (<span style={{ color: 'var(--muted)' }}>—</span>)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                                    No se han registrado pagos para esta nota de venta a crédito.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '0 16px' }}>
                <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONFIRM DELETE MODAL */}
      {confirmDeletePaymentId && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
              <Icon name="alert" size={24} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>¿Cancelar este Pago?</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Al cancelar este pago, el monto abonado volverá a sumarse al <strong>saldo deudor</strong> del cliente.
              Si la venta había sido marcada como cobrada, regresará a estar <strong>pendiente</strong>.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" disabled={isDeleting} onClick={() => { setConfirmDeletePaymentId(null); setConfirmDeleteVentaId(null); }}>
                No, mantener pago
              </button>
              <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={isDeleting}
                onClick={() => handleCancelPayment(confirmDeletePaymentId, confirmDeleteVentaId)}>
                {isDeleting ? 'Cancelando...' : 'Sí, cancelar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTRAR PAGO MODAL */}
      <RegistrarPagoModal
        isOpen={isAbonoOpen}
        ventaId={abonoVentaId}
        folio={abonoVentaFolio}
        saldo={abonoVentaSaldo}
        onClose={() => setIsAbonoOpen(false)}
        onSuccess={handleAbonoSuccess}
      />
    </>
  );
};
