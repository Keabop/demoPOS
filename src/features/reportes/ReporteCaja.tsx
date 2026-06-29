import React, { useState, useEffect, useMemo, useId } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import type { ReporteCajaData } from '../../types';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

// ── Helpers compartidos con ReporteVentas (estilo unificado) ──────────────────
const fmtNum = (n: number) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const formatK = (v: number) => (v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '—';

// Mini-gráfica (sparkline) 120x26
function sparkPath(vals: number[]): { area: string; line: string } {
  if (vals.length < 2) return { area: '', line: '' };
  const w = 120, h = 26;
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 2 - ((v - min) / range) * (h - 4)] as const);
  const line = 'M ' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
  return { line, area: `${line} L ${w} ${h} L 0 ${h} Z` };
}

// ── KPI card (mismo lenguaje visual que ReporteVentas) ────────────────────────
interface KpiProps {
  label: string; value: string; icon: string; iconBg: string; iconColor: string;
  spark: number[]; sub?: React.ReactNode; valueColor?: string;
}
const KpiCard: React.FC<KpiProps> = ({ label, value, icon, iconBg, iconColor, spark, sub, valueColor }) => {
  const gid = `cks-${useId().replace(/:/g, '')}`;
  const sp = sparkPath(spark);
  return (
    <div className="card ag-rise" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={icon} size={16} color={iconColor} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 800, color: valueColor || 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</span>
        {sp.line && (
          <svg viewBox="0 0 120 26" preserveAspectRatio="none" style={{ width: '100%', height: 22, display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={sp.area} fill={`url(#${gid})`} />
            <path d={sp.line} fill="none" stroke="var(--green)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          </svg>
        )}
        {sub && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{sub}</span>
        )}
      </div>
    </div>
  );
};

const BarRow: React.FC<{ label: string; value: string; pct: number; color: string }> = ({ label, value, pct, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: 'none' }} />{label}
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>{value}</span>
    </div>
    <div style={{ height: 8, borderRadius: 5, background: 'var(--line-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, borderRadius: 5, background: color }} />
    </div>
  </div>
);

const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

const AVATARS = [
  { bg: 'var(--green-soft)', color: 'var(--green-2)' },
  { bg: 'var(--blue-soft)', color: 'var(--blue)' },
  { bg: 'var(--amber-soft)', color: 'oklch(0.5 0.12 70)' },
  { bg: 'var(--line-2)', color: 'var(--ink-2)' },
];

// Duración legible
const getDurationString = (ms: number | null) => {
  if (ms === null || ms <= 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
};

const fmtHora = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const fmtFecha = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

interface TipoBadge { label: string; cls: string; positive: boolean }
const tipoBadge = (tipo: string): TipoBadge => {
  if (tipo === 'apertura') return { label: 'Apertura', cls: 'gray', positive: true };
  if (tipo === 'venta') return { label: 'Venta', cls: 'green', positive: true };
  if (tipo === 'abono') return { label: 'Abono', cls: 'green', positive: true };
  if (tipo === 'ingreso') return { label: 'Ingreso', cls: 'green', positive: true };
  return { label: 'Egreso', cls: 'red', positive: false };
};

const EMPTY_STATS = { fondos: 0, ventas: 0, abonos: 0, ingresosManual: 0, egresos: 0, enCaja: 0, ingresosTotales: 0, netDiscrepancy: 0, ventaCount: 0 };

export const ReporteCaja: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<ReporteCajaData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        // La reconstrucción de turnos, KPIs e ingresos por hora se hacen en
        // Postgres (fn_reporte_caja); el front solo arma derivados pequeños.
        const { data: rpc, error: rpcError } = await supabase.rpc('fn_reporte_caja', {
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
        });
        if (rpcError) throw rpcError;
        if (!active) return;
        setData(rpc as ReporteCajaData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los movimientos de caja.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate]);

  const shifts = useMemo(() => data?.shifts ?? [], [data]);
  const stats = data?.stats ?? EMPTY_STATS;
  const closedShifts = useMemo(() => shifts.filter(s => s.isClosed), [shifts]);
  const activeShift = useMemo(() => shifts.find(s => !s.isClosed) ?? null, [shifts]);

  const sparkData = useMemo(() => ({
    enCaja: shifts.map(s => s.efectivoSistema),
    ingresos: shifts.map(s => s.salesTotal + s.abonosTotal + s.manualIngresos),
    egresos: shifts.map(s => s.manualEgresos),
    arqueo: closedShifts.map(s => s.discrepancy),
  }), [shifts, closedShifts]);

  const hourly = useMemo(() => {
    const arr = data?.hourly ?? [];
    if (arr.length === 0) return { rows: [] as { hour: number; total: number }[], max: 0, peak: null as { hour: number; total: number } | null };
    const byHour = new Map<number, number>();
    for (const h of arr) byHour.set(h.hour, Number(h.total) || 0);
    const hours = arr.map(h => h.hour);
    const minH = Math.min(...hours), maxH = Math.max(...hours);
    const rows: { hour: number; total: number }[] = [];
    for (let h = minH; h <= maxH; h++) rows.push({ hour: h, total: byHour.get(h) || 0 });
    const max = Math.max(...rows.map(r => r.total), 1);
    const peak = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0]);
    return { rows, max, peak: peak.total > 0 ? peak : null };
  }, [data]);

  const composicion = useMemo(() => {
    const items = [
      { label: 'Ventas cobradas', value: stats.ventas, color: 'var(--green)' },
      { label: 'Cobranza de crédito', value: stats.abonos, color: 'oklch(0.6 0.13 160)' },
      { label: 'Fondos de apertura', value: stats.fondos, color: 'var(--blue)' },
      { label: 'Ingresos manuales', value: stats.ingresosManual, color: 'oklch(0.64 0.1 200)' },
      { label: 'Egresos / retiros', value: stats.egresos, color: 'var(--red)' },
    ].filter(i => i.value > 0);
    const max = items.length ? Math.max(...items.map(i => i.value)) : 1;
    return { items: items.map(i => ({ ...i, pct: max > 0 ? (i.value / max) * 100 : 0 })) };
  }, [stats]);

  const tableShift = data?.table_shift ?? null;
  const tableMovements = useMemo(() => data?.table_movimientos ?? [], [data]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="premium-loading-icon-wrapper" style={{ animation: 'spin 1.5s linear infinite' }}><Icon name="clock" size={32} color="var(--green)" /></div>
        <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>Consultando movimientos de caja...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--red)', border: '1px solid oklch(0.58 0.16 25 / 0.2)' }}>
        <Icon name="alert" size={36} color="var(--red)" style={{ marginBottom: 12 }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Error al cargar reporte</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{error}</div>
      </div>
    );
  }
  if (shifts.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          <Icon name="cash" size={28} color="var(--muted)" />
        </div>
        <div>
          <h4 style={{ margin: 0, color: 'var(--ink)', fontSize: 15 }}>Sin turnos registrados</h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, maxWidth: 360 }}>
            No se encontraron aperturas ni cortes de caja en el período seleccionado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* Turno activo */}
      {activeShift && (
        <div className="card ag-rise" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="badge green"><span className="dot" />Turno abierto</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
            <Icon name="cash" size={15} color="var(--muted)" /><strong style={{ fontWeight: 600 }}>Caja · {activeShift.vendedorName}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <Icon name="clock" size={15} color="var(--muted)" />Apertura <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{fmtHora(activeShift.aperturaFecha)}</span> · fondo <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{fmtMXN(activeShift.openingCash)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', marginLeft: 'auto' }}>
            <Icon name="trending-up" size={15} color="var(--green-2)" />Efectivo en caja <span className="num" style={{ color: 'var(--green-2)', fontWeight: 700 }}>{fmtMXN(activeShift.expectedCash)}</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(208px, 100%), 1fr))', gap: 14 }}>
        <KpiCard
          label="Efectivo en caja" icon="cash" iconBg="var(--green-soft)" iconColor="var(--green-2)"
          value={fmtMXN(stats.enCaja)} spark={sparkData.enCaja}
          sub={<>Fondos <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{fmtMXN(stats.fondos)}</span> + ventas</>}
        />
        <KpiCard
          label="Ingresos del período" icon="arrow-down" iconBg="var(--green-soft)" iconColor="var(--green-2)"
          value={fmtMXN(stats.ingresosTotales)} valueColor="var(--green-2)" spark={sparkData.ingresos}
          sub={<><span className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{fmtNum(stats.ventaCount)}</span>movimientos de cobro</>}
        />
        <KpiCard
          label="Egresos" icon="arrow-up" iconBg="var(--red-soft)" iconColor="var(--red)"
          value={fmtMXN(stats.egresos)} spark={sparkData.egresos}
          sub="Retiros, gastos y devoluciones"
        />
        <KpiCard
          label="Diferencia de arqueo" icon="alert" iconBg="var(--amber-soft)" iconColor="var(--amber)"
          value={`${stats.netDiscrepancy < 0 ? '−' : stats.netDiscrepancy > 0 ? '+' : ''}${fmtMXN(Math.abs(stats.netDiscrepancy))}`}
          valueColor={stats.netDiscrepancy < 0 ? 'oklch(0.5 0.12 70)' : stats.netDiscrepancy > 0 ? 'var(--green-2)' : 'var(--ink)'}
          spark={sparkData.arqueo}
          sub={`${closedShifts.length} ${closedShifts.length === 1 ? 'corte' : 'cortes'} · contado vs sistema`}
        />
      </div>

      {/* Ingresos por hora + Composición del flujo */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 20 }}>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="h3">Ingresos por hora del día</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Cobros registrados en caja · MXN</span>
            </div>
            {hourly.peak && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Hora pico</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-2)' }}>{String(hourly.peak.hour).padStart(2, '0')}:00 · {fmtMXN(hourly.peak.total)}</span>
              </div>
            )}
          </div>
          {hourly.rows.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin cobros registrados en este período.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200 }}>
              {hourly.rows.map(r => {
                const isPeak = hourly.peak !== null && r.hour === hourly.peak.hour;
                const h = Math.max(2, (r.total / hourly.max) * 160);
                return (
                  <div key={r.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 7, height: '100%' }}>
                    <span className="num" style={{ fontSize: 10, fontWeight: 700, color: isPeak ? 'var(--green-2)' : 'var(--ink-2)' }}>{formatK(r.total)}</span>
                    <div style={{ width: '100%', maxWidth: 34, height: h, borderRadius: '6px 6px 0 0', background: isPeak ? 'var(--green-2)' : 'var(--green)' }} />
                    <span style={{ fontSize: 10.5, color: isPeak ? 'var(--ink-2)' : 'var(--muted)', fontWeight: isPeak ? 700 : 600 }}>{String(r.hour).padStart(2, '0')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="h3">Composición del flujo</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Entradas y salidas del período</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {composicion.items.length === 0 ? (
              <span className="muted" style={{ fontSize: 13 }}>Sin movimientos en este período.</span>
            ) : composicion.items.map(i => (
              <BarRow key={i.label} label={i.label} value={fmtMXN(i.value)} pct={i.pct} color={i.color} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total cobrado</span>
            <span className="num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--green-2)' }}>{fmtMXN(stats.ingresosTotales)}</span>
          </div>
        </div>
      </div>

      {/* Cortes recientes + Movimientos del turno */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 20 }}>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={cardHead}>
            <span className="h3">Cortes recientes</span>
            <span className="badge gray">Últimos turnos</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {closedShifts.length === 0 ? (
              <span className="muted" style={{ fontSize: 13 }}>Aún no hay cortes cerrados en este período.</span>
            ) : [...closedShifts].reverse().slice(0, 6).map((s, i, arr) => {
              const isLast = i === arr.length - 1;
              const cuadrado = Math.abs(s.discrepancy) < 0.01;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: isLast ? 'none' : '1px solid var(--line-2)' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 999, background: AVATARS[i % AVATARS.length].bg, color: AVATARS[i % AVATARS.length].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{initialsOf(s.vendedorName)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.vendedorName}</span>
                    <span className="muted" style={{ fontSize: 11.5 }}>{fmtFecha(s.aperturaFecha)} · {fmtHora(s.aperturaFecha)}–{fmtHora(s.cierreFecha)}</span>
                  </div>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>{fmtMXN(s.countedCash)}</span>
                  {cuadrado ? (
                    <span className="badge green" style={{ width: 84, justifyContent: 'center' }}><span className="dot" />Cuadrado</span>
                  ) : s.discrepancy > 0 ? (
                    <span className="badge green" style={{ width: 84, justifyContent: 'center' }}><span className="dot" />+{fmtMXN(s.discrepancy)}</span>
                  ) : (
                    <span className="badge amber" style={{ width: 84, justifyContent: 'center' }}><span className="dot" />−{fmtMXN(Math.abs(s.discrepancy))}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={cardHead}>
            <span className="h3">Movimientos del turno</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{tableShift ? `${tableShift.isActive ? 'Turno abierto' : 'Último corte'} · ${tableShift.vendedorName}` : '—'}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
              <thead>
                <tr>
                  {['Hora', 'Tipo', 'Concepto', 'Monto'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 3 ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 700, padding: i === 0 ? '0 12px 12px 0' : i === 3 ? '0 0 12px 12px' : '0 12px 12px', borderBottom: '1px solid var(--line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableMovements.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin movimientos en este turno.</td></tr>
                ) : tableMovements.map((m, i, arr) => {
                  const isLast = i === arr.length - 1;
                  const bdr = isLast ? 'none' : '1px solid var(--line-2)';
                  const isCorte = m.tipo === 'egreso' && m.es_corte === true;
                  const badge = isCorte ? { label: 'Corte', cls: 'gray', positive: false } : tipoBadge(m.tipo);
                  const monto = Number(m.monto) || 0;
                  const concepto = m.descripcion?.replace(/^Corte de caja\s*-\s*/i, 'Corte de caja · ').split(',')[0] || '—';
                  return (
                    <tr className="vrow" key={m.id}>
                      <td className="num" style={{ padding: '11px 12px 11px 0', borderBottom: bdr, fontSize: 12.5, color: 'var(--muted-2)' }}>{fmtHora(m.fecha)}</td>
                      <td style={{ padding: '11px 12px', borderBottom: bdr }}><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                      <td style={{ padding: '11px 12px', borderBottom: bdr, fontSize: 13, color: 'var(--ink-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion || ''}>{concepto}</td>
                      <td className="num" style={{ textAlign: 'right', padding: '11px 0 11px 12px', borderBottom: bdr, fontSize: 13, fontWeight: m.tipo === 'apertura' ? 400 : 700, color: m.tipo === 'apertura' ? 'var(--ink-2)' : badge.positive ? 'var(--green-2)' : 'var(--red)' }}>
                        {m.tipo === 'apertura' ? fmtMXN(monto) : `${badge.positive ? '+' : '−'}${fmtMXN(monto)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Historial detallado de auditoría de turnos */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={cardHead}>
          <span className="h3">Historial de auditoría de turnos</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{shifts.length} {shifts.length === 1 ? 'turno' : 'turnos'} · {closedShifts.length} {closedShifts.length === 1 ? 'cerrado' : 'cerrados'}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                {[
                  { h: 'Cajero / Folio', a: 'left' as const },
                  { h: 'Apertura', a: 'left' as const },
                  { h: 'Cierre', a: 'left' as const },
                  { h: 'Duración', a: 'right' as const },
                  { h: 'Fondo', a: 'right' as const },
                  { h: 'Efectivo contado', a: 'right' as const },
                  { h: 'Diferencia', a: 'right' as const },
                ].map((c, i, arr) => (
                  <th key={c.h} style={{ textAlign: c.a, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 700, padding: i === 0 ? '0 12px 12px 0' : i === arr.length - 1 ? '0 0 12px 12px' : '0 12px 12px', borderBottom: '1px solid var(--line)' }}>{c.h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => {
                const isClosed = s.isClosed;
                const cuadrado = Math.abs(s.discrepancy) < 0.01;
                return (
                  <tr className="vrow" key={s.id}>
                    <td style={{ padding: '13px 12px 13px 0', borderBottom: '1px solid var(--line-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--green-soft)', color: 'var(--green-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{initialsOf(s.vendedorName)}</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{s.vendedorName}</span>
                          <span className="num" style={{ fontSize: 10.5, color: 'var(--muted)' }}>T-{s.id.slice(-6).toUpperCase()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="num" style={{ padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--ink-2)' }}>{fmtFecha(s.aperturaFecha)} {fmtHora(s.aperturaFecha)}</td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--ink-2)' }}>
                      {isClosed ? <span className="num">{fmtFecha(s.cierreFecha)} {fmtHora(s.cierreFecha)}</span> : <span className="badge green" style={{ fontSize: 10 }}><span className="dot" />Activo</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--muted)' }}>{getDurationString(s.durationMs)}</td>
                    <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, color: 'var(--ink-2)' }}>{fmtMXN(s.openingCash)}</td>
                    <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{isClosed ? fmtMXN(s.countedCash) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '13px 0 13px 12px', borderBottom: '1px solid var(--line-2)' }}>
                      {!isClosed ? (
                        <span className="badge gray" style={{ fontSize: 10 }}>—</span>
                      ) : cuadrado ? (
                        <span className="badge gray" style={{ fontSize: 10, fontWeight: 600 }}>Cuadrado</span>
                      ) : s.discrepancy > 0 ? (
                        <span className="badge green" style={{ fontSize: 10, fontWeight: 700 }}>+{fmtMXN(s.discrepancy)}</span>
                      ) : (
                        <span className="badge red" style={{ fontSize: 10, fontWeight: 700 }}>−{fmtMXN(Math.abs(s.discrepancy))}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
