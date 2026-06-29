import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAll } from '../../lib/fetchAll';
import { toast } from '../../lib/toast';
import { useAuth } from '../auth/AuthContext';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { round2, sumMoney } from '../../lib/money';
import { calcularResumenCaja, grupoCaja, type GrupoCaja } from '../../lib/caja';
import { useAlActivar } from '../../hooks/useAlActivar';

interface MovimientoCajaDB {
  id: string;
  vendedor_id: string;
  tipo: 'apertura' | 'ingreso' | 'egreso' | 'venta' | 'abono';
  monto: number;
  descripcion: string;
  fecha: string;
  es_corte?: boolean;
  vendedor?: { nombre: string };
}

interface PastShift {
  apertura: MovimientoCajaDB;
  cierre: MovimientoCajaDB | null;
  estado: 'cerrado' | 'activo' | 'sin_corte';
}

interface VentaCajaDB {
  id: string;
  folio: string;
  cliente_id?: string | null;
  tipo_pago: 'efectivo' | 'tarjeta' | 'debito' | 'transferencia' | 'credito';
  total: number;
  estado: string;
  fecha: string;
}

interface PagoCreditoCajaDB {
  id: string;
  venta_id: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'debito';
  fecha: string;
  folio_pago: string;
  venta?: {
    folio: string;
    clientes?: {
      nombre: string;
    };
  };
}

interface ActivityItem {
  id: string;
  clase: 'apertura' | 'ingreso' | 'egreso' | 'venta' | 'abono';
  grupo: GrupoCaja; // efectivo | tarjeta (tarjeta+débito) | transferencia | credito
  fecha: string;
  monto: number;
  descripcion: string;
}

// Presentación por grupo de método (tarjeta y débito comparten color distintivo).
const GRUPO_UI: Record<GrupoCaja, { label: string; chipBg: string; chipFg: string }> = {
  efectivo:      { label: 'Efectivo',          chipBg: 'oklch(0.95 0.05 150)', chipFg: 'oklch(0.40 0.13 150)' },
  tarjeta:       { label: 'Tarjeta / Débito',  chipBg: 'oklch(0.93 0.06 285)', chipFg: 'oklch(0.45 0.18 285)' }, // color distintivo
  transferencia: { label: 'Transferencia',     chipBg: 'oklch(0.95 0.04 230)', chipFg: 'oklch(0.45 0.13 230)' },
  credito:       { label: 'Crédito de tienda', chipBg: 'oklch(0.95 0.06 75)',  chipFg: 'oklch(0.48 0.14 70)' },
};
const CLASE_ICON: Record<ActivityItem['clase'], string> = {
  apertura: 'cash', ingreso: 'arrow-up', egreso: 'arrow-down', venta: 'cart', abono: 'users',
};

interface CajaProps {
  activo?: boolean;
}

