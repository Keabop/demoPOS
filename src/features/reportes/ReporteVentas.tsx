import React, { useState, useEffect, useMemo, useId } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import type { ReporteVentasData, ReporteVentasKpis } from '../../types';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

// Tonos verdes de la marca (dona y barras de categoría)
const GREEN_SHADES = [
  'oklch(0.50 0.13 145)', 'oklch(0.58 0.13 145)', 'oklch(0.64 0.12 145)',
  'oklch(0.70 0.10 145)', 'oklch(0.77 0.08 145)', 'oklch(0.84 0.06 145)',
];
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

const EMPTY_KPIS: ReporteVentasKpis = { total: 0, count: 0, ticket: 0, productos: 0, credito: 0, clientes: 0 };

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

interface Variation { pct: number; up: boolean; }
function variation(cur: number, prev: number): Variation | null {
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = ((cur - prev) / prev) * 100;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// ── KPI card ────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string; value: string; icon: string; iconBg: string; iconColor: string;
  spark: number[]; variation: Variation | null; valueColor?: string;
}
const KpiCard: React.FC<KpiProps> = ({ label, value, icon, iconBg, iconColor, spark, variation: v, valueColor }) => {
  const gid = `spk-${useId().replace(/:/g, '')}`;
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
        {v && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: v.up ? 'var(--green-2)' : 'var(--red)' }}>
            <Icon name={v.up ? 'arrow-up' : 'arrow-down'} size={13} />
            <span className="num">{v.up ? '+' : '-'}{v.pct.toFixed(1)}%</span>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>vs anterior</span>
          </span>
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

