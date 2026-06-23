import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import type { Cliente, Venta, PagoCredito } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { useConfig } from '../config/ConfigContext';
import { fechaVencimiento, diasDeAtraso, diasAtrasoMostrar } from '../../lib/dates';
import { round2 } from '../../lib/money';
import { exportarEstadoCuentaPDF, exportarEstadoCuentaExcel, type EstadoCuentaModel } from '../../lib/estadoCuentaExport';

interface EstadoCuentaProps {
  cliente: Cliente;
  onBack: () => void;
  onOpenAbono: (ventaId: string, folio: string, saldo: number) => void;
  /** Modo solo-lectura (visitante): oculta acciones de escritura (guardar plazo, registrar abono). */
  readOnly?: boolean;
}

interface NoteRowData {
  venta: Venta;
  saldo: number;
  diasAtraso: number;
  fecVen: Date;
  status: 'VENCIDA' | 'AL CORRIENTE' | 'PAGADA';
  pagos: PagoCredito[];
}

export const EstadoCuenta: React.FC<EstadoCuentaProps> = ({ cliente, onBack, onOpenAbono, readOnly = false }) => {
  const { config } = useConfig();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pagos, setPagos] = useState<PagoCredito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Credit terms state
  // Plazo predeterminado persistido del cliente (estado local; NO mutamos la prop `cliente`).
  const [diasCreditoGuardado, setDiasCreditoGuardado] = useState<number>(cliente.dias_credito || 30);
  const [diasCredito, setDiasCredito] = useState<number>(cliente.dias_credito || 30);
  const [isCustom, setIsCustom] = useState<boolean>(
    (cliente.dias_credito || 30) !== 30 &&
    (cliente.dias_credito || 30) !== 45 &&
    (cliente.dias_credito || 30) !== 60
  );
  const [customDays, setCustomDays] = useState<string>(
    (cliente.dias_credito || 30) !== 30 &&
    (cliente.dias_credito || 30) !== 45 &&
    (cliente.dias_credito || 30) !== 60
      ? String(cliente.dias_credito || 30)
      : ''
  );

  const [savingDefault, setSavingDefault] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveDefaultDays = async () => {
    setSavingDefault(true);
    setSaveSuccess(false);
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ dias_credito: diasCredito })
        .eq('id', cliente.id);

      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      // Reflejamos el nuevo plazo guardado en estado local (sin mutar la prop `cliente`).
      setDiasCreditoGuardado(diasCredito);
    } catch (err) {
      console.error('Error saving default credit days:', err);
      toast.error('Error al guardar los días de crédito predeterminados');
    } finally {
      setSavingDefault(false);
    }
  };

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

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all credit sales for the client
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select('*')
        .eq('cliente_id', cliente.id)
        .eq('tipo_pago', 'credito')
        .order('fecha', { ascending: true });

      if (ventasError) throw ventasError;

      if (ventasData && ventasData.length > 0) {
        const ventaIds = ventasData.map(v => v.id);
        const { data: pagosData, error: pagosError } = await supabase
          .from('pagos_credito')
          .select('*')
          .in('venta_id', ventaIds)
          .order('fecha', { ascending: true });

        if (pagosError) throw pagosError;
        setVentas(ventasData);
        setPagos(pagosData || []);
      } else {
        setVentas([]);
        setPagos([]);
      }
    } catch (err) {
      console.error('Error al cargar estado de cuenta:', err);
      setError(err instanceof Error ? err.message : 'Error al obtener datos del servidor');
    } finally {
      setLoading(false);
    }
  };

  // Sincroniza el plazo guardado cuando cambia el cliente o su valor persistido en la prop.
  useEffect(() => {
    setDiasCreditoGuardado(cliente.dias_credito || 30);
  }, [cliente.id, cliente.dias_credito]);

  useEffect(() => {
    cargarDatos();
  }, [cliente.id]);

  // Aplica el plazo guardado a la selección visible (presets / personalizado).
  useEffect(() => {
    const defaultDays = diasCreditoGuardado || 30;
    setDiasCredito(defaultDays);
    const isPreset = defaultDays === 30 || defaultDays === 45 || defaultDays === 60;
    setIsCustom(!isPreset);
    setCustomDays(isPreset ? '' : String(defaultDays));
  }, [cliente.id, diasCreditoGuardado]);

  // Recalculate row details dynamically based on credit days selection
  const processedRows: NoteRowData[] = ventas.map(v => {
    const vPagos = pagos.filter(p => p.venta_id === v.id);
    const totalAbonos = round2(vPagos.reduce((sum, p) => sum + p.monto, 0));
    const saldo = round2(Math.max(0, v.total - totalAbonos));

    // FEC. VEN. = fecha_venta + (venta.plazo_dias || dias_credito), en fecha LOCAL.
    const plazo = v.plazo_dias || diasCredito;
    const fecVen = fechaVencimiento(v.fecha!, plazo);

    // DÍAS DE ATRASO = mora real (días vencidos desde FEC. VEN.), 0 si aún no vence.
    // Coincide con el badge de status y viaja correcto al PDF/Excel (T-FECHA-2).
    const diasAtraso = diasAtrasoMostrar(fecVen, today);

    let status: 'VENCIDA' | 'AL CORRIENTE' | 'PAGADA';
    if (saldo === 0) {
      status = 'PAGADA';
    } else if (diasDeAtraso(fecVen, today) > 0) {
      status = 'VENCIDA';
    } else {
      status = 'AL CORRIENTE';
    }

    return {
      venta: v,
      saldo,
      diasAtraso,
      fecVen,
      status,
      pagos: vPagos,
    };
  });

  // Calculate metrics
  const totalSaldo = processedRows.reduce((sum, r) => sum + r.saldo, 0);
  const totalVencido = processedRows.reduce((sum, r) => r.status === 'VENCIDA' ? sum + r.saldo : sum, 0);
  // TOTAL NOTAS: Sum of outstanding balances of all active notes (unpaid).
  const totalNotas = processedRows.reduce((sum, r) => r.status !== 'PAGADA' ? sum + r.saldo : sum, 0);
  const saldoPorCobrar = totalSaldo;

  // Métricas para el banner elegante (% liquidado de toda la cuenta).
  const totalCargado = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalAbonado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const pctLiquidado = totalCargado > 0 ? Math.min(100, Math.round((totalAbonado / totalCargado) * 100)) : 0;

  // Construye el modelo de exportación a partir de los datos ya calculados.
  const buildModel = (): EstadoCuentaModel => ({
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      rancho: cliente.rancho,
      telefono: cliente.telefono,
    },
    kpis: { diasCredito, totalVencido, totalNotas, saldoPorCobrar },
    notas: processedRows.map((r) => ({
      remision: r.venta.folio,
      fecha: formatDDMMYYYY(r.venta.fecha),
      fecVen: formatDDMMYYYY(r.fecVen),
      total: Number(r.venta.total),
      saldo: r.saldo,
      diasAtraso: r.diasAtraso,
      status: r.status,
      abonos: r.pagos.map((p) => ({
        fecha: formatDDMMYYYY(p.fecha),
        metodo: (p.metodo || 'efectivo').toUpperCase(),
        monto: Number(p.monto),
      })),
    })),
    generadoEn: new Date().toLocaleString('es-MX'),
  });

  const handleDescargarPDF = () => exportarEstadoCuentaPDF(buildModel());
  const handleImprimirPDF = () => exportarEstadoCuentaPDF(buildModel(), 'imprimir');
  const handleDescargarExcel = () => exportarEstadoCuentaExcel(buildModel());

  const handleTermChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustom(true);
      setCustomDays('');
    } else {
      setIsCustom(false);
      setDiasCredito(Number(val));
    }
  };

  const handleCustomDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDays(val);
    const num = Number(val);
    if (!isNaN(num) && num >= 0) {
      setDiasCredito(num);
    }
  };

  if (loading) {
    return (
      <>
        <style>{`
          .premium-loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
          }
          .premium-loading-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            padding: 40px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: 20px;
            box-shadow: var(--shadow-lg);
            text-align: center;
          }
          .premium-loading-icon-wrapper {
            width: 60px;
            height: 60px;
            border-radius: 15px;
            background: var(--green-soft);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--green);
          }
        `}</style>
        <div className="premium-loading-container">
          <div className="premium-loading-card">
            <div className="premium-loading-icon-wrapper">
              <Icon name="clock" size={28} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Cargando Estado de Cuenta</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Obteniendo notas y pagos...</div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="content">
        <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 500, margin: '40px auto' }}>
          <div style={{ color: 'var(--red)', marginBottom: 16 }}>
            <Icon name="alert" size={48} />
          </div>
          <div className="h2" style={{ color: 'var(--ink)' }}>Error al Cargar Datos</div>
          <p style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)' }}>{error}</p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={onBack}>
              Volver
            </button>
            <button className="btn btn-primary" onClick={cargarDatos}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .est-cta-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .est-cta-header-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-shadow: var(--shadow-sm);
        }
        .est-cta-title-block {
          text-align: center;
          border-bottom: 2px solid var(--ink);
          padding-bottom: 16px;
        }
        .est-cta-main-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--ink);
          margin: 0 0 6px 0;
          letter-spacing: -0.01em;
        }
        .est-cta-client-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--green-2);
          margin: 0;
        }
        .est-cta-rancho {
          font-size: 13px;
          color: var(--muted);
          margin: 4px 0 0 0;
        }
        .est-cta-control-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .est-cta-term-selector {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .est-cta-term-selector label {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .est-cta-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .est-cta-metric-card {
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .est-cta-metric-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .est-cta-metric-value {
          font-size: 22px;
          font-weight: 800;
          color: var(--ink);
        }
        .est-cta-table-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 24px;
          box-shadow: var(--shadow-sm);
          overflow-x: auto;
        }
        .est-cta-excel-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .est-cta-excel-table th {
          background: var(--surface-2);
          border-bottom: 1px solid var(--line);
          padding: 9px 10px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-size: 11px;
          text-align: center;
        }
        .est-cta-excel-table td {
          border-top: 1px solid var(--line-2);
          padding: 9px 10px;
          vertical-align: middle;
        }
        .est-cta-group-header {
          background: var(--green-soft) !important;
          color: var(--green-2) !important;
          font-weight: 700 !important;
          letter-spacing: 0.12em;
          font-size: 12px !important;
          padding: 6px !important;
          text-align: center !important;
        }
        .est-cta-status-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
        .est-cta-status-badge.vencida {
          background: var(--red-soft);
          color: var(--red);
        }
        .est-cta-status-badge.corriente {
          background: var(--green-soft);
          color: var(--green-2);
        }
        .est-cta-status-badge.pagada {
          background: var(--line-2);
          color: var(--muted);
          text-decoration: line-through;
        }
        .est-cta-excel-totals-row {
          font-weight: 700;
          background: var(--surface-2);
        }
        .est-cta-excel-totals-row td {
          border-top: 2px solid var(--line);
        }
        .est-cta-final-box-wrapper {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .est-cta-final-box {
          border: 1px solid var(--green-line);
          border-collapse: collapse;
          font-weight: 700;
          font-size: 13px;
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .est-cta-final-box td {
          border: 1px solid var(--green-line);
          padding: 10px 16px;
        }
        .est-cta-final-box-label {
          background: var(--green-soft);
          color: var(--green-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .paid-row-text {
          text-decoration: line-through;
          color: var(--muted);
        }
        @media (max-width: 900px) {
          .est-cta-metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .est-cta-metrics-grid {
            grid-template-columns: 1fr;
          }
          .est-cta-control-row {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={onBack} style={{ padding: '0 8px' }}>
            <Icon name="arrow-left" size={20} />
          </button>
          <div>
            <div className="topbar-title">Estado de Cuenta</div>
            <div className="topbar-sub">{cliente.nombre}</div>
          </div>
        </div>
        <div className="topbar-right">
          <button
            className="btn btn-secondary"
            onClick={handleDescargarPDF}
            disabled={processedRows.length === 0}
            title="Descargar estado de cuenta en PDF"
          >
            <Icon name="download" size={16} />
            PDF
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleImprimirPDF}
            disabled={processedRows.length === 0}
            title="Imprimir estado de cuenta"
          >
            <Icon name="printer" size={16} />
            Imprimir
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDescargarExcel}
            disabled={processedRows.length === 0}
            title="Descargar estado de cuenta en Excel"
          >
            <Icon name="download" size={16} />
            Excel
          </button>
          <button className="btn btn-secondary" onClick={cargarDatos} title="Sincronizar datos">
            <Icon name="check" size={16} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="content">
        <div className="est-cta-container">
          {/* BANNER ELEGANTE DE SALDO */}
          <div
            className="card"
            style={{
              padding: 24,
              background: totalVencido > 0
                ? 'linear-gradient(135deg, var(--red-soft) 0%, var(--surface) 70%)'
                : 'linear-gradient(135deg, var(--green-soft) 0%, var(--surface) 70%)',
              borderColor: totalVencido > 0 ? 'oklch(0.85 0.08 25)' : 'var(--green-line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: totalVencido > 0 ? 'var(--red)' : 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                  <Icon name={totalVencido > 0 ? 'alert' : 'credit'} size={26} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{cliente.nombre}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
                    {processedRows.filter((r) => r.status !== 'PAGADA').length} notas activas
                    {totalVencido > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {fmtMXN(totalVencido)} vencido</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Saldo por cobrar</div>
                <div className="num" style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', color: totalVencido > 0 ? 'var(--red)' : 'var(--ink)', lineHeight: 1.1 }}>{fmtMXN(saldoPorCobrar)}</div>
                <div className="num" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Pagado {fmtMXN(totalAbonado)} de {fmtMXN(totalCargado)}</div>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ height: 8, background: 'var(--surface)', borderRadius: 999, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pctLiquidado}%`, background: totalVencido > 0 ? 'var(--red)' : 'var(--green)', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                <span>{pctLiquidado}% liquidado</span>
                <span>Fecha de consulta: {formatDDMMYYYY(today)}</span>
              </div>
            </div>
          </div>

          {/* HEADER AND TERMS PANEL */}
          <div className="est-cta-header-card">
            <div className="est-cta-title-block">
              <h1 className="est-cta-main-title">{config.nombre} - CUENTAS POR COBRAR - ESTADO DE CUENTA</h1>
              <h2 className="est-cta-client-name">{cliente.nombre}</h2>
              {cliente.rancho && <p className="est-cta-rancho"><strong>Rancho:</strong> {cliente.rancho}</p>}
            </div>

            <div className="est-cta-control-row">
              <div className="est-cta-term-selector" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label htmlFor="dias-credito-select">Días de Crédito:</label>
                <select
                  id="dias-credito-select"
                  className="input"
                  style={{ width: 140, height: 36, padding: '0 10px' }}
                  value={isCustom ? 'custom' : diasCredito}
                  onChange={handleTermChange}
                >
                  <option value="30">30 Días</option>
                  <option value="45">45 Días</option>
                  <option value="60">60 Días</option>
                  <option value="custom">Personalizado...</option>
                </select>

                {isCustom && (
                  <input
                    type="number"
                    min="0"
                    placeholder="Días"
                    className="input num"
                    style={{ width: 90, height: 36, padding: '0 10px' }}
                    value={customDays}
                    onChange={handleCustomDaysChange}
                  />
                )}

                {!readOnly && (
                <button
                  type="button"
                  onClick={handleSaveDefaultDays}
                  className="btn"
                  style={{
                    height: 36,
                    padding: '0 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: savingDefault ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    background: saveSuccess ? 'var(--green-soft)' : 'var(--surface)',
                    border: `1.5px solid ${saveSuccess ? 'var(--green)' : 'var(--line)'}`,
                    color: saveSuccess ? 'var(--green-2)' : 'var(--ink)'
                  }}
                  disabled={savingDefault}
                  title="Guardar este plazo como el predeterminado para este cliente"
                >
                  <Icon name={saveSuccess ? "check" : "edit"} size={14} />
                  {savingDefault ? 'Guardando...' : saveSuccess ? '¡Plazo Guardado!' : 'Establecer por defecto'}
                </button>
                )}
              </div>
            </div>
          </div>

          {/* METRICS BOXES */}
          <div className="est-cta-metrics-grid">
            <div className="est-cta-metric-card">
              <div className="est-cta-metric-label">Días de Crédito</div>
              <div className="est-cta-metric-value num">{diasCredito}</div>
            </div>
            <div className="est-cta-metric-card">
              <div className="est-cta-metric-label">Total Notas</div>
              <div className="est-cta-metric-value num" style={{ color: 'var(--green-2)' }}>
                {fmtMXN(totalNotas)}
              </div>
            </div>
            <div className="est-cta-metric-card">
              <div className="est-cta-metric-label" style={{ color: totalVencido > 0 ? 'var(--red)' : 'var(--muted)' }}>
                Total Vencido
              </div>
              <div className="est-cta-metric-value num" style={{ color: totalVencido > 0 ? 'var(--red)' : 'var(--ink)' }}>
                {fmtMXN(totalVencido)}
              </div>
            </div>
            <div className="est-cta-metric-card">
              <div className="est-cta-metric-label">Saldo por Cobrar</div>
              <div className="est-cta-metric-value num" style={{ fontWeight: 900 }}>
                {fmtMXN(saldoPorCobrar)}
              </div>
            </div>
          </div>

          {/* DOCUMENTS TABLE */}
          <div className="est-cta-table-card">
            {/* Table Header block */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <div style={{ fontWeight: '800', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Días de Crédito: {diasCredito}
              </div>
              <div style={{ fontWeight: '800', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Fecha de Consulta: {formatDDMMYYYY(today)}
              </div>
            </div>

            <table className="est-cta-excel-table">
              <thead>
                <tr>
                  <th colSpan={6} className="est-cta-group-header">D O C U M E N T O</th>
                  <th colSpan={5} className="est-cta-group-header" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>ABONOS Y CONTROL</th>
                </tr>
                <tr>
                  <th>DÍAS DE ATRASO</th>
                  <th>REMISION</th>
                  <th>FECHA</th>
                  <th>FEC. VEN.</th>
                  <th>FACTURA</th>
                  <th>SALDO</th>
                  <th>STATUS</th>
                  <th>ABONOS</th>
                  <th>FECHA</th>
                  <th>OBSERVACIONES</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {processedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '13px' }}>
                      No se encontraron notas a crédito registradas para este cliente.
                    </td>
                  </tr>
                ) : (
                  processedRows.map((row) => {
                    const isPaid = row.status === 'PAGADA';
                    const mainRowClass = isPaid ? 'paid-row-text' : '';

                    if (row.pagos.length === 0) {
                      return (
                        <tr key={row.venta.id} className={mainRowClass}>
                          <td className="num" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            {row.diasAtraso}
                          </td>
                          <td className="mono" style={{ textAlign: 'center' }}>
                            {row.venta.folio}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {formatDDMMYYYY(row.venta.fecha)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            {formatDDMMYYYY(row.fecVen)}
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--muted)' }}>
                            -
                          </td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                            {row.saldo > 0 ? fmtMXN(row.saldo) : ''}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`est-cta-status-badge ${row.status.toLowerCase().replace(' ', '')}`}>
                              {row.status}
                            </span>
                          </td>
                          <td></td>
                          <td></td>
                          <td></td>
                          <td style={{ textAlign: 'center' }}>
                            {!readOnly && row.saldo > 0 && (
                              <button
                                className="btn btn-secondary"
                                style={{ height: 26, padding: '0 8px', fontSize: 11, gap: 4 }}
                                onClick={() => onOpenAbono(row.venta.id, row.venta.folio, row.saldo)}
                              >
                                <Icon name="plus" size={12} />
                                Registrar Abono
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    // For rows with payments, render the first payment on the same row,
                    // and extra payments on subsequent sub-rows
                    return (
                      <React.Fragment key={row.venta.id}>
                        {row.pagos.map((pago, index) => {
                          if (index === 0) {
                            return (
                              <tr key={pago.id} className={mainRowClass}>
                                <td className="num" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                  {row.diasAtraso}
                                </td>
                                <td className="mono" style={{ textAlign: 'center' }}>
                                  {row.venta.folio}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {formatDDMMYYYY(row.venta.fecha)}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                  {formatDDMMYYYY(row.fecVen)}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--muted)' }}>
                                  -
                                </td>
                                <td className="num" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                  {row.saldo > 0 ? fmtMXN(row.saldo) : ''}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`est-cta-status-badge ${row.status.toLowerCase().replace(' ', '')}`}>
                                    {row.status}
                                  </span>
                                </td>
                                <td className="num" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                  {isPaid ? (
                                    <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>PAGADA</span>
                                  ) : (
                                    fmtMXN(pago.monto)
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {formatDDMMYYYY(pago.fecha)}
                                </td>
                                <td style={{ textAlign: 'center', textTransform: 'uppercase' }}>
                                  {pago.metodo || 'EFECTIVO'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {!readOnly && row.saldo > 0 && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ height: 26, padding: '0 8px', fontSize: 11, gap: 4 }}
                                      onClick={() => onOpenAbono(row.venta.id, row.venta.folio, row.saldo)}
                                    >
                                      <Icon name="plus" size={12} />
                                      Registrar Abono
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={pago.id}>
                              {/* Empty columns for document details */}
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              {/* Payment details */}
                              <td className="num" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                {fmtMXN(pago.monto)}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {formatDDMMYYYY(pago.fecha)}
                              </td>
                              <td style={{ textAlign: 'center', textTransform: 'uppercase' }}>
                                {pago.metodo || 'EFECTIVO'}
                              </td>
                              <td></td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {processedRows.length > 0 && (
                <tfoot>
                  <tr className="est-cta-excel-totals-row">
                    <td colSpan={5} style={{ textAlign: 'right', padding: '10px 12px' }}>
                      TOTAL
                    </td>
                    <td className="num" style={{ textAlign: 'right', padding: '10px 12px' }}>
                      {fmtMXN(totalSaldo)}
                    </td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              )}
            </table>

            {/* EXCEL BOX SALDO POR COBRAR */}
            {processedRows.length > 0 && (
              <div className="est-cta-final-box-wrapper">
                <table className="est-cta-final-box">
                  <tbody>
                    <tr>
                      <td className="est-cta-final-box-label">
                        SALDO POR COBRAR
                      </td>
                      <td className="num" style={{ fontSize: '15px' }}>
                        {fmtMXN(totalSaldo)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
