import React, { useState, useEffect, useMemo, useId } from 'react';
import { supabase } from '../../lib/supabase';
import type { ReporteCobranzaData } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

// Tonos verdes de la marca (replicados de ReporteVentas para la dona/barras).
const AVATARS = [
  { bg: 'var(--green-soft)', color: 'var(--green-2)' },
  { bg: 'var(--blue-soft)', color: 'var(--blue)' },
  { bg: 'var(--amber-soft)', color: 'oklch(0.5 0.12 70)' },
  { bg: 'var(--line-2)', color: 'var(--ink-2)' },
];

const fmtNum = (n: number) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const formatK = (v: number) => (v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '—';

// Mini-gráfica (sparkline) 120x26 — idéntica a ReporteVentas.
function sparkPath(vals: number[]): { area: string; line: string } {
  if (vals.length < 2) return { area: '', line: '' };
  const w = 120, h = 26;
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 2 - ((v - min) / range) * (h - 4)] as const);
  const line = 'M ' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
  return { line, area: `${line} L ${w} ${h} L 0 ${h} Z` };
}

interface Variation { pct: number; up: boolean; }
function variation(cur: number, prev: number): Variation | null {
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = ((cur - prev) / prev) * 100;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// ── KPI card (replicada de ReporteVentas) ─────────────────────────────────────
interface KpiProps {
  label: string; value: string; valueSuffix?: string; icon: string; iconBg: string; iconColor: string;
  spark: number[]; variation: Variation | null; variationGoodUp?: boolean; valueColor?: string;
  hint?: string;
}
const KpiCard: React.FC<KpiProps> = ({ label, value, valueSuffix, icon, iconBg, iconColor, spark, variation: v, variationGoodUp = true, valueColor, hint }) => {
  const gid = `spkcob-${useId().replace(/:/g, '')}`;
  const sp = sparkPath(spark);
  const good = v ? (v.up === variationGoodUp) : true;
  return (
    <div className="card ag-rise" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={icon} size={16} color={iconColor} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 800, color: valueColor || 'var(--ink)', letterSpacing: '-0.02em' }}>
          {value}{valueSuffix && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}> {valueSuffix}</span>}
        </span>
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
        {v ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: good ? 'var(--green-2)' : 'var(--red)' }}>
            <Icon name={v.up ? 'arrow-up' : 'arrow-down'} size={13} />
            <span className="num">{v.up ? '+' : '-'}{v.pct.toFixed(1)}%</span>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>vs anterior</span>
          </span>
        ) : hint ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
};

