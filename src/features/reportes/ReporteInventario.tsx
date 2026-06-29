import React, { useState, useEffect, useMemo, useId } from 'react';
import { supabase } from '../../lib/supabase';
import type { ReporteInventarioData } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

// ── Lenguaje visual compartido con ReporteVentas ─────────────────────────────
const GREEN_SHADES = [
  'oklch(0.50 0.13 145)', 'oklch(0.58 0.13 145)', 'oklch(0.64 0.12 145)',
  'oklch(0.70 0.10 145)', 'oklch(0.77 0.08 145)', 'oklch(0.84 0.06 145)',
];

const fmtNum = (n: number) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const formatK = (v: number) => (v >= 1_000_000 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtFecha = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

// Mini-gráfica (sparkline) 120x26 — igual que ReporteVentas
function sparkPath(vals: number[]): { area: string; line: string } {
  if (vals.length < 2) return { area: '', line: '' };
  const w = 120, h = 26;
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 2 - ((v - min) / range) * (h - 4)] as const);
  const line = 'M ' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
  return { line, area: `${line} L ${w} ${h} L 0 ${h} Z` };
}

// ── KPI card ─────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string; sublabel?: string; value: React.ReactNode; icon: string;
  iconBg: string; iconColor: string; spark: number[]; valueColor?: string;
}
const KpiCard: React.FC<KpiProps> = ({ label, sublabel, value, icon, iconBg, iconColor, spark, valueColor }) => {
  const gid = `spk-inv-${useId().replace(/:/g, '')}`;
  const sp = sparkPath(spark);
  return (
    <div className="card ag-rise" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--muted)' }}>
          {label}{sublabel && <span style={{ textTransform: 'none', fontWeight: 500 }}> {sublabel}</span>}
        </span>
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
      </div>
    </div>
  );
};