export const Caja: React.FC<CajaProps> = ({ activo }) => {
  const { profile } = useAuth();
  
  // Caja shift state
  const [activeApertura, setActiveApertura] = useState<MovimientoCajaDB | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Shift data lists
  const [manualMovements, setManualMovements] = useState<MovimientoCajaDB[]>([]);
  const [ventas, setVentas] = useState<VentaCajaDB[]>([]);
  const [pagosCredito, setPagosCredito] = useState<PagoCreditoCajaDB[]>([]);

  // Apertura form state
  const [aperturaMonto, setAperturaMonto] = useState<string>('1000.00');
  const [aperturaNotas, setAperturaNotas] = useState<string>('');
  const [isOpening, setIsOpening] = useState<boolean>(false);

  // Manual movement modal/form state
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualTipo, setManualTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [manualMonto, setManualMonto] = useState<string>('');
  const [manualDescripcion, setManualDescripcion] = useState<string>('');
  const [isSavingMovement, setIsSavingMovement] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Corte de Caja form state
  const [corteCounted, setCorteCounted] = useState<string>('');
  const [corteNotas, setCorteNotas] = useState<string>('');
  const [showCorteConfirm, setShowCorteConfirm] = useState<boolean>(false);
  const [isClosingShift, setIsClosingShift] = useState<boolean>(false);

  // Breakdown detail visibility states
  const [showVentasEfectivo, setShowVentasEfectivo] = useState<boolean>(false);
  const [showAbonosEfectivo, setShowAbonosEfectivo] = useState<boolean>(false);
  const [showIngresos, setShowIngresos] = useState<boolean>(false);
  const [showEgresos, setShowEgresos] = useState<boolean>(false);
  const [showVentasTarjeta, setShowVentasTarjeta] = useState<boolean>(false);
  const [showAbonosTransferencia, setShowAbonosTransferencia] = useState<boolean>(false);
  const [showAperturaDetalle, setShowAperturaDetalle] = useState<boolean>(false);
  const [showTodosEfectivo, setShowTodosEfectivo] = useState<boolean>(false);

  // Past shifts states
  const [pastShifts, setPastShifts] = useState<PastShift[]>([]);
  const [loadingPast, setLoadingPast] = useState<boolean>(false);
  const [showPastShifts, setShowPastShifts] = useState<boolean>(false);

  const loadPastShifts = async () => {
    try {
      setLoadingPast(true);
      // Historial completo de aperturas/cortes en lotes (sin tope de 1000),
      // necesario para reconstruir los turnos por pares apertura↔corte.
      const movements = await fetchAll<MovimientoCajaDB>((from, to) =>
        supabase
          .from('movimientos_caja')
          .select(`
            *,
            vendedor:vendedor_id (
              nombre
            )
          `)
          .in('tipo', ['apertura', 'egreso'])
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }) // desempate único: los lotes de .range deben ser estables
          .range(from, to),
      );
      const shiftsList: PastShift[] = [];
      let pendingCorte: MovimientoCajaDB | null = null;

      for (const m of movements) {
        if (m.tipo === 'egreso' && m.es_corte === true) {
          pendingCorte = m;
        } else if (m.tipo === 'apertura') {
          if (pendingCorte) {
            shiftsList.push({
              apertura: m,
              cierre: pendingCorte,
              estado: 'cerrado'
            });
            pendingCorte = null;
          } else {
            const isActive = activeApertura && activeApertura.id === m.id;
            shiftsList.push({
              apertura: m,
              cierre: null,
              estado: isActive ? 'activo' : 'sin_corte'
            });
          }
        }
      }

      setPastShifts(shiftsList);
    } catch (err) {
      console.error('Error loading past shifts:', err);
    } finally {
      setLoadingPast(false);
    }
  };

  useEffect(() => {
    if (showPastShifts) {
      loadPastShifts();
    }
  }, [refreshKey, showPastShifts]);

  const renderPastShifts = () => {
    return (
      <div className="card" style={{ padding: 24, marginTop: 24, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => {
          const nextState = !showPastShifts;
          setShowPastShifts(nextState);
          if (nextState) loadPastShifts();
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={18} color="var(--green)" />
            Historial de Aperturas y Cortes de Caja
          </div>
          <Icon name={showPastShifts ? 'chevron-up' : 'chevron-down'} size={18} color="var(--muted)" />
        </div>

        {showPastShifts && (
          <div style={{ marginTop: 20 }}>
            {loadingPast ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Cargando historial de turnos...</div>
            ) : pastShifts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>No hay turnos registrados en el historial.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', color: 'var(--muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Turno / Cajero</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>Apertura</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>Cierre</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Detalle y Balance</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--line)', width: 100 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastShifts.map((shift, idx) => {
                      const openDateStr = formatDate(shift.apertura.fecha);
                      const closeDateStr = shift.cierre ? formatDate(shift.cierre.fecha) : '—';
                      
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line-2)' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{shift.apertura.vendedor?.nombre || 'Desconocido'}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>ID: {shift.apertura.id.slice(-6).toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600 }} className="num">{fmtMXN(shift.apertura.monto)}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{openDateStr}</div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600 }} className="num">{shift.cierre ? fmtMXN(shift.cierre.monto) : '—'}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{closeDateStr}</div>
                          </td>
                          <td style={{ padding: '12px', color: 'var(--ink-2)', fontSize: 11, maxWidth: 300, lineHeight: 1.4 }}>
                            {shift.cierre ? (
                              shift.cierre.descripcion
                            ) : (
                              <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>Turno activo o sin corte registrado</span>
                            )}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span className={`badge ${shift.estado === 'activo' ? 'green' : shift.estado === 'cerrado' ? 'gray' : 'amber'}`} style={{ fontSize: 10 }}>
                              {shift.estado === 'activo' ? 'Activo' : shift.estado === 'cerrado' ? 'Cerrado' : 'Abierto s/c'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    let cancelled = false;

    const fetchCajaData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Get the latest apertura movement
        const { data: apData, error: apErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'apertura')
          .order('fecha', { ascending: false })
          .limit(1);

        if (apErr) throw apErr;
        if (cancelled) return;

        if (!apData || apData.length === 0) {
          setActiveApertura(null);
          setLoading(false);
          return;
        }

        const lastApertura = apData[0] as MovimientoCajaDB;

        // 2. Check if there is a closing egreso (corte)
        const { data: clData, error: clErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'egreso')
          .eq('es_corte', true)
          .order('fecha', { ascending: false })
          .limit(1);

        if (clErr) throw clErr;
        if (cancelled) return;

        const lastCorte = clData && clData.length > 0 ? clData[0] : null;

        // Compare timestamps in JS to avoid database timezone comparison discrepancies
        if (lastCorte && new Date(lastCorte.fecha).getTime() > new Date(lastApertura.fecha).getTime()) {
          if (cancelled) return;
          setActiveApertura(null);
          setLoading(false);
          return;
        }

        setActiveApertura(lastApertura);

        // 3. Load all manual movements since apertura
        const { data: movsData, error: movsErr } = await supabase
          .from('movimientos_caja')
          .select(`
            *,
            vendedor:vendedor_id (
              nombre
            )
          `)
          .gte('fecha', lastApertura.fecha)
          .order('fecha', { ascending: true });

        if (movsErr) throw movsErr;
        if (cancelled) return;
        setManualMovements((movsData as unknown as MovimientoCajaDB[]) || []);

        // 4. Load all ventas since apertura (cobradas + pendientes de crédito)
        const { data: vtsData, error: vtsErr } = await supabase
          .from('ventas')
          .select('*, clientes:cliente_id(nombre)')
          .gte('fecha', lastApertura.fecha)
          .in('estado', ['cobrada', 'pendiente', 'devuelta']);

        if (vtsErr) throw vtsErr;
        if (cancelled) return;
        setVentas((vtsData as VentaCajaDB[]) || []);

        // 5. Load all credit payments (abonos) since apertura
        const { data: pgsData, error: pgsErr } = await supabase
          .from('pagos_credito')
          .select(`
            *,
            venta:venta_id (
              folio,
              clientes:cliente_id (
                nombre
              )
            )
          `)
          .gte('fecha', lastApertura.fecha);

        if (pgsErr) throw pgsErr;
        if (cancelled) return;
        setPagosCredito((pgsData as unknown as PagoCreditoCajaDB[]) || []);

      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching caja data:', err);
        setError(err instanceof Error ? err.message : 'Error al obtener información de caja.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCajaData();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Keep-alive: al volver a esta pantalla (sin remontar), recarga los datos del
  // servidor reutilizando el mismo disparador que el botón "Actualizar".
  useAlActivar(activo ?? true, () => setRefreshKey(prev => prev + 1));

  // Handle opening of caja
  const handleOpenCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const montoNum = Number(aperturaMonto);
    if (isNaN(montoNum) || montoNum < 0) {
      toast.error('Por favor ingrese un monto inicial válido.');
      return;
    }

    setIsOpening(true);
    try {
      const desc = aperturaNotas ? `Apertura de turno - Notas: ${aperturaNotas}` : 'Apertura de turno';
      const { error: insertErr } = await supabase
        .from('movimientos_caja')
        .insert([
          {
            vendedor_id: profile.id,
            tipo: 'apertura',
            monto: montoNum,
            descripcion: desc,
          },
        ]);

      if (insertErr) throw insertErr;

      setAperturaNotas('');
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error opening caja:', err);
      toast.error(err instanceof Error ? err.message : 'Error al abrir la caja.');
    } finally {
      setIsOpening(false);
    }
  };

  // Handle adding manual entry
  const handleAddManualMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    if (!profile || !activeApertura) return;

    const montoNum = Number(manualMonto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setManualError('El monto debe ser un número positivo.');
      return;
    }
    if (!manualDescripcion.trim()) {
      setManualError('La descripción es obligatoria.');
      return;
    }

    setIsSavingMovement(true);
    try {
      const { error: insertErr } = await supabase
        .from('movimientos_caja')
        .insert([
          {
            vendedor_id: profile.id,
            tipo: manualTipo,
            monto: montoNum,
            descripcion: manualDescripcion.trim(),
          },
        ]);

      if (insertErr) throw insertErr;

      setManualMonto('');
      setManualDescripcion('');
      setShowManualModal(false);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error inserting manual movement:', err);
      setManualError(err instanceof Error ? err.message : 'Error al registrar el movimiento.');
    } finally {
      setIsSavingMovement(false);
    }
  };

  // Handle Corte de Caja (Close Shift)
  const handleCloseShift = async () => {
    if (!profile || !activeApertura) return;

    const countedNum = Number(corteCounted);
    if (isNaN(countedNum) || countedNum < 0) {
      toast.error('Por favor ingrese un monto contado válido.');
      return;
    }

    setIsClosingShift(true);
    try {
      const expectedCash = expectedCashInDrawer;
      const diff = round2(countedNum - expectedCash);
      
      let diffText = 'Diferencia: $0.00 (Cuadrado)';
      if (diff > 0) diffText = `Diferencia: +$${diff.toFixed(2)} (Sobrante)`;
      if (diff < 0) diffText = `Diferencia: -$${Math.abs(diff).toFixed(2)} (Faltante)`;

      const closingDesc = `Corte de caja - Efectivo esperado: $${expectedCash.toFixed(2)}, Efectivo contado: $${countedNum.toFixed(2)}, ${diffText}. Notas: ${corteNotas}`;

      // Insert closing egreso to terminate this shift
      const { error: insertErr } = await supabase
        .from('movimientos_caja')
        .insert([
          {
            vendedor_id: profile.id,
            tipo: 'egreso',
            monto: countedNum, // Record the counted cash withdrawn from the register
            descripcion: closingDesc,
            es_corte: true,
          },
        ]);

      if (insertErr) throw insertErr;

      setCorteCounted('');
      setCorteNotas('');
      setShowCorteConfirm(false);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('Error closing shift:', err);
      toast.error(err instanceof Error ? err.message : 'Error al realizar el corte de caja.');
    } finally {
      setIsClosingShift(false);
    }
  };

  // Calculations for current active shift
  const startingCash = activeApertura ? Number(activeApertura.monto) : 0;

  const manualIngresos = sumMoney(
    manualMovements.filter(m => m.tipo === 'ingreso').map(m => Number(m.monto))
  );
  const manualEgresos = sumMoney(
    manualMovements.filter(m => m.tipo === 'egreso').map(m => Number(m.monto))
  );

  // Fuente única de verdad del dinero: agrupar ventas/abonos por método
  // (tarjeta + débito = "tarjeta"). El efectivo esperado cuenta SOLO efectivo.
  const resumen = calcularResumenCaja({
    startingCash,
    ventas: ventas.map(v => ({ tipo_pago: v.tipo_pago, total: Number(v.total) })),
    abonos: pagosCredito.map(p => ({ metodo: p.metodo, monto: Number(p.monto) })),
    ingresos: manualIngresos,
    egresos: manualEgresos,
  });
  const ventasEfectivo = resumen.ventasPorGrupo.efectivo;
  const ventasTarjeta = resumen.ventasPorGrupo.tarjeta;             // tarjeta + débito (banco)
  const ventasTransferencia = resumen.ventasPorGrupo.transferencia;
  const ventasCredito = resumen.ventasPorGrupo.credito;             // informativo (no es dinero)
  const abonosEfectivo = resumen.abonosPorGrupo.efectivo;
  const abonosTarjeta = resumen.abonosPorGrupo.tarjeta;             // tarjeta + débito (banco)
  const abonosTransferencia = resumen.abonosPorGrupo.transferencia;
  const expectedCashInDrawer = resumen.efectivoEsperado;

  // Construir el timeline de actividad del turno.
  const activities: ActivityItem[] = [];

  // 1. Movimientos manuales: SOLO apertura/ingreso/egreso. Las filas 'venta'/'abono' de
  //    movimientos_caja se muestran desde `ventas`/`pagosCredito` (con folio y cliente),
  //    así que aquí se excluyen para no duplicar.
  manualMovements
    .filter(m => m.tipo === 'apertura' || m.tipo === 'ingreso' || m.tipo === 'egreso')
    .forEach(m => {
      activities.push({
        id: m.id,
        clase: m.tipo as 'apertura' | 'ingreso' | 'egreso',
        grupo: 'efectivo',
        fecha: m.fecha,
        monto: Number(m.monto),
        descripcion: m.descripcion,
      });
    });

  // 2. Ventas del turno (todas, agrupadas por método).
  ventas.forEach(v => {
    const clienteNombre = (v as { clientes?: { nombre?: string } }).clientes?.nombre;
    const grupo = grupoCaja(v.tipo_pago);
    activities.push({
      id: v.id,
      clase: 'venta',
      grupo,
      fecha: v.fecha,
      monto: Number(v.total),
      descripcion: grupo === 'credito'
        ? `Nota a crédito folio ${v.folio}${clienteNombre ? ` — ${clienteNombre}` : ''}`
        : `Venta contado folio ${v.folio}${clienteNombre ? ` — ${clienteNombre}` : ''}`,
    });
  });

  // 3. Abonos a crédito del turno (agrupados por método).
  pagosCredito.forEach(p => {
    const clienteName = p.venta?.clientes?.nombre || 'Cliente';
    activities.push({
      id: p.id,
      clase: 'abono',
      grupo: grupoCaja(p.metodo),
      fecha: p.fecha,
      monto: Number(p.monto),
      descripcion: `Abono a remisión ${p.venta?.folio || ''} - ${clienteName}`,
    });
  });

  const sortedActivities = activities.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Icon name="clock" size={36} color="var(--green)" />
        <div style={{ marginTop: 16, fontSize: 15, fontWeight: 600 }}>Cargando información de caja...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content">
        <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 500, margin: '40px auto' }}>
          <div style={{ color: 'var(--red)', marginBottom: 16 }}><Icon name="alert" size={48} /></div>
          <h2 style={{ color: 'var(--ink)' }}>Error de Carga</h2>
          <p style={{ marginTop: 8, color: 'var(--muted)' }}>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setRefreshKey(prev => prev + 1)}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // SCREEN A: CAJA CERRADA (Apertura Form)
  if (!activeApertura) {
    return (
      <>
        <Topbar title="Flujo de Caja" subtitle="Caja Cerrada" />
        <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 40, alignItems: 'center' }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 32, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'var(--red-soft)',
                color: 'var(--red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <Icon name="cash" size={32} />
              </div>
              <h2 className="h2" style={{ color: 'var(--ink)', margin: 0 }}>Apertura de Caja</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                Inicie un nuevo turno de caja ingresando el fondo de efectivo inicial.
              </p>
            </div>

            <form onSubmit={handleOpenCaja} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="apertura-monto" className="label">Fondo Fijo Inicial (Efectivo) *</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted)',
                    fontWeight: 600
                  }}>$</span>
                  <input
                    id="apertura-monto"
                    className="input num"
                    type="number"
                    step="any"
                    required
                    value={aperturaMonto}
                    onChange={e => setAperturaMonto(e.target.value)}
                    placeholder="0.00"
                    disabled={isOpening}
                    style={{ paddingLeft: 24, fontSize: 16, fontWeight: 'bold' }}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                  Efectivo de respaldo asignado al cajón para dar cambio.
                </span>
              </div>

              <div>
                <label htmlFor="apertura-notas" className="label">Notas / Observaciones de Apertura</label>
                <textarea
                  id="apertura-notas"
                  className="input"
                  rows={3}
                  value={aperturaNotas}
                  onChange={e => setAperturaNotas(e.target.value)}
                  placeholder="Ej. Cambio recibido en denominaciones chicas..."
                  disabled={isOpening}
                  style={{ padding: 10, resize: 'none', fontSize: 13 }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isOpening}
                style={{ height: 48, fontSize: 14, fontWeight: 600, marginTop: 8 }}
              >
                {isOpening ? 'Iniciando Turno...' : 'Abrir Caja e Iniciar Turno'}
              </button>
            </form>
          </div>

          <div style={{ width: '100%', maxWidth: 800 }}>
            {renderPastShifts()}
          </div>
        </div>
      </>
    );
  }

  // SCREEN B: CAJA ABIERTA (Shift Dashboard, Logs, Closure Panel)
  const difference = corteCounted ? round2(Number(corteCounted) - expectedCashInDrawer) : 0;

  return (
    <>
      <style>{`
        .caja-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .caja-stat-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }
        .caja-stat-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .caja-stat-value {
          font-size: 22px;
          font-weight: 800;
          color: var(--ink);
        }
        .caja-dashboard-layout {
          display: grid;
          grid-template-columns: 3fr 2fr;
          gap: 24px;
        }
        .caja-breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid var(--line-2);
          font-size: 13px;
        }
        .caja-breakdown-row.total {
          border-top: 2px solid var(--ink);
          border-bottom: 2px solid var(--ink);
          font-weight: bold;
          font-size: 14px;
          color: var(--ink);
          margin-top: 10px;
          padding: 12px 0;
        }
        .caja-timeline-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          border-bottom: 1px solid var(--line-2);
          font-size: 12px;
        }
        .caja-timeline-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
        }
        .caja-timeline-icon.apertura { background: var(--green-soft); color: var(--green); }
        .caja-timeline-icon.ingreso { background: var(--green-soft); color: var(--green); }
        .caja-timeline-icon.egreso { background: var(--red-soft); color: var(--red); }
        .caja-timeline-icon.venta_efectivo { background: oklch(0.96 0.03 200); color: oklch(0.5 0.15 200); }
        .caja-timeline-icon.venta_tarjeta { background: oklch(0.94 0.02 240); color: oklch(0.45 0.1 240); }
        .caja-timeline-icon.abono_efectivo { background: oklch(0.96 0.03 160); color: oklch(0.45 0.15 160); }
        .caja-timeline-icon.abono_transferencia { background: oklch(0.96 0.02 280); color: oklch(0.5 0.1 280); }
        .caja-timeline-icon.venta_credito { background: var(--amber-soft, oklch(0.96 0.04 80)); color: oklch(0.5 0.14 70); }

        .caja-corte-diff-badge {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
        }
        .caja-corte-diff-badge.cuadrado { background: var(--green-soft); color: var(--green-2); }
        .caja-corte-diff-badge.sobrante { background: var(--green-soft); color: var(--green-2); }
        .caja-corte-diff-badge.faltante { background: var(--red-soft); color: var(--red); }

        @media (max-width: 1024px) {
          .caja-dashboard-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .caja-stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <Topbar title="Flujo de Caja" subtitle={`Turno iniciado: ${formatDate(activeApertura.fecha)}`}>
        <button className="btn btn-secondary" onClick={() => setRefreshKey(prev => prev + 1)}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
        <button className="btn btn-primary" onClick={() => setShowManualModal(true)}>
          <Icon name="plus" size={16} />
          Ingresar / Retirar Efectivo
        </button>
      </Topbar>

      <div className="content">
        {/* TOP STATUS KPIS */}
        <div className="caja-stats-grid">
          <div className="caja-stat-card">
            <div className="caja-stat-label">Fondo de Apertura</div>
            <div className="caja-stat-value num">{fmtMXN(startingCash)}</div>
          </div>
          <div className="caja-stat-card" style={{ borderLeft: '3px solid var(--green)' }}>
            <div className="caja-stat-label">Efectivo Estimado (Caja)</div>
            <div className="caja-stat-value num" style={{ color: 'var(--green-2)' }}>{fmtMXN(expectedCashInDrawer)}</div>
          </div>
          <div className="caja-stat-card">
            <div className="caja-stat-label">Ventas Totales Turno</div>
            <div className="caja-stat-value num">{fmtMXN(sumMoney(ventas.filter(v => v.estado !== 'devuelta').map(v => Number(v.total))))}</div>
          </div>
        </div>

        <div className="caja-dashboard-layout">
          {/* LEFT COLUMN: DETAILS & TIMELINE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* CASH FLOW DETAILED STATEMENT */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, borderBottom: '2px solid var(--line)', paddingBottom: 10, marginBottom: 14 }}>
                Resumen de Efectivo en Caja
              </div>
              
              <div className="caja-breakdown-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Fondo Fijo Inicial (Apertura)
                    <button
                      type="button"
                      onClick={() => setShowAperturaDetalle(!showAperturaDetalle)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver detalles de apertura"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showAperturaDetalle ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num font-bold">{fmtMXN(startingCash)}</span>
                </div>
                {showAperturaDetalle && (
                  <div style={{
                    marginTop: 6,
                    background: 'var(--surface-2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink-2)', marginBottom: 2 }}>Detalle de Apertura de Caja:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>Fecha y Hora:</span>
                        <span>{formatDate(activeApertura.fecha)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>Cajero / Vendedor:</span>
                        <span>{activeApertura.vendedor?.nombre || 'Desconocido'}</span>
                      </div>
                      {activeApertura.descripcion && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                          <span style={{ color: 'var(--muted)' }}>Notas:</span>
                          <span style={{ fontStyle: 'italic', background: 'var(--surface)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--line-2)' }}>
                            {activeApertura.descripcion}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="caja-breakdown-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    (+) Ventas en Efectivo
                    <button
                      type="button"
                      onClick={() => setShowVentasEfectivo(!showVentasEfectivo)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de ventas en efectivo"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showVentasEfectivo ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num" style={{ color: 'var(--green-2)' }}>{fmtMXN(ventasEfectivo)}</span>
                </div>
                {showVentasEfectivo && (
                  <div style={{
                    marginTop: 6,
                    background: 'var(--surface-2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink-2)', marginBottom: 2 }}>Desglose de Ventas en Efectivo:</div>
                    {ventas.filter(v => v.tipo_pago === 'efectivo').length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay ventas en efectivo registradas en este turno.</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {ventas.filter(v => v.tipo_pago === 'efectivo').map(v => (
                            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{v.folio} ({new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}){v.estado === 'devuelta' ? ' · devuelta' : ''}</span>
                              <span className="num font-bold">{fmtMXN(Number(v.total))}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--ink)' }}>
                          <span>Suma Total:</span>
                          <span className="num">{fmtMXN(ventasEfectivo)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="caja-breakdown-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    (+) Abonos a Crédito (Efectivo)
                    <button
                      type="button"
                      onClick={() => setShowAbonosEfectivo(!showAbonosEfectivo)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de abonos en efectivo"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showAbonosEfectivo ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num" style={{ color: 'var(--green-2)' }}>{fmtMXN(abonosEfectivo)}</span>
                </div>
                {showAbonosEfectivo && (
                  <div style={{
                    marginTop: 6,
                    background: 'var(--surface-2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink-2)', marginBottom: 2 }}>Desglose de Abonos (Efectivo):</div>
                    {pagosCredito.filter(p => p.metodo === 'efectivo').length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay abonos en efectivo registrados en este turno.</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {pagosCredito.filter(p => p.metodo === 'efectivo').map(p => {
                            const cli = p.venta?.clientes?.nombre || 'Cliente';
                            const fol = p.venta?.folio || 'Venta';
                            return (
                              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{p.folio_pago} (Ref: {fol} - {cli})</span>
                                <span className="num font-bold">{fmtMXN(Number(p.monto))}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--ink)' }}>
                          <span>Suma Total:</span>
                          <span className="num">{fmtMXN(abonosEfectivo)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="caja-breakdown-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    (+) Entradas Manuales (Ingresos)
                    <button
                      type="button"
                      onClick={() => setShowIngresos(!showIngresos)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de ingresos manuales"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showIngresos ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num" style={{ color: 'var(--green-2)' }}>{fmtMXN(manualIngresos)}</span>
                </div>
                {showIngresos && (
                  <div style={{
                    marginTop: 6,
                    background: 'var(--surface-2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink-2)', marginBottom: 2 }}>Desglose de Ingresos Manuales:</div>
                    {manualMovements.filter(m => m.tipo === 'ingreso' && m.descripcion !== 'Apertura de turno' && !m.descripcion.startsWith('Apertura de turno')).length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay ingresos manuales registrados en este turno.</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {manualMovements.filter(m => m.tipo === 'ingreso' && m.descripcion !== 'Apertura de turno' && !m.descripcion.startsWith('Apertura de turno')).map(m => (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{m.descripcion} ({new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                              <span className="num font-bold">{fmtMXN(Number(m.monto))}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--ink)' }}>
                          <span>Suma Total:</span>
                          <span className="num">{fmtMXN(sumMoney(manualMovements.filter(m => m.tipo === 'ingreso' && m.descripcion !== 'Apertura de turno' && !m.descripcion.startsWith('Apertura de turno')).map(m => Number(m.monto))))}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="caja-breakdown-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    (-) Salidas y Devoluciones (Efectivo)
                    <button
                      type="button"
                      onClick={() => setShowEgresos(!showEgresos)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de egresos manuales"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showEgresos ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num" style={{ color: 'var(--red)' }}>-{fmtMXN(manualEgresos)}</span>
                </div>
                {showEgresos && (
                  <div style={{
                    marginTop: 6,
                    background: 'var(--surface-2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink-2)', marginBottom: 2 }}>Desglose de Salidas y Devoluciones (Efectivo):</div>
                    <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4 }}>Incluye retiros manuales y reembolsos de devolución en efectivo. Las devoluciones por transferencia o tarjeta no afectan el efectivo del cajón.</div>
                    {manualMovements.filter(m => m.tipo === 'egreso' && !m.descripcion.startsWith('Corte de caja')).length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay salidas ni devoluciones en efectivo en este turno.</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {manualMovements.filter(m => m.tipo === 'egreso' && !m.descripcion.startsWith('Corte de caja')).map(m => (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{m.descripcion} ({new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                              <span className="num font-bold">-{fmtMXN(Number(m.monto))}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--ink)' }}>
                          <span>Suma Total:</span>
                          <span className="num">-{fmtMXN(sumMoney(manualMovements.filter(m => m.tipo === 'egreso' && !m.descripcion.startsWith('Corte de caja')).map(m => Number(m.monto))))}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <div className="caja-breakdown-row total" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    (=) Efectivo Neto Esperado
                    <button
                      type="button"
                      onClick={() => setShowTodosEfectivo(!showTodosEfectivo)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de todos los movimientos de efectivo"
                    >
                      <Icon name="eye" size={14} style={{ opacity: showTodosEfectivo ? 1 : 0.5 }} />
                    </button>
                  </span>
                  <span className="num">{fmtMXN(expectedCashInDrawer)}</span>
                </div>
                {showTodosEfectivo && (
                  <div style={{
                    marginTop: 8,
                    background: 'var(--surface-2)',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--line-2)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontWeight: 'normal',
                    color: 'var(--ink-2)'
                  }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--ink)', marginBottom: 2 }}>
                      Desglose Completo de Efectivo (Flujo de Caja):
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Apertura */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--line-2)', paddingBottom: 4 }}>
                        <span>
                          <strong>Fondo Inicial (Apertura)</strong>
                          {activeApertura?.descripcion && ` - ${activeApertura.descripcion}`}
                        </span>
                        <span className="num font-bold">{fmtMXN(startingCash)}</span>
                      </div>

                      {/* Ventas en efectivo */}
                      {ventas.filter(v => v.tipo_pago === 'efectivo').map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 8 }}>
                          <span>Venta {v.folio} ({new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                          <span className="num font-bold" style={{ color: 'var(--green-2)' }}>+{fmtMXN(Number(v.total))}</span>
                        </div>
                      ))}

                      {/* Abonos en efectivo */}
                      {pagosCredito.filter(p => p.metodo === 'efectivo').map(p => {
                        const cli = p.venta?.clientes?.nombre || 'Cliente';
                        const fol = p.venta?.folio || 'Venta';
                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 8 }}>
                            <span>Abono {p.folio_pago} (Ref: {fol} - {cli})</span>
                            <span className="num font-bold" style={{ color: 'var(--green-2)' }}>+{fmtMXN(Number(p.monto))}</span>
                          </div>
                        );
                      })}

                      {/* Ingresos Manuales */}
                      {manualMovements.filter(m => m.tipo === 'ingreso' && m.descripcion !== 'Apertura de turno' && !m.descripcion.startsWith('Apertura de turno')).map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 8 }}>
                          <span>Ingreso: {m.descripcion} ({new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                          <span className="num font-bold" style={{ color: 'var(--green-2)' }}>+{fmtMXN(Number(m.monto))}</span>
                        </div>
                      ))}

                      {/* Egresos Manuales */}
                      {manualMovements.filter(m => m.tipo === 'egreso' && !m.descripcion.startsWith('Corte de caja')).map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 8 }}>
                          <span>Retiro: {m.descripcion} ({new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                          <span className="num font-bold" style={{ color: 'var(--red)' }}>-{fmtMXN(Number(m.monto))}</span>
                        </div>
                      ))}
                    </div>

                    {/* Resumen de la Suma */}
                    <div style={{
                      borderTop: '2px solid var(--line)',
                      paddingTop: 8,
                      marginTop: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      fontSize: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--ink)' }}>
                        <span>Cálculo de Verificación (Cuadre):</span>
                        <span>
                          {fmtMXN(startingCash)} + {fmtMXN(ventasEfectivo)} + {fmtMXN(abonosEfectivo)} + {fmtMXN(manualIngresos)} - {fmtMXN(manualEgresos)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'extrabold', color: 'var(--green-2)', borderTop: '1px solid var(--line)', paddingTop: 4 }}>
                        <span>Efectivo Neto Esperado:</span>
                        <span className="num">{fmtMXN(expectedCashInDrawer)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECONDARY METRICS (NON-CASH) */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Ventas con Tarjeta/Débito (Banco)
                    <button
                      type="button"
                      onClick={() => setShowVentasTarjeta(!showVentasTarjeta)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de ventas con tarjeta"
                    >
                      <Icon name="eye" size={13} style={{ opacity: showVentasTarjeta ? 1 : 0.5 }} />
                    </button>
                  </div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(ventasTarjeta)}</div>
                  {showVentasTarjeta && (
                    <div style={{
                      marginTop: 6,
                      background: 'var(--surface-2)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--line-2)',
                      fontSize: '11px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      {ventas.filter(v => grupoCaja(v.tipo_pago) === 'tarjeta').length === 0 ? (
                        <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay ventas con tarjeta/débito.</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {ventas.filter(v => grupoCaja(v.tipo_pago) === 'tarjeta').map(v => (
                              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{v.folio}</span>
                                <span className="num font-bold">{fmtMXN(Number(v.total))}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <span>Total:</span>
                            <span className="num">{fmtMXN(ventasTarjeta)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Abonos por Transferencia (Banco)
                    <button
                      type="button"
                      onClick={() => setShowAbonosTransferencia(!showAbonosTransferencia)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Ver desglose de abonos por transferencia"
                    >
                      <Icon name="eye" size={13} style={{ opacity: showAbonosTransferencia ? 1 : 0.5 }} />
                    </button>
                  </div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(abonosTransferencia)}</div>
                  {showAbonosTransferencia && (
                    <div style={{
                      marginTop: 6,
                      background: 'var(--surface-2)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--line-2)',
                      fontSize: '11px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      {pagosCredito.filter(p => p.metodo === 'transferencia').length === 0 ? (
                        <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No hay abonos por transferencia.</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pagosCredito.filter(p => p.metodo === 'transferencia').map(p => (
                              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{p.folio_pago} (Ref: {p.venta?.folio})</span>
                                <span className="num font-bold">{fmtMXN(Number(p.monto))}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <span>Total:</span>
                            <span className="num">{fmtMXN(abonosTransferencia)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* HISTORIAL DE ACTIVIDAD DEL TURNO — dividido por método de pago */}
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, borderBottom: '2px solid var(--line)', paddingBottom: 10, marginBottom: 4 }}>
                Historial de Actividad del Turno
              </div>

              {/* Resumen por método (ventas + abonos del turno) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {([
                  { grupo: 'efectivo' as const, total: ventasEfectivo + abonosEfectivo },
                  { grupo: 'tarjeta' as const, total: ventasTarjeta + abonosTarjeta },
                  { grupo: 'transferencia' as const, total: ventasTransferencia + abonosTransferencia },
                  { grupo: 'credito' as const, total: ventasCredito },
                ]).map(({ grupo, total }) => (
                  <div key={grupo} style={{
                    display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 8,
                    background: GRUPO_UI[grupo].chipBg, color: GRUPO_UI[grupo].chipFg, minWidth: 120, flex: '1 1 120px',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {GRUPO_UI[grupo].label}{grupo === 'credito' ? ' · informativo' : ''}
                    </span>
                    <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{fmtMXN(total)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                Tarjeta y débito se agrupan juntos (banco). El crédito de tienda (fiado) es informativo: no es dinero en efectivo ni en banco.
              </div>

              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {sortedActivities.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>
                    No se han registrado movimientos en este turno.
                  </div>
                ) : (
                  sortedActivities.map((act) => {
                    const esManual = act.clase === 'apertura' || act.clase === 'ingreso' || act.clase === 'egreso';
                    const ui = GRUPO_UI[act.grupo];
                    const chipLabel = esManual
                      ? (act.clase === 'apertura' ? 'Apertura' : act.clase === 'ingreso' ? 'Ingreso' : 'Egreso')
                      : ui.label;
                    const chipBg = esManual ? 'var(--surface-2)' : ui.chipBg;
                    const chipFg = esManual ? 'var(--muted)' : ui.chipFg;
                    const montoColor = act.clase === 'egreso' ? 'var(--red)'
                      : act.grupo === 'credito' ? GRUPO_UI.credito.chipFg
                      : act.grupo === 'efectivo' ? 'var(--green-2)'
                      : 'var(--ink)';
                    const signo = act.clase === 'egreso' ? '-' : '';
                    return (
                      <div className="caja-timeline-item" key={act.id}>
                        <div className="caja-timeline-icon" style={{ background: chipBg, color: chipFg }}>
                          <Icon name={CLASE_ICON[act.clase]} size={15} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{act.descripcion}</span>
                            <span className="num font-bold" style={{ color: montoColor, fontSize: 13, whiteSpace: 'nowrap' }}>
                              {signo}{fmtMXN(act.monto)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                              padding: '2px 8px', borderRadius: 999, background: chipBg, color: chipFg,
                            }}>{chipLabel}</span>
                            {act.grupo === 'credito' && !esManual && (
                              <span style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic' }}>no entra a caja</span>
                            )}
                            <span style={{ color: 'var(--muted)', fontSize: 10 }}>{formatDate(act.fecha)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: CORTE DE CAJA (Shift Close Form) */}
          <div>
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid var(--line)', paddingBottom: 12 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'var(--red-soft)',
                  color: 'var(--red)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px auto'
                }}>
                  <Icon name="logout" size={20} />
                </div>
                <h3 className="h3" style={{ color: 'var(--ink)', margin: 0 }}>Corte de Caja / Cierre</h3>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Compare el efectivo físico contra el saldo estimado en sistema.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Efectivo Estimado en Caja:</span>
                  <span className="num font-bold" style={{ color: 'var(--green-2)' }}>{fmtMXN(expectedCashInDrawer)}</span>
                </div>

                <div>
                  <label htmlFor="corte-monto" className="label">Efectivo Físico Contado *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)',
                      fontWeight: 600
                    }}>$</span>
                    <input
                      id="corte-monto"
                      className="input num"
                      type="number"
                      step="any"
                      required
                      value={corteCounted}
                      onChange={e => setCorteCounted(e.target.value)}
                      placeholder="Ingrese el conteo de efectivo"
                      style={{ paddingLeft: 24, fontSize: 15, fontWeight: 'bold' }}
                    />
                  </div>
                </div>

                {corteCounted && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)' }}>Diferencia calculada:</span>
                      <span className={`caja-corte-diff-badge ${difference === 0 ? 'cuadrado' : difference > 0 ? 'sobrante' : 'faltante'}`}>
                        {difference === 0 ? 'Cuadrado ($0.00)' : difference > 0 ? `Sobrante (+${fmtMXN(difference)})` : `Faltante (-${fmtMXN(Math.abs(difference))})`}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="corte-notas" className="label">Notas / Observaciones de Cierre</label>
                  <textarea
                    id="corte-notas"
                    className="input"
                    rows={3}
                    value={corteNotas}
                    onChange={e => setCorteNotas(e.target.value)}
                    placeholder="Ej. Faltaron $5.00 por monedas de cambio. Arqueo correcto..."
                    style={{ padding: 10, resize: 'none', fontSize: 12 }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: 'var(--red)', borderColor: 'var(--red)', height: 44, fontWeight: 600, marginTop: 8 }}
                  disabled={!corteCounted}
                  onClick={() => setShowCorteConfirm(true)}
                >
                  Realizar Corte y Cerrar Turno
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* HISTORIAL DE TURNOS ANTERIORES */}
        <div style={{ maxWidth: 800, margin: '24px auto 0 auto', width: '100%' }}>
          {renderPastShifts()}
        </div>
      </div>

      {/* MANUAL MOVEMENT MODAL */}
      {showManualModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h3" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="cash" size={20} color="var(--green)" />
                Registrar Movimiento Manual
              </div>
              <button onClick={() => { setShowManualModal(false); setManualError(null); }} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--muted)' }}>
                <Icon name="x" size={20} />
              </button>
            </div>

            <form onSubmit={handleAddManualMovement} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {manualError && (
                <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="alert" size={14} />
                  <span>{manualError}</span>
                </div>
              )}

              <div>
                <label className="label">Tipo de Movimiento *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button
                    type="button"
                    className={`btn ${manualTipo === 'ingreso' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setManualTipo('ingreso')}
                    style={{ height: 38 }}
                  >
                    Ingreso (+)
                  </button>
                  <button
                    type="button"
                    className={`btn ${manualTipo === 'egreso' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setManualTipo('egreso')}
                    style={{
                      height: 38,
                      background: manualTipo === 'egreso' ? 'var(--red)' : '',
                      borderColor: manualTipo === 'egreso' ? 'var(--red)' : ''
                    }}
                  >
                    Egreso / Retiro (-)
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="manual-monto" className="label">Monto de Efectivo *</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                  <input
                    id="manual-monto"
                    className="input num"
                    type="number"
                    step="any"
                    required
                    value={manualMonto}
                    onChange={e => setManualMonto(e.target.value)}
                    placeholder="0.00"
                    disabled={isSavingMovement}
                    style={{ paddingLeft: 24, fontSize: 15, fontWeight: 'bold' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="manual-desc" className="label">Concepto / Descripción *</label>
                <input
                  id="manual-desc"
                  className="input"
                  type="text"
                  required
                  value={manualDescripcion}
                  onChange={e => setManualDescripcion(e.target.value)}
                  placeholder="Ej. Compra de papelería, Retiro por seguridad..."
                  disabled={isSavingMovement}
                  style={{ fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  disabled={isSavingMovement}
                  onClick={() => { setShowManualModal(false); setManualError(null); }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: manualTipo === 'egreso' ? 'var(--red)' : '',
                    borderColor: manualTipo === 'egreso' ? 'var(--red)' : ''
                  }}
                  disabled={isSavingMovement}
                >
                  {isSavingMovement ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLOSE SHIFT CONFIRMATION MODAL */}
      {showCorteConfirm && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
              <Icon name="alert" size={24} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>¿Confirmar Corte y Cierre de Turno?</div>
            </div>
            
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p>
                Al realizar el corte, <strong>el turno actual de caja se dará por cerrado</strong>. 
                Se registrará un retiro final con la cantidad física contada.
              </p>
              
              <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Efectivo Estimado:</span>
                  <span className="num font-bold">{fmtMXN(expectedCashInDrawer)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Efectivo Contado:</span>
                  <span className="num font-bold">{fmtMXN(Number(corteCounted))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px dashed var(--line)', paddingTop: 6, color: difference === 0 ? 'var(--green-2)' : difference > 0 ? 'var(--green-2)' : 'var(--red)' }}>
                  <span>Diferencia:</span>
                  <span>{difference === 0 ? 'Cuadrado' : difference > 0 ? `+${fmtMXN(difference)}` : `-${fmtMXN(Math.abs(difference))}`}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                disabled={isClosingShift}
                onClick={() => setShowCorteConfirm(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                disabled={isClosingShift}
                onClick={handleCloseShift}
              >
                {isClosingShift ? 'Cerrando Turno...' : 'Sí, Cerrar Caja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