const BarRow: React.FC<{ label: string; value: string; pct: number; color: string; valueColor?: string }> = ({ label, value, pct, color, valueColor }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: valueColor || 'var(--ink)', flex: 'none' }}>{value}</span>
    </div>
    <div style={{ height: 8, borderRadius: 5, background: 'var(--line-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, borderRadius: 5, background: color }} />
    </div>
  </div>
);

const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

// Colores de los rangos de antigüedad (corriente / leve / medio / alto riesgo).
const AGING_COLORS = ['var(--green)', 'var(--amber)', 'oklch(0.66 0.15 50)', 'var(--red)'];

const EMPTY_KPIS = { carteraTotal: 0, vencido: 0, porVencer30: 0, facturasPorVencer: 0, recuperacion: 0, totalAbonado: 0, morosos: 0, cuentasActivas: 0 };

export const ReporteCobranza: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<ReporteCobranzaData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Toda la agregación (cartera, antigüedad, evolución, deudores) se hace en
        // Postgres (fn_reporte_cobranza); el front solo pinta.
        const { data: rpc, error: fetchError } = await supabase.rpc('fn_reporte_cobranza', {
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
        });
        if (fetchError) throw fetchError;
        if (!active) return;
        setData(rpc as ReporteCobranzaData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al obtener los datos de cobranza.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate, nonce]);

  const m = data?.kpis ?? EMPTY_KPIS;
  const prevMetrics = data?.kpis_prev ?? null;
  const spark = useMemo(() => data?.spark ?? { cartera: [], vencido: [], recup: [], morosos: [] }, [data]);

  const kpis: KpiProps[] = [
    {
      label: 'Cartera total', value: fmtMXN(m.carteraTotal),
      icon: 'credit', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)',
      spark: spark.cartera, variation: prevMetrics ? variation(m.carteraTotal, prevMetrics.carteraTotal) : null,
      hint: `${fmtNum(m.cuentasActivas)} ${m.cuentasActivas === 1 ? 'cuenta activa' : 'cuentas activas'}`,
    },
    {
      label: 'Saldo vencido', value: fmtMXN(m.vencido), valueColor: m.vencido > 0 ? 'var(--red)' : 'var(--ink)',
      icon: 'alert', iconBg: 'var(--red-soft)', iconColor: 'var(--red)',
      spark: spark.vencido, variation: prevMetrics ? variation(m.vencido, prevMetrics.vencido) : null,
      variationGoodUp: false,
      hint: 'Saldos fuera de plazo',
    },
    {
      label: 'Por vencer (≤30 días)', value: fmtMXN(m.porVencer30),
      icon: 'clock', iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)',
      spark: spark.cartera, variation: null,
      hint: `${fmtNum(m.facturasPorVencer)} ${m.facturasPorVencer === 1 ? 'factura por cobrar' : 'facturas por cobrar'}`,
    },
    {
      label: '% de recuperación', value: `${m.recuperacion.toFixed(1)}%`, valueColor: 'var(--green-2)',
      icon: 'shield', iconBg: 'var(--green-soft)', iconColor: 'var(--green-2)',
      spark: spark.recup, variation: null,
      hint: 'Cobrado sobre crédito otorgado',
    },
    {
      label: 'Clientes morosos', value: fmtNum(m.morosos),
      icon: 'users', iconBg: 'var(--red-soft)', iconColor: 'var(--red)',
      spark: spark.morosos, variation: prevMetrics ? variation(m.morosos, prevMetrics.morosos) : null,
      variationGoodUp: false,
      hint: 'Con al menos un saldo vencido',
    },
  ];

  const evolucion = useMemo(() => data?.evolucion ?? [], [data]);

  const chart = useMemo(() => {
    const mL = 46, mT = 14, mB = 182, xR = 720;
    if (!evolucion.length) return null;
    const maxV = Math.max(...evolucion.map(b => b.value), 1);
    const niceMax = maxV * 1.12;
    const n = evolucion.length;
    const xFor = (i: number) => (n === 1 ? mL + (xR - mL) / 2 : mL + (i / (n - 1)) * (xR - mL));
    const yFor = (v: number) => mB - (v / niceMax) * (mB - mT);
    const pts = evolucion.map((b, i) => ({ x: xFor(i), y: yFor(b.value), b }));
    const line = 'M ' + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${mB} L ${pts[0].x.toFixed(1)} ${mB} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: mT + r * (mB - mT), val: niceMax * (1 - r) }));
    const colW = n > 1 ? (xR - mL) / (n - 1) : (xR - mL);
    const step = Math.max(1, Math.ceil(n / 9));
    return { mL, mT, mB, pts, line, area, grid, colW, step };
  }, [evolucion]);

  const aging = useMemo(() => {
    const a = data?.aging ?? { corriente: 0, r1_30: 0, r31_60: 0, r60p: 0 };
    const segs = [
      { label: 'Corriente', sub: 'no vencido', value: a.corriente, color: AGING_COLORS[0], valueColor: 'var(--ink)' },
      { label: '1–30 días', sub: '', value: a.r1_30, color: AGING_COLORS[1], valueColor: 'var(--ink)' },
      { label: '31–60 días', sub: '', value: a.r31_60, color: AGING_COLORS[2], valueColor: 'var(--ink)' },
      { label: '60+ días', sub: 'riesgo alto', value: a.r60p, color: AGING_COLORS[3], valueColor: 'var(--red)' },
    ];
    const total = segs.reduce((acc, s) => acc + s.value, 0);
    return segs.map(s => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }));
  }, [data]);

  const topDeudores = useMemo(() => {
    const arr = data?.top_deudores ?? [];
    const max = arr.length ? arr[0].saldo : 1;
    return arr.map(d => ({ ...d, pct: max > 0 ? (d.saldo / max) * 100 : 0 }));
  }, [data]);

  const clientesTabla = useMemo(() => {
    const arr = data?.tabla_clientes ?? [];
    return arr.map((d, i) => {
      const badge = d.badge === 'red' ? { cls: 'red', text: 'Moroso' }
        : d.badge === 'amber' ? { cls: 'amber', text: 'Atraso leve' }
          : { cls: 'green', text: 'Al corriente' };
      return { ...d, avatar: AVATARS[i % AVATARS.length], initials: initialsOf(d.nombre), badge };
    });
  }, [data]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="premium-loading-icon-wrapper" style={{ animation: 'spin 1.5s linear infinite' }}><Icon name="clock" size={32} color="var(--green)" /></div>
        <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>Obteniendo datos de cobranza...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--red)', border: '1px solid oklch(0.58 0.16 25 / 0.2)' }}>
        <Icon name="alert" size={36} color="var(--red)" style={{ marginBottom: 12 }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Error al cargar reporte</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{error}</div>
        <button className="btn btn-secondary" onClick={() => setNonce(n => n + 1)}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* KPIs */}
      <div data-tour="rep-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(196px, 100%), 1fr))', gap: 14 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Evolución del saldo total */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="h3">Evolución del saldo total</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Cartera de crédito a clientes · MXN</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="num" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>{fmtMXN(m.carteraTotal)}</span>
            <span className="muted" style={{ fontSize: 12 }}>saldo vivo actual</span>
          </div>
        </div>
        {chart && evolucion.length > 1 ? (
          <svg viewBox="0 0 760 220" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="agAreaCred" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {chart.grid.map((g, i) => (
              <g key={i}>
                <line x1={46} y1={g.y} x2={720} y2={g.y} stroke={i === chart.grid.length - 1 ? 'var(--line)' : 'var(--line-2)'} strokeWidth={1} />
                <text x={40} y={g.y + 3} textAnchor="end" fontSize={9} fill="var(--muted-2)" fontFamily="'JetBrains Mono', monospace">{formatK(g.val)}</text>
              </g>
            ))}
            <path d={chart.area} fill="url(#agAreaCred)" />
            <path d={chart.line} fill="none" stroke="var(--blue)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {chart.pts.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r={3} fill="var(--blue)" />)}
            {chart.pts.map((p, i) => (
              (i % chart.step === 0 || i === chart.pts.length - 1) &&
              <text key={`x${i}`} x={p.x} y={208} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>{p.b.label}</text>
            ))}
            {chart.pts.map((p, i) => (
              <g className="col" key={`c${i}`}>
                <rect x={p.x - chart.colW / 2} y={14} width={chart.colW} height={168} fill="transparent" />
                <line className="col-line" x1={p.x} y1={14} x2={p.x} y2={182} stroke="var(--blue)" strokeWidth={1} strokeDasharray="3 3" />
                <circle className="col-dot" cx={p.x} cy={p.y} r={5} fill="var(--surface)" stroke="var(--blue)" strokeWidth={2.5} />
                <g className="col-tip" transform={`translate(${Math.min(Math.max(p.x, 50), 710)}, ${p.y})`}>
                  <rect x={-50} y={-46} width={100} height={36} rx={6} fill="var(--ink)" />
                  <text x={0} y={-30} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600} fontFamily="'Manrope'">{p.b.label}</text>
                  <text x={0} y={-16} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} fontFamily="'JetBrains Mono'">{fmtMXN(p.b.value)}</text>
                </g>
              </g>
            ))}
          </svg>
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Sin saldos de crédito en este período.
          </div>
        )}
      </div>

      {/* Antigüedad de cartera + Top deudores */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div style={cardHead}>
            <span className="h3">Antigüedad de cartera</span>
            <span className="badge gray">Por rango</span>
          </div>
          {m.carteraTotal > 0 ? (
            <>
              <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--line-2)' }}>
                {aging.map(s => s.pct > 0 && <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {aging.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', flex: 1 }}>
                      {s.label}{s.sub && <span className="muted" style={{ fontWeight: 500 }}> · {s.sub}</span>}
                    </span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 700, color: s.valueColor }}>{fmtMXN(s.value)}</span>
                    <span className="num" style={{ fontSize: 11, color: 'var(--muted)', width: 44, textAlign: 'right' }}>{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Sin cartera de crédito en este período.</span>
          )}
        </div>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}>
            <span className="h3">Top deudores</span>
            <span className="badge gray">Por saldo</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {topDeudores.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin deudores en este período.</span>
              : topDeudores.map(d => (
                <BarRow
                  key={d.id}
                  label={d.nombre}
                  value={fmtMXN(d.saldo)}
                  pct={d.pct}
                  color={d.hasOverdue ? 'var(--red)' : 'var(--green)'}
                  valueColor={d.hasOverdue ? 'var(--red)' : 'var(--ink)'}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Tabla de clientes con crédito */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={cardHead}>
          <span className="h3">Clientes con crédito</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{clientesTabla.length} {clientesTabla.length === 1 ? 'cuenta activa' : 'cuentas activas'}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                {['Cliente', 'Saldo', 'Vencido', 'Días atraso', 'Estatus'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 || i === 4 ? 'left' : 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 700, padding: i === 0 ? '0 12px 12px 0' : i === 4 ? '0 0 12px 12px' : '0 12px 12px', borderBottom: '1px solid var(--line)', ...(i === 4 ? { width: 150 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientesTabla.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin clientes con crédito en este período.</td></tr>
              ) : clientesTabla.map(c => (
                <tr className="vrow" key={c.id}>
                  <td style={{ padding: '13px 12px 13px 0', borderBottom: '1px solid var(--line-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 30, height: 30, borderRadius: 999, background: c.avatar.bg, color: c.avatar.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{c.initials}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.nombre}</span>
                    </div>
                  </td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(c.saldo)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, fontWeight: c.vencido > 0 ? 700 : 400, color: c.vencido > 0 ? 'var(--red)' : 'var(--muted-2)' }}>{c.vencido > 0 ? fmtMXN(c.vencido) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, color: c.maxAtraso > 0 ? 'var(--red)' : 'var(--muted-2)' }}>{c.maxAtraso > 0 ? c.maxAtraso : 0}</td>
                  <td style={{ padding: '13px 0 13px 12px', borderBottom: '1px solid var(--line-2)' }}>
                    <span className={`badge ${c.badge.cls}`}><span className="dot" />{c.badge.text}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