const BarRow: React.FC<{ label: string; value: string; pct: number; color: string }> = ({ label, value, pct, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>{value}</span>
    </div>
    <div style={{ height: 8, borderRadius: 5, background: 'var(--line-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, borderRadius: 5, background: color }} />
    </div>
  </div>
);

const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const thBase: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--line)' };
const tdBase: React.CSSProperties = { borderBottom: '1px solid var(--line-2)', fontSize: 13 };

const TIMELINE_MONTHS = 6; // gráfica "Lotes por caducar" (próximos 6 meses)
const EMPTY_KPIS = { valuation: 0, estimados: 0, expiringCount: 0, expiringValue: 0, lowStock: 0, skus: 0 };

export const ReporteInventario: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<ReporteInventarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        // Valuación, caducidad, rotación y críticos se agregan en Postgres
        // (fn_reporte_inventario); el front solo arma colores/proporciones.
        const { data: rpc, error: rpcError } = await supabase.rpc('fn_reporte_inventario', {
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
        });
        if (rpcError) throw rpcError;
        if (!active) return;
        setData(rpc as ReporteInventarioData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los datos de inventario.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate]);

  const metrics = data?.kpis ?? EMPTY_KPIS;

  const porCategoria = useMemo(() => {
    const arr = data?.por_categoria ?? [];
    const max = arr.length ? arr[0].total : 1;
    return arr.map((x, i) => ({ ...x, pct: max > 0 ? (x.total / max) * 100 : 0, color: GREEN_SHADES[Math.min(i, GREEN_SHADES.length - 1)] }));
  }, [data]);

  const expiryTimeline = useMemo(() => {
    const arr = data?.expiry ?? [];
    const max = Math.max(...arr.map(b => b.value), 1);
    return arr.map((b, i) => ({
      label: `${MESES[b.mes][0].toUpperCase()}${MESES[b.mes].slice(1)}`,
      count: b.count, value: b.value,
      h: (b.value / max) * 150,
      color: i <= 1 ? 'var(--red)' : i <= 3 ? 'var(--amber)' : 'var(--green)',
    }));
  }, [data]);

  const rotacion = useMemo(() => {
    const arr = data?.rotacion ?? [];
    const max = arr.length ? arr[0].ratio : 1;
    return arr.map((x, i) => ({ ...x, pct: max > 0 ? (x.ratio / max) * 100 : 0, color: i < 5 ? 'var(--green)' : 'oklch(0.80 0.07 145)' }));
  }, [data]);

  const criticos = useMemo(() => data?.criticos ?? [], [data]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="premium-loading-icon-wrapper" style={{ animation: 'spin 1.5s linear infinite' }}><Icon name="clock" size={32} color="var(--green)" /></div>
        <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>Obteniendo datos de inventario...</div>
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

  const valorEntero = Math.trunc(metrics.valuation);
  const valorCentavos = Math.round((metrics.valuation - valorEntero) * 100);

  const kpis: KpiProps[] = [
    {
      label: 'Valor del inventario', sublabel: '(a costo)',
      value: (
        <>
          ${fmtNum(valorEntero)}
          <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>.{String(valorCentavos).padStart(2, '0')}</span>
        </>
      ),
      icon: 'package', iconBg: 'var(--green-soft)', iconColor: 'var(--green-2)',
      spark: porCategoria.map(c => c.total).reverse(),
    },
    {
      label: 'SKUs activos', value: fmtNum(metrics.skus),
      icon: 'barcode', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)',
      spark: [],
    },
    {
      label: 'Productos con stock bajo', value: fmtNum(metrics.lowStock),
      icon: 'alert', iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)',
      valueColor: metrics.lowStock > 0 ? 'oklch(0.5 0.12 70)' : 'var(--ink)',
      spark: [],
    },
    {
      label: 'Lotes por caducar', sublabel: '(≤90 días)',
      value: (
        <>
          {fmtNum(metrics.expiringCount)}
          {metrics.expiringValue > 0 && <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}> · {formatK(metrics.expiringValue)}</span>}
        </>
      ),
      icon: 'clock', iconBg: 'var(--red-soft)', iconColor: 'var(--red)',
      spark: expiryTimeline.map(b => b.value),
    },
  ];

  const timelineMax = Math.max(...expiryTimeline.map(b => b.value), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(208px, 100%), 1fr))', gap: 14 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Valor de inventario por categoría */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="h3">Valor de inventario por categoría</span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {metrics.estimados > 0 ? 'Valuado a costo (estimado a precio donde no hay costo) · MXN' : 'Valuado a costo · MXN'}
            </span>
          </div>
          <span className="num" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>{fmtMXN(metrics.valuation)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          {porCategoria.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin inventario con stock activo.</span>
            : porCategoria.map((c, i) => <BarRow key={i} label={c.cat} value={fmtMXN(c.total)} pct={c.pct} color={c.color} />)}
        </div>
      </div>

      {/* Lotes por caducar (gráfica) + Rotación */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="h3">Lotes por caducar</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Valor en riesgo · próximos {TIMELINE_MONTHS} meses</span>
            </div>
          </div>
          {timelineMax <= 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin lotes por caducar en el horizonte.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 200 }}>
              {expiryTimeline.map((b, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 7, height: '100%' }}>
                  {b.value > 0 && <span className="num" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-2)' }}>{formatK(b.value)}</span>}
                  <div style={{ width: '100%', maxWidth: 40, height: Math.max(b.value > 0 ? 6 : 0, b.h), borderRadius: '6px 6px 0 0', background: b.color }} />
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textAlign: 'center', lineHeight: 1.25 }}>
                    {b.label}<br /><span style={{ color: 'var(--muted-2)' }}>{b.count} {b.count === 1 ? 'lote' : 'lotes'}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="h3">Rotación de inventario</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Vendido ÷ existencia · por categoría · periodo</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {rotacion.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin ventas en el periodo para calcular rotación.</span>
              : rotacion.slice(0, 6).map((r, i) => <BarRow key={i} label={r.cat} value={`${r.ratio.toFixed(2)}×`} pct={r.pct} color={r.color} />)}
          </div>
        </div>
      </div>

      {/* Tabla de productos críticos */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={cardHead}>
          <span className="h3">Productos críticos</span>
          <span className="muted" style={{ fontSize: 12.5 }}>Stock bajo o lote por caducar</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', padding: '0 12px 12px 0' }}>Producto</th>
                <th style={{ ...thBase, textAlign: 'right', padding: '0 12px 12px' }}>Stock</th>
                <th style={{ ...thBase, textAlign: 'right', padding: '0 12px 12px' }}>Mínimo</th>
                <th style={{ ...thBase, textAlign: 'right', padding: '0 12px 12px' }}>Caducidad</th>
                <th style={{ ...thBase, textAlign: 'left', padding: '0 0 12px 12px', width: 140 }}>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {criticos.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin productos en estado crítico.</td></tr>
              ) : criticos.map(r => {
                const bajo = r.stock <= r.minimo;
                const stockColor = r.estado === 'critico' ? 'var(--red)' : bajo ? 'oklch(0.5 0.12 70)' : 'var(--ink-2)';
                return (
                  <tr className="vrow" key={r.id}>
                    <td style={{ ...tdBase, padding: '13px 12px 13px 0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{r.nombre}</span>
                        <span className="muted" style={{ fontSize: 11.5 }}>{r.categoria}</span>
                      </div>
                    </td>
                    <td className="num" style={{ ...tdBase, textAlign: 'right', padding: '13px 12px', fontWeight: 700, color: stockColor }}>{fmtNum(r.stock)}</td>
                    <td className="num" style={{ ...tdBase, textAlign: 'right', padding: '13px 12px', color: 'var(--muted)' }}>{fmtNum(r.minimo)}</td>
                    <td className="num" style={{ ...tdBase, textAlign: 'right', padding: '13px 12px', color: r.caducidad ? (r.estado === 'critico' ? 'var(--red)' : 'oklch(0.5 0.12 70)') : 'var(--muted-2)', fontWeight: r.caducidad ? 600 : 400 }}>
                      {r.caducidad ? fmtFecha(r.caducidad) : '—'}
                    </td>
                    <td style={{ ...tdBase, padding: '13px 0 13px 12px' }}>
                      {r.estado === 'critico' ? <span className="badge red"><span className="dot" />Crítico</span>
                        : r.estado === 'bajo' ? <span className="badge red"><span className="dot" />Stock bajo</span>
                          : <span className="badge amber"><span className="dot" />Por caducar</span>}
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
