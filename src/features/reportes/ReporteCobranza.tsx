import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Venta, Cliente, PagoCredito } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { round2, sumMoney } from '../../lib/money';
import { parseLocalDate, fechaVencimiento, diasDeAtraso } from '../../lib/dates';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

interface VentaConRelaciones extends Venta {
  clientes: Cliente | null;
  pagos_credito: PagoCredito[];
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
const idCounter = { n: 0 };
const KpiCard: React.FC<KpiProps> = ({ label, value, valueSuffix, icon, iconBg, iconColor, spark, variation: v, variationGoodUp = true, valueColor, hint }) => {
  const gid = useMemo(() => `spkcob-${idCounter.n++}`, []);
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

interface ProcessedSale extends VentaConRelaciones {
  saldo: number;
  abonado: number;
  fechaVenta: Date;
  plazo: number;
  fecVen: Date;
  atraso: number;       // días de atraso (>0 vencido; <=0 al corriente)
  isOverdue: boolean;
}

interface DebtorAgg {
  id: string;
  nombre: string;
  saldo: number;
  vencido: number;
  maxAtraso: number;
  hasOverdue: boolean;
}

export const ReporteCobranza: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [ventas, setVentas] = useState<VentaConRelaciones[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cartera viva: ventas a crédito aún pendientes, con cliente y abonos.
      const { data, error: fetchError } = await supabase
        .from('ventas')
        .select(`
          *,
          clientes:cliente_id (
            id, nombre, rancho, telefono,
            limite_credito, saldo_deudor, activo_para_credito, dias_credito
          ),
          pagos_credito ( id, venta_id, monto, metodo, fecha, folio_pago )
        `)
        .eq('tipo_pago', 'credito')
        .eq('estado', 'pendiente');

      if (fetchError) throw fetchError;
      setVentas((data as VentaConRelaciones[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener los datos de cobranza.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Filtrado por rango usando la FECHA DE VENTA (alta del crédito).
  const filteredSales = useMemo(() => {
    const startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const endMs = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime();
    return ventas.filter(v => {
      if (!v.fecha) return false;
      const t = parseLocalDate(v.fecha).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [ventas, startDate, endDate]);

  const today = useMemo(() => new Date(), []);

  // Cálculo de saldo, vencimiento y atraso por venta.
  const processed = useMemo<ProcessedSale[]>(() => {
    return filteredSales.map(v => {
      const abonado = sumMoney((v.pagos_credito || []).map(p => Number(p.monto || 0)));
      const saldo = round2(Math.max(0, Number(v.total || 0) - abonado));
      const fechaVenta = parseLocalDate(v.fecha || new Date());
      const plazo = v.plazo_dias || v.clientes?.dias_credito || 30;
      const fecVen = fechaVencimiento(fechaVenta, plazo);
      const atraso = diasDeAtraso(fecVen, today); // >0 vencido
      const isOverdue = atraso > 0 && saldo > 0;
      return { ...v, saldo, abonado, fechaVenta, plazo, fecVen, atraso, isOverdue };
    }).filter(s => s.saldo > 0);
  }, [filteredSales, today]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const m = useMemo(() => {
    const carteraTotal = sumMoney(processed.map(s => s.saldo));
    const vencido = sumMoney(processed.filter(s => s.isOverdue).map(s => s.saldo));
    // Por vencer dentro de los próximos 30 días (no vencido, vence pronto).
    const porVencer30 = sumMoney(
      processed.filter(s => !s.isOverdue && s.atraso >= -30).map(s => s.saldo),
    );
    const facturasPorVencer = processed.filter(s => !s.isOverdue && s.atraso >= -30).length;

    // % de recuperación real: abonado / (abonado + saldo) de la cartera del período.
    const totalAbonado = sumMoney(processed.map(s => s.abonado));
    const baseOriginal = round2(totalAbonado + carteraTotal);
    const recuperacion = baseOriginal > 0 ? (totalAbonado / baseOriginal) * 100 : 0;

    // Clientes morosos (con al menos una venta vencida).
    const morosos = new Set<string>();
    processed.forEach(s => { if (s.isOverdue) morosos.add(s.cliente_id || `s-${s.id}`); });

    const clientesConCredito = new Set<string>();
    processed.forEach(s => clientesConCredito.add(s.cliente_id || `s-${s.id}`));

    return {
      carteraTotal, vencido, porVencer30, facturasPorVencer,
      recuperacion, totalAbonado,
      morosos: morosos.size,
      cuentasActivas: clientesConCredito.size,
    };
  }, [processed]);

  // Sparklines reales: saldo vivo de la cartera por semana dentro del rango.
  const sparkSeries = useMemo(() => {
    const buckets = 7;
    const startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const endMs = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime();
    const span = Math.max(1, endMs - startMs);
    const cartera = new Array(buckets).fill(0) as number[];
    const vencido = new Array(buckets).fill(0) as number[];
    const recup = new Array(buckets).fill(0) as number[];
    const morosos = Array.from({ length: buckets }, () => new Set<string>());
    for (const s of processed) {
      const idx = Math.min(buckets - 1, Math.floor(((s.fechaVenta.getTime() - startMs) / span) * buckets));
      const i = idx < 0 ? 0 : idx;
      cartera[i] += s.saldo;
      recup[i] += s.abonado;
      if (s.isOverdue) { vencido[i] += s.saldo; morosos[i].add(s.cliente_id || `s-${s.id}`); }
    }
    return {
      cartera, vencido, recup: recup.map((r, i) => r + cartera[i]),
      morosos: morosos.map(set => set.size),
    };
  }, [processed, startDate, endDate]);

  // Período anterior (mismo tamaño) para variaciones reales de cartera/vencido.
  const [prevMetrics, setPrevMetrics] = useState<{ carteraTotal: number; vencido: number; morosos: number } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const durationMs = endDate.getTime() - startDate.getTime();
        const prevStart = new Date(startDate.getTime() - durationMs - 1);
        const prevEnd = new Date(startDate.getTime() - 1);
        const { data, error: e } = await supabase
          .from('ventas')
          .select(`*, clientes:cliente_id ( id, dias_credito ), pagos_credito ( id, monto )`)
          .eq('tipo_pago', 'credito')
          .eq('estado', 'pendiente')
          .gte('fecha', prevStart.toISOString())
          .lte('fecha', prevEnd.toISOString());
        if (e) throw e;
        if (!active) return;
        const rows = (data as VentaConRelaciones[]) || [];
        let carteraTotal = 0, vencido = 0;
        const morosos = new Set<string>();
        const now = new Date();
        for (const v of rows) {
          const abonado = sumMoney((v.pagos_credito || []).map(p => Number(p.monto || 0)));
          const saldo = round2(Math.max(0, Number(v.total || 0) - abonado));
          if (saldo <= 0) continue;
          carteraTotal += saldo;
          const plazo = v.plazo_dias || v.clientes?.dias_credito || 30;
          const fecVen = fechaVencimiento(parseLocalDate(v.fecha || now), plazo);
          if (diasDeAtraso(fecVen, now) > 0) { vencido += saldo; morosos.add(v.cliente_id || `s-${v.id}`); }
        }
        setPrevMetrics({ carteraTotal: round2(carteraTotal), vencido: round2(vencido), morosos: morosos.size });
      } catch {
        if (active) setPrevMetrics(null);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate]);

  const kpis: KpiProps[] = [
    {
      label: 'Cartera total', value: fmtMXN(m.carteraTotal),
      icon: 'credit', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)',
      spark: sparkSeries.cartera, variation: prevMetrics ? variation(m.carteraTotal, prevMetrics.carteraTotal) : null,
      hint: `${fmtNum(m.cuentasActivas)} ${m.cuentasActivas === 1 ? 'cuenta activa' : 'cuentas activas'}`,
    },
    {
      label: 'Saldo vencido', value: fmtMXN(m.vencido), valueColor: m.vencido > 0 ? 'var(--red)' : 'var(--ink)',
      icon: 'alert', iconBg: 'var(--red-soft)', iconColor: 'var(--red)',
      spark: sparkSeries.vencido, variation: prevMetrics ? variation(m.vencido, prevMetrics.vencido) : null,
      variationGoodUp: false,
      hint: 'Saldos fuera de plazo',
    },
    {
      label: 'Por vencer (≤30 días)', value: fmtMXN(m.porVencer30),
      icon: 'clock', iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)',
      spark: sparkSeries.cartera, variation: null,
      hint: `${fmtNum(m.facturasPorVencer)} ${m.facturasPorVencer === 1 ? 'factura por cobrar' : 'facturas por cobrar'}`,
    },
    {
      label: '% de recuperación', value: `${m.recuperacion.toFixed(1)}%`, valueColor: 'var(--green-2)',
      icon: 'shield', iconBg: 'var(--green-soft)', iconColor: 'var(--green-2)',
      spark: sparkSeries.recup, variation: null,
      hint: 'Cobrado sobre crédito otorgado',
    },
    {
      label: 'Clientes morosos', value: fmtNum(m.morosos),
      icon: 'users', iconBg: 'var(--red-soft)', iconColor: 'var(--red)',
      spark: sparkSeries.morosos, variation: prevMetrics ? variation(m.morosos, prevMetrics.morosos) : null,
      variationGoodUp: false,
      hint: 'Con al menos un saldo vencido',
    },
  ];

  // ── Evolución del saldo total (cartera viva por día del rango) ───────────────
  const evolucion = useMemo(() => {
    const startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const endMs = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
    const dayMs = 86_400_000;
    const days = Math.max(1, Math.round((endMs - startMs) / dayMs) + 1);
    // Limitar a ~24 puntos para legibilidad.
    const points = Math.min(days, 24);
    const stepDays = days / points;

    // Saldo vivo acumulado al final de cada punto: ventas dadas de alta hasta esa
    // fecha menos abonos registrados hasta esa fecha.
    const series: { label: string; value: number }[] = [];
    for (let p = 0; p < points; p++) {
      const cutMs = startMs + Math.round((p + 1) * stepDays - 1) * dayMs;
      const cut = new Date(cutMs);
      let saldoVivo = 0;
      for (const s of processed) {
        if (s.fechaVenta.getTime() > cutMs) continue;
        const abonadoAlCorte = sumMoney(
          (s.pagos_credito || [])
            .filter(pg => pg.fecha && parseLocalDate(pg.fecha).getTime() <= cutMs)
            .map(pg => Number(pg.monto || 0)),
        );
        saldoVivo += Math.max(0, Number(s.total || 0) - abonadoAlCorte);
      }
      series.push({
        label: `${String(cut.getDate()).padStart(2, '0')}/${String(cut.getMonth() + 1).padStart(2, '0')}`,
        value: round2(saldoVivo),
      });
    }
    return series;
  }, [processed, startDate, endDate]);

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

  // ── Antigüedad de cartera ────────────────────────────────────────────────────
  const aging = useMemo(() => {
    // Rangos por días de atraso del saldo vencido + corriente (no vencido).
    let corriente = 0, r1_30 = 0, r31_60 = 0, r60p = 0;
    for (const s of processed) {
      if (!s.isOverdue) { corriente += s.saldo; continue; }
      if (s.atraso <= 30) r1_30 += s.saldo;
      else if (s.atraso <= 60) r31_60 += s.saldo;
      else r60p += s.saldo;
    }
    const segs = [
      { label: 'Corriente', sub: 'no vencido', value: round2(corriente), color: AGING_COLORS[0], valueColor: 'var(--ink)' },
      { label: '1–30 días', sub: '', value: round2(r1_30), color: AGING_COLORS[1], valueColor: 'var(--ink)' },
      { label: '31–60 días', sub: '', value: round2(r31_60), color: AGING_COLORS[2], valueColor: 'var(--ink)' },
      { label: '60+ días', sub: 'riesgo alto', value: round2(r60p), color: AGING_COLORS[3], valueColor: 'var(--red)' },
    ];
    const total = segs.reduce((a, b) => a + b.value, 0);
    return segs.map(s => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }));
  }, [processed]);

  // ── Top deudores (por saldo) ──────────────────────────────────────────────────
  const topDeudores = useMemo(() => {
    const map: Record<string, DebtorAgg> = {};
    for (const s of processed) {
      const id = s.cliente_id || `s-${s.id}`;
      if (!map[id]) {
        map[id] = { id, nombre: s.clientes?.nombre || 'Cliente sin nombre', saldo: 0, vencido: 0, maxAtraso: 0, hasOverdue: false };
      }
      map[id].saldo += s.saldo;
      if (s.isOverdue) {
        map[id].vencido += s.saldo;
        map[id].hasOverdue = true;
        if (s.atraso > map[id].maxAtraso) map[id].maxAtraso = s.atraso;
      }
    }
    const arr = Object.values(map).map(d => ({ ...d, saldo: round2(d.saldo), vencido: round2(d.vencido) }))
      .sort((a, b) => b.saldo - a.saldo);
    const max = arr.length ? arr[0].saldo : 1;
    return arr.slice(0, 6).map(d => ({ ...d, pct: max > 0 ? (d.saldo / max) * 100 : 0 }));
  }, [processed]);

  // ── Tabla de clientes con crédito ─────────────────────────────────────────────
  const clientesTabla = useMemo(() => {
    const map: Record<string, DebtorAgg> = {};
    for (const s of processed) {
      const id = s.cliente_id || `s-${s.id}`;
      if (!map[id]) {
        map[id] = { id, nombre: s.clientes?.nombre || 'Cliente sin nombre', saldo: 0, vencido: 0, maxAtraso: 0, hasOverdue: false };
      }
      map[id].saldo += s.saldo;
      if (s.isOverdue) {
        map[id].vencido += s.saldo;
        map[id].hasOverdue = true;
        if (s.atraso > map[id].maxAtraso) map[id].maxAtraso = s.atraso;
      }
    }
    const arr = Object.values(map).map(d => ({ ...d, saldo: round2(d.saldo), vencido: round2(d.vencido) }))
      .sort((a, b) => b.saldo - a.saldo);
    return arr.map((d, i) => {
      // Estatus: Moroso (>30d), Vencido (1-30d), Atraso leve (vencido leve), Al corriente.
      let badge: { cls: string; text: string };
      if (d.maxAtraso > 30) badge = { cls: 'red', text: 'Moroso' };
      else if (d.maxAtraso > 0) badge = { cls: 'amber', text: 'Atraso leve' };
      else badge = { cls: 'green', text: 'Al corriente' };
      return { ...d, avatar: AVATARS[i % AVATARS.length], initials: initialsOf(d.nombre), badge };
    });
  }, [processed]);

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
        <button className="btn btn-secondary" onClick={cargarDatos}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(196px, 100%), 1fr))', gap: 14 }}>
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
