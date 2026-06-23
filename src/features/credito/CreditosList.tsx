import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import type { Venta, Cliente, PagoCredito } from '../../types';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';
import { RegistrarPagoModal } from '../clientes/RegistrarPagoModal';
import { fechaVencimiento, diffInCalendarDays, diasDeAtraso } from '../../lib/dates';
import { exportarNotaPagarePDF } from '../../lib/pdf/notaCreditoPagarePDF';

interface VentaConDetalles extends Venta {
  clientes: Cliente | null;
  pagos_credito: PagoCredito[];
}

export const CreditosList: React.FC = () => {
  const [ventas, setVentas] = useState<VentaConDetalles[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter states
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('todos'); // todos | al_corriente | vencidas | pagadas

  // Expanded row tracking (Venta ID)
  const [expandedVentaId, setExpandedVentaId] = useState<string | null>(null);

  // RegistrarPagoModal integration
  const [isAbonoOpen, setIsAbonoOpen] = useState<boolean>(false);
  const [abonoVentaId, setAbonoVentaId] = useState<string>('');
  const [abonoVentaFolio, setAbonoVentaFolio] = useState<string>('');
  const [abonoVentaSaldo, setAbonoVentaSaldo] = useState<number>(0);

  // Delete payment confirmation modal state
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const today = new Date();

  // Helper to parse dates without timezone offset shifting
  const getLocalDate = (dateInput?: string | Date) => {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    const tSplit = dateInput.split('T');
    const datePart = tSplit[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(dateInput);
  };

  // Helper to format Date to DD/MM/YYYY
  const formatDDMMYYYY = (dateInput?: string | Date) => {
    if (!dateInput) return '';
    const d = getLocalDate(dateInput);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fetchCreditos = async () => {
    try {
      setLoading(true);
      setError(null);

      // Query all sales where tipo_pago = 'credito', including client and payments relation
      const { data, error: fetchError } = await supabase
        .from('ventas')
        .select(`
          *,
          clientes:cliente_id (
            id,
            nombre,
            rancho,
            telefono,
            limite_credito,
            saldo_deudor,
            activo_para_credito,
            dias_credito
          ),
          pagos_credito (
            id,
            venta_id,
            monto,
            metodo,
            fecha,
            folio_pago
          )
        `)
        .eq('tipo_pago', 'credito')
        .order('fecha', { ascending: false });

      if (fetchError) throw fetchError;
      setVentas((data as unknown as VentaConDetalles[]) || []);
    } catch (err) {
      console.error('Error al cargar créditos:', err);
      setError(err instanceof Error ? err.message : 'Error al obtener cartera de crédito.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditos();
  }, []);

  const handleOpenAbono = (ventaId: string, folio: string, saldo: number) => {
    setAbonoVentaId(ventaId);
    setAbonoVentaFolio(folio);
    setAbonoVentaSaldo(saldo);
    setIsAbonoOpen(true);
  };

  const handleAbonoSuccess = () => {
    fetchCreditos();
  };

  const handleCancelPayment = async (paymentId: string) => {
    setIsDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from('pagos_credito')
        .delete()
        .eq('id', paymentId);

      if (deleteError) throw deleteError;

      setConfirmDeletePaymentId(null);
      fetchCreditos();
    } catch (err) {
      console.error('Error al cancelar el pago:', err);
      toast.error(err instanceof Error ? err.message : 'Error al procesar la cancelación del pago.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Process and compute credit stats and fields
  const creditosProcesados = ventas.map(v => {
    const totalAbonado = round2(v.pagos_credito?.reduce((sum, p) => sum + Number(p.monto), 0) || 0);
    const saldo = round2(Math.max(0, Number(v.total) - totalAbonado));

    const plazo = v.plazo_dias || v.clientes?.dias_credito || 30;
    // FEC. VEN. = fecha_venta + plazo, en fecha LOCAL (sin corrimiento por zona horaria).
    const fecVen = fechaVencimiento(v.fecha!, plazo);

    // Días de atraso mostrados = fecha_venta - today (días calendario, inmune a DST).
    const diasAtraso = diffInCalendarDays(today, v.fecha!);

    let status: 'VENCIDA' | 'AL CORRIENTE' | 'PAGADA';
    if (v.estado === 'cancelada') {
      // Handle cancelled sales
      status = 'PAGADA'; // display as fully resolved or we can ignore
    } else if (saldo === 0) {
      status = 'PAGADA';
    } else if (diasDeAtraso(fecVen, today) > 0) {
      status = 'VENCIDA';
    } else {
      status = 'AL CORRIENTE';
    }

    return {
      ...v,
      saldo,
      diasAtraso,
      fecVen,
      status,
    };
  });

  // Calculate high-level KPIs based on all credits (before filters)
  const totalEnCartera = creditosProcesados.reduce((sum, c) => c.status !== 'PAGADA' ? sum + c.saldo : sum, 0);
  const totalVencido = creditosProcesados.reduce((sum, c) => c.status === 'VENCIDA' ? sum + c.saldo : sum, 0);
  
  // Clientes Deudores count (distinct clients with pending balance > 0)
  const clientesDeudoresSet = new Set(
    creditosProcesados
      .filter(c => c.status !== 'PAGADA' && c.cliente_id)
      .map(c => c.cliente_id)
  );
  const totalClientesDeudores = clientesDeudoresSet.size;

  // Filter list based on search term and selected status filter
  const filteredCreditos = creditosProcesados.filter(c => {
    // 1. Status Filter
    if (filterStatus === 'vencidas' && c.status !== 'VENCIDA') return false;
    if (filterStatus === 'al_corriente' && c.status !== 'AL CORRIENTE') return false;
    if (filterStatus === 'pagadas' && c.status !== 'PAGADA') return false;
    if (filterStatus === 'pendientes' && c.status === 'PAGADA') return false; // Al corriente + Vencidas

    // 2. Search Filter (Client name, Rancho, or Folio)
    const term = search.toLowerCase();
    if (!term) return true;

    const matchesClient = c.clientes?.nombre.toLowerCase().includes(term) || false;
    const matchesRancho = c.clientes?.rancho?.toLowerCase().includes(term) || false;
    const matchesFolio = c.folio.toLowerCase().includes(term);

    return matchesClient || matchesRancho || matchesFolio;
  });

  const toggleRowExpand = (ventaId: string) => {
    setExpandedVentaId(prev => (prev === ventaId ? null : ventaId));
  };

  const descargarNotaPagare = async (c: {
    id: string; folio: string; fecha?: string; total: number; fecVen: Date;
    cliente_id?: string | null; clientes: Cliente | null;
  }, modo: 'descargar' | 'imprimir' = 'descargar') => {
    const { data } = await supabase
      .from('ventas_detalles')
      .select('cantidad, precio_unitario, subtotal, productos(nombre)')
      .eq('venta_id', c.id);
    const dets = (data as { cantidad: number; precio_unitario: number; subtotal: number; productos: { nombre: string } | null }[] | null) ?? [];
    const partidas = dets.map((d) => ({
      cantidad: d.cantidad,
      descripcion: d.productos?.nombre ?? 'Producto',
      pu: d.precio_unitario,
      importe: d.subtotal,
    }));
    await exportarNotaPagarePDF({
      folio: c.folio,
      claveCliente: c.cliente_id ? c.cliente_id.slice(0, 8) : '—',
      cliente: { nombre: c.clientes?.nombre ?? 'Cliente', direccion: c.clientes?.rancho },
      fechaEmision: formatDDMMYYYY(c.fecha),
      fechaLimite: formatDDMMYYYY(c.fecVen),
      atendidoPor: 'Administrador',
      partidas,
      totalPiezas: partidas.reduce((s, p) => s + Number(p.cantidad), 0),
      total: Number(c.total),
    }, modo);
  };

  return (
    <>
      <style>{`
        .creditos-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .creditos-kpi-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: var(--shadow-sm);
        }
        .creditos-kpi-icon-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
        }
        .creditos-kpi-icon-box.cartera {
          background: var(--green-soft);
          color: var(--green);
        }
        .creditos-kpi-icon-box.vencido {
          background: var(--red-soft);
          color: var(--red);
        }
        .creditos-kpi-icon-box.deudores {
          background: oklch(0.96 0.03 220);
          color: oklch(0.5 0.15 220);
        }
        .creditos-kpi-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .creditos-kpi-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .creditos-kpi-value {
          font-size: 20px;
          font-weight: 800;
          color: var(--ink);
        }
        .creditos-filter-row {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .creditos-search-container {
          flex: 1;
          min-width: 250px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 0 14px;
          height: 48px;
        }
        .creditos-select-filter {
          width: 200px;
          height: 48px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: var(--surface);
          padding: 0 14px;
          font-size: 14px;
          outline: none;
          color: var(--ink);
          cursor: pointer;
        }
        .creditos-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 600;
        }
        .creditos-status-badge.vencida {
          background: var(--red-soft);
          color: var(--red);
        }
        .creditos-status-badge.al_corriente {
          background: var(--green-soft);
          color: var(--green-2);
        }
        .creditos-status-badge.pagada {
          background: var(--line-2);
          color: var(--muted);
        }
        .creditos-row-main {
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .creditos-row-main:hover {
          background: var(--surface-2);
        }
        .creditos-row-expanded {
          background: var(--surface-3, oklch(0.98 0.005 0));
        }
        .creditos-expanded-container {
          padding: 16px 24px;
          border-left: 3px solid var(--green);
        }
        .creditos-payments-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin-top: 10px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .creditos-payments-table th {
          background: var(--surface-2);
          padding: 8px 12px;
          font-weight: 600;
          color: var(--muted);
          text-align: left;
          border-bottom: 1px solid var(--line);
        }
        .creditos-payments-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--line-2);
          color: var(--ink-2);
          vertical-align: middle;
        }
        .cancel-payment-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .cancel-payment-btn:hover {
          color: var(--red);
          background: var(--red-soft);
          border-color: oklch(0.58 0.16 25 / 0.1);
        }
        @media (max-width: 768px) {
          .creditos-kpi-grid {
            grid-template-columns: 1fr;
          }
          .creditos-filter-row {
            flex-direction: column;
            align-items: stretch;
          }
          .creditos-select-filter {
            width: 100%;
          }
        }
      `}</style>

      <Topbar
        title="Notas a Crédito"
        subtitle={loading ? 'Cargando cartera...' : `${ventas.length} notas a crédito en sistema`}
      >
        <button
          className="btn btn-secondary"
          onClick={fetchCreditos}
          disabled={loading}
        >
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
            <div className="creditos-kpi-icon-box cartera">
              <Icon name="credit" size={24} />
            </div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label">Total en Cartera</span>
              <span className="creditos-kpi-value num">{fmtMXN(totalEnCartera)}</span>
            </div>
          </div>

          <div className="creditos-kpi-card">
            <div className="creditos-kpi-icon-box vencido">
              <Icon name="alert" size={24} />
            </div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label" style={{ color: totalVencido > 0 ? 'var(--red)' : 'var(--muted)' }}>Total Vencido</span>
              <span className="creditos-kpi-value num" style={{ color: totalVencido > 0 ? 'var(--red)' : 'var(--ink)' }}>{fmtMXN(totalVencido)}</span>
            </div>
          </div>

          <div className="creditos-kpi-card">
            <div className="creditos-kpi-icon-box deudores">
              <Icon name="users" size={24} />
            </div>
            <div className="creditos-kpi-content">
              <span className="creditos-kpi-label">Clientes Deudores</span>
              <span className="creditos-kpi-value num">{totalClientesDeudores}</span>
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
              placeholder="Buscar por cliente, rancho o folio de remisión..."
              style={{
                flex: 1,
                border: 0,
                background: 'transparent',
                fontSize: 14,
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  color: 'var(--muted)',
                  padding: 4,
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
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
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Cargando notas a crédito...
            </div>
          ) : filteredCreditos.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              {search || filterStatus !== 'todos'
                ? 'No se encontraron créditos que coincidan con la búsqueda.'
                : 'No hay notas a crédito registradas.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
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
                    <th style={{ width: 40 }}></th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Folio
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                      Cliente
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 110 }}>
                      Fecha Venta
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 110 }}>
                      Vencimiento
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>
                      Total
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>
                      Saldo Restante
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 120 }}>
                      Estado
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)', width: 140 }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCreditos.map((c) => {
                    const isExpanded = expandedVentaId === c.id;
                    const hasPayments = c.pagos_credito && c.pagos_credito.length > 0;
                    
                    return (
                      <React.Fragment key={c.id}>
                        {/* Main row */}
                        <tr
                          className={`creditos-row-main ${isExpanded ? 'creditos-row-expanded' : ''}`}
                          onClick={() => toggleRowExpand(c.id)}
                        >
                          <td style={{ textAlign: 'center', padding: '12px 0 12px 12px', borderBottom: '1px solid var(--line-2)' }}>
                            <Icon
                              name="chevron-down"
                              size={16}
                              color="var(--muted)"
                              style={{ display: 'block', margin: 'auto', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                            />
                          </td>
                          <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', fontWeight: 600 }} className="mono">
                            {c.folio}
                          </td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                {c.clientes?.nombre || <span style={{ color: 'var(--muted-2)' }}>Cliente Desconocido</span>}
                              </div>
                              {c.clientes?.rancho && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                  Rancho: {c.clientes.rancho}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}>
                            {formatDDMMYYYY(c.fecha)}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)', fontWeight: c.status === 'VENCIDA' ? 'bold' : 'normal', color: c.status === 'VENCIDA' ? 'var(--red)' : 'inherit' }}>
                            {formatDDMMYYYY(c.fecVen)}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">
                            {fmtMXN(Number(c.total))}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">
                            <span
                              style={{
                                fontWeight: c.saldo > 0 ? 700 : 500,
                                color: c.saldo > 0 ? 'var(--red)' : 'var(--muted)',
                              }}
                            >
                              {c.saldo > 0 ? fmtMXN(c.saldo) : 'Liquidada'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}>
                            <span className={`creditos-status-badge ${c.status.toLowerCase().replace(' ', '_')}`}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: c.status === 'VENCIDA' ? 'var(--red)' : c.status === 'AL CORRIENTE' ? 'var(--green)' : 'var(--muted-2)',
                                  display: 'inline-block',
                                  marginRight: 6
                                }}
                              />
                              {c.status === 'AL CORRIENTE' ? 'Al corriente' : c.status === 'VENCIDA' ? 'Vencida' : 'Pagada'}
                            </span>
                          </td>
                          <td
                            style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}
                            onClick={(e) => e.stopPropagation()} // Prevent toggling expand when clicking action button
                          >
                            {c.saldo > 0 ? (
                              <button
                                className="btn btn-primary"
                                style={{ height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6, gap: 4 }}
                                onClick={() => handleOpenAbono(c.id, c.folio, c.saldo)}
                              >
                                <Icon name="cash" size={14} />
                                Registrar Pago
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary"
                                style={{ height: 30, padding: '0 10px', fontSize: 12, borderRadius: 6, opacity: 0.5, cursor: 'not-allowed' }}
                                disabled
                              >
                                <Icon name="check" size={14} />
                                Liquidada
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr className="creditos-row-expanded">
                            <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--line-2)' }}>
                              <div className="creditos-expanded-container">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--ink-2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Icon name="clock" size={16} color="var(--green)" />
                                    Historial de Pagos Registrados
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      className="btn btn-secondary"
                                      style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }}
                                      onClick={() => descargarNotaPagare(c, 'descargar')}
                                      title="Descargar nota de venta a crédito con pagaré (PDF)"
                                    >
                                      <Icon name="download" size={12} />
                                      Nota/Pagaré
                                    </button>
                                    <button
                                      className="btn btn-secondary"
                                      style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }}
                                      onClick={() => descargarNotaPagare(c, 'imprimir')}
                                      title="Imprimir nota de venta a crédito con pagaré"
                                    >
                                      <Icon name="printer" size={12} />
                                      Imprimir
                                    </button>
                                    {c.saldo > 0 && (
                                      <button
                                        className="btn btn-secondary"
                                        style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6 }}
                                        onClick={() => handleOpenAbono(c.id, c.folio, c.saldo)}
                                      >
                                        <Icon name="plus" size={12} />
                                        Registrar Abono
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {hasPayments ? (
                                  <table className="creditos-payments-table">
                                    <thead>
                                      <tr>
                                        <th>Folio Pago</th>
                                        <th>Fecha y Hora</th>
                                        <th>Método</th>
                                        <th style={{ textAlign: 'right' }}>Monto Abonado</th>
                                        <th style={{ textAlign: 'center', width: 80 }}>Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.pagos_credito.map((pago) => (
                                        <tr key={pago.id}>
                                          <td className="mono" style={{ fontWeight: 600 }}>{pago.folio_pago}</td>
                                          <td>{formatDDMMYYYY(pago.fecha)} {pago.fecha ? new Date(pago.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</td>
                                          <td style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>
                                            <span style={{
                                              padding: '2px 6px',
                                              borderRadius: 4,
                                              background: pago.metodo === 'transferencia' ? 'oklch(0.96 0.03 220)' : 'oklch(0.96 0.03 140)',
                                              color: pago.metodo === 'transferencia' ? 'oklch(0.5 0.15 220)' : 'oklch(0.4 0.15 140)'
                                            }}>
                                              {pago.metodo || 'efectivo'}
                                            </span>
                                          </td>
                                          <td style={{ textAlign: 'right', fontWeight: 'bold' }} className="num">
                                            {fmtMXN(Number(pago.monto))}
                                          </td>
                                          <td style={{ textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              className="cancel-payment-btn"
                                              title="Cancelar/Eliminar este abono de crédito"
                                              onClick={() => setConfirmDeletePaymentId(pago.id)}
                                            >
                                              <Icon name="trash" size={14} />
                                            </button>
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
              <button
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setConfirmDeletePaymentId(null)}
              >
                No, mantener pago
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                disabled={isDeleting}
                onClick={() => handleCancelPayment(confirmDeletePaymentId)}
              >
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