export const ReporteVentas: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [data, setData] = useState<ReporteVentasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        // Toda la agregación se hace en Postgres (fn_reporte_ventas): KPIs, serie,
        // métodos de pago, top productos, por categoría y por vendedor — ya calculados.
        const { data: rpc, error: rpcError } = await supabase.rpc('fn_reporte_ventas', {
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
        });
        if (rpcError) throw rpcError;
        if (!active) return;
        setData(rpc as ReporteVentasData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los datos de ventas.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate]);

  const m = data?.kpis ?? EMPTY_KPIS;
  const pm = data?.kpis_prev ?? EMPTY_KPIS;
  const serie = useMemo(() => data?.serie ?? [], [data]);

  const kpis: KpiProps[] = [
    { label: 'Ventas totales', value: fmtMXN(m.total), icon: 'sack', iconBg: 'var(--green-soft)', iconColor: 'var(--green-2)', spark: serie.map(b => b.total), variation: variation(m.total, pm.total) },
    { label: 'Transacciones', value: fmtNum(m.count), icon: 'cart', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)', spark: serie.map(b => b.count), variation: variation(m.count, pm.count) },
    { label: 'Ticket promedio', value: fmtMXN(m.ticket), icon: 'report', iconBg: 'var(--green-soft)', iconColor: 'var(--green-2)', spark: serie.map(b => (b.count ? b.total / b.count : 0)), variation: variation(m.ticket, pm.ticket) },
    { label: 'Productos vendidos', value: fmtNum(m.productos), icon: 'package', iconBg: 'var(--line-2)', iconColor: 'var(--ink-2)', spark: serie.map(b => b.productos), variation: variation(m.productos, pm.productos) },
    { label: 'Ventas a crédito', value: fmtMXN(m.credito), icon: 'credit', iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)', spark: serie.map(b => b.credito), variation: variation(m.credito, pm.credito) },
    { label: 'Clientes atendidos', value: fmtNum(m.clientes), icon: 'users', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)', spark: serie.map(b => b.clientes), variation: variation(m.clientes, pm.clientes) },
  ];

  // Gráfica principal (geometría)
  const chart = useMemo(() => {
    const mL = 40, mT = 14, mB = 182, xR = 720;
    if (!serie.length) return null;
    const maxV = Math.max(...serie.map(b => b.total), 1);
    const niceMax = maxV * 1.12;
    const n = serie.length;
    const xFor = (i: number) => (n === 1 ? (mL + (xR - mL) / 2) : mL + (i / (n - 1)) * (xR - mL));
    const yFor = (v: number) => mB - (v / niceMax) * (mB - mT);
    const pts = serie.map((b, i) => ({ x: xFor(i), y: yFor(b.total), b }));
    const line = 'M ' + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${mB} L ${pts[0].x.toFixed(1)} ${mB} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: mT + r * (mB - mT), val: niceMax * (1 - r) }));
    const colW = n > 1 ? (xR - mL) / (n - 1) : (xR - mL);
    const step = Math.max(1, Math.ceil(n / 9));
    return { mL, mT, mB, pts, line, area, grid, colW, step };
  }, [serie]);

  // Métodos de pago (dona, tonos verdes)
  const donut = useMemo(() => {
    const order = [
      { id: 'efectivo', label: 'Efectivo' }, { id: 'credito', label: 'Crédito tienda' },
      { id: 'transferencia', label: 'Transferencia' }, { id: 'debito', label: 'Débito' }, { id: 'tarjeta', label: 'Tarjeta' },
    ];
    const totals: Record<string, number> = {};
    order.forEach(o => (totals[o.id] = 0));
    for (const mp of data?.metodos_pago ?? []) { if (totals[mp.id] !== undefined) totals[mp.id] = Number(mp.total || 0); }
    const sum = order.reduce((a, o) => a + totals[o.id], 0);
    const r = 68, C = 2 * Math.PI * r;
    let acc = 0;
    const slices = order.map((o, i) => {
      const amt = totals[o.id]; const pct = sum > 0 ? (amt / sum) * 100 : 0;
      const dash = `${(pct / 100) * C} ${C}`; const off = -(acc / 100) * C; acc += pct;
      return { ...o, amt, pct, dash, off, color: GREEN_SHADES[i] };
    });
    return { slices, sum, C, r };
  }, [data]);

  const topProductos = useMemo(() => {
    const arr = data?.top_productos ?? [];
    const max = arr.length ? Number(arr[0].total) : 1;
    return arr.map(x => ({ nombre: x.nombre, total: Number(x.total), pct: max > 0 ? (Number(x.total) / max) * 100 : 0 }));
  }, [data]);

  const porCategoria = useMemo(() => {
    const arr = data?.por_categoria ?? [];
    const max = arr.length ? Number(arr[0].total) : 1;
    return arr.map((x, i) => ({ cat: x.cat, total: Number(x.total), pct: max > 0 ? (Number(x.total) / max) * 100 : 0, color: GREEN_SHADES[Math.min(i, GREEN_SHADES.length - 1)] }));
  }, [data]);

  const porVendedor = useMemo(() => {
    const arr = (data?.por_vendedor ?? []).map(v => ({
      id: v.vendedor_id || '—', count: v.count, total: Number(v.total),
      nombre: v.nombre || 'Sin asignar', ticket: v.count ? Number(v.total) / v.count : 0,
    }));
    const grand = arr.reduce((a, b) => a + b.total, 0);
    const max = arr.length ? arr[0].total : 1;
    return { rows: arr.map((v, i) => ({ ...v, pctTotal: grand > 0 ? (v.total / grand) * 100 : 0, bar: max > 0 ? (v.total / max) * 100 : 0, avatar: AVATARS[i % AVATARS.length], initials: initialsOf(v.nombre) })), grand };
  }, [data]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="premium-loading-icon-wrapper" style={{ animation: 'spin 1.5s linear infinite' }}><Icon name="clock" size={32} color="var(--green)" /></div>
        <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>Obteniendo datos de ventas...</div>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(186px, 100%), 1fr))', gap: 14 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Gráfica principal + dona */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.9fr) minmax(0, 1fr)', gap: 20 }}>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="h3">Ingresos por día</span>
              <span className="muted" style={{ fontSize: 12.5 }}>Ventas de mostrador y crédito · MXN</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="num" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>{fmtMXN(m.total)}</span>
            </div>
          </div>
          {chart && (
            <svg viewBox="0 0 760 220" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
              <defs>
                <linearGradient id="agArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--green)" stopOpacity="0.20" />
                  <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {chart.grid.map((g, i) => (
                <g key={i}>
                  <line x1={40} y1={g.y} x2={720} y2={g.y} stroke={i === chart.grid.length - 1 ? 'var(--line)' : 'var(--line-2)'} strokeWidth={1} />
                  <text x={33} y={g.y + 3} textAnchor="end" fontSize={9} fill="var(--muted-2)" fontFamily="'JetBrains Mono', monospace">{formatK(g.val)}</text>
                </g>
              ))}
              <path d={chart.area} fill="url(#agArea)" />
              <path d={chart.line} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {chart.pts.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r={3} fill="var(--green)" />)}
              {chart.pts.map((p, i) => (
                (i % chart.step === 0 || i === chart.pts.length - 1) &&
                <text key={`x${i}`} x={p.x} y={208} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>{p.b.label}</text>
              ))}
              {chart.pts.map((p, i) => (
                <g className="col" key={`c${i}`}>
                  {/* Rect de detección de hover ACOTADO a los límites del SVG [0,760]: con
                      pocos puntos la columna es muy ancha y, al estar el SVG en overflow:visible,
                      se desbordaba sobre el menú lateral capturando los clics (fill transparent
                      sí recibe eventos). El clamp evita que tape el sidebar. */}
                  <rect
                    x={Math.max(0, p.x - chart.colW / 2)}
                    y={14}
                    width={Math.min(760, p.x + chart.colW / 2) - Math.max(0, p.x - chart.colW / 2)}
                    height={168}
                    fill="transparent"
                  />
                  <line className="col-line" x1={p.x} y1={14} x2={p.x} y2={182} stroke="var(--green)" strokeWidth={1} strokeDasharray="3 3" />
                  <circle className="col-dot" cx={p.x} cy={p.y} r={5} fill="var(--surface)" stroke="var(--green)" strokeWidth={2.5} />
                  <g className="col-tip" style={{ pointerEvents: 'none' }} transform={`translate(${Math.min(Math.max(p.x, 45), 715)}, ${p.y})`}>
                    <rect x={-46} y={-48} width={92} height={38} rx={6} fill="var(--ink)" />
                    <text x={0} y={-32} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600} fontFamily="'Manrope'">{p.b.label}</text>
                    <text x={0} y={-17} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} fontFamily="'JetBrains Mono'">{fmtMXN(p.b.total)}</text>
                  </g>
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="h3">Métodos de pago</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Distribución del cobro</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <svg viewBox="0 0 180 180" style={{ width: 160, height: 160, flex: 'none' }}>
              <circle cx={90} cy={90} r={donut.r} fill="none" stroke="var(--line-2)" strokeWidth={26} />
              <g transform="rotate(-90 90 90)">
                {donut.sum > 0 && donut.slices.map(s => (
                  <circle key={s.id} cx={90} cy={90} r={donut.r} fill="none" stroke={s.color} strokeWidth={26} strokeDasharray={s.dash} strokeDashoffset={s.off} />
                ))}
              </g>
              <text x={90} y={84} textAnchor="middle" fontSize={9} fill="var(--muted)" fontWeight={700} letterSpacing="0.06em">COBRADO</text>
              <text x={90} y={104} textAnchor="middle" fontSize={15.5} fill="var(--ink)" fontWeight={800} fontFamily="'JetBrains Mono'">{fmtMXN(donut.sum)}</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minWidth: 150 }}>
              {donut.slices.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', flex: 1 }}>{s.label}</span>
                  <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(s.amt)}</span>
                  <span className="num" style={{ fontSize: 11, color: 'var(--muted)', width: 40, textAlign: 'right' }}>{s.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top productos + categorías */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}><span className="h3">Top productos más vendidos</span><span className="badge gray">Por importe</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {topProductos.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin ventas en este período.</span>
              : topProductos.map((p, i) => <BarRow key={i} label={p.nombre} value={fmtMXN(p.total)} pct={p.pct} color="var(--green)" />)}
          </div>
        </div>
        <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={cardHead}><span className="h3">Ventas por categoría</span><span className="badge gray">{porCategoria.length} {porCategoria.length === 1 ? 'categoría' : 'categorías'}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {porCategoria.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Sin ventas en este período.</span>
              : porCategoria.map((c, i) => <BarRow key={i} label={c.cat} value={fmtMXN(c.total)} pct={c.pct} color={c.color} />)}
          </div>
        </div>
      </div>

      {/* Ventas por vendedor */}
      <div className="card ag-rise2" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={cardHead}>
          <span className="h3">Ventas por vendedor</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{porVendedor.rows.length} {porVendedor.rows.length === 1 ? 'vendedor' : 'vendedores'}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                {['Vendedor', 'Transacciones', 'Ventas', 'Ticket prom.', '% del total'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', fontWeight: 700, padding: i === 0 ? '0 12px 12px 0' : '0 12px 12px', borderBottom: '1px solid var(--line)', ...(i === 4 ? { width: 150 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porVendedor.rows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin ventas en este período.</td></tr>
              ) : porVendedor.rows.map(v => (
                <tr className="vrow" key={v.id}>
                  <td style={{ padding: '13px 12px 13px 0', borderBottom: '1px solid var(--line-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 30, height: 30, borderRadius: 999, background: v.avatar.bg, color: v.avatar.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{v.initials}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{v.nombre}</span>
                    </div>
                  </td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, color: 'var(--ink-2)' }}>{fmtNum(v.count)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(v.total)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '13px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 13, color: 'var(--ink-2)' }}>{fmtMXN(v.ticket)}</td>
                  <td style={{ textAlign: 'right', padding: '13px 0 13px 12px', borderBottom: '1px solid var(--line-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'flex-end' }}>
                      <div style={{ flex: 1, maxWidth: 64, height: 6, borderRadius: 4, background: 'var(--line-2)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, v.bar)}%`, background: 'var(--green)', borderRadius: 4 }} />
                      </div>
                      <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', width: 42 }}>{v.pctTotal.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {porVendedor.rows.length > 0 && (
                <tr>
                  <td style={{ padding: '14px 12px 0 0' }}><span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total</span></td>
                  <td className="num" style={{ textAlign: 'right', padding: '14px 12px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtNum(m.count)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '14px 12px 0', fontSize: 13, fontWeight: 800, color: 'var(--green-2)' }}>{fmtMXN(m.total)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '14px 12px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmtMXN(m.ticket)}</td>
                  <td className="num" style={{ textAlign: 'right', padding: '14px 0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
