import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Lote, Producto, Venta, DetalleVenta } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { costoValuacion } from '../../lib/valuacion';

interface ReportProps {
  startDate: Date;
  endDate: Date;
}

// ── Tipos locales que extienden las tablas base ──────────────────────────────
interface LoteConProducto extends Lote {
  productos: Producto | null;
}
interface DetalleVentaConProducto extends DetalleVenta {
  productos: Producto | null;
}
interface VentaConDetalles extends Venta {
  ventas_detalles: DetalleVentaConProducto[];
}

// ── Lenguaje visual compartido con ReporteVentas ─────────────────────────────
const GREEN_SHADES = [
  'oklch(0.55 0.14 76)', 'oklch(0.62 0.14 77)', 'oklch(0.68 0.13 78)',
  'oklch(0.74 0.11 80)', 'oklch(0.80 0.09 82)', 'oklch(0.86 0.07 84)',
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
const idCounter = { n: 0 };
const KpiCard: React.FC<KpiProps> = ({ label, sublabel, value, icon, iconBg, iconColor, spark, valueColor }) => {
  const gid = useMemo(() => `spk-inv-${idCounter.n++}`, []);
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

// Productos próximos a caducar / con stock bajo: horizonte de la vista
const EXPIRY_HORIZON_DAYS = 90; // KPI "Lotes por caducar (≤90 días)"
const TIMELINE_MONTHS = 6;      // gráfica "Lotes por caducar" (próximos 6 meses)

export const ReporteInventario: React.FC<ReportProps> = ({ startDate, endDate }) => {
  const [lotes, setLotes] = useState<LoteConProducto[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [sales, setSales] = useState<VentaConDetalles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [lotesRes, prodRes, salesRes] = await Promise.all([
          // Lotes activos (con stock) y su producto
          supabase.from('lotes').select('*, productos(*)').gt('stock_lote', 0),
          // Catálogo de productos
          supabase.from('productos').select('*').order('nombre', { ascending: true }),
          // Ventas del periodo (para rotación) — excluye canceladas
          supabase.from('ventas').select('*, ventas_detalles(*, productos(*))')
            .gte('fecha', startDate.toISOString()).lte('fecha', endDate.toISOString())
            .neq('estado', 'cancelada'),
        ]);
        if (lotesRes.error) throw lotesRes.error;
        if (prodRes.error) throw prodRes.error;
        if (salesRes.error) throw salesRes.error;
        if (!active) return;
        setLotes((lotesRes.data as unknown as LoteConProducto[]) || []);
        setProductos((prodRes.data as unknown as Producto[]) || []);
        setSales((salesRes.data as unknown as VentaConDetalles[]) || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los datos de inventario.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [startDate, endDate]);

  // ── Valuación a costo + métricas de KPIs ───────────────────────────────────
  const metrics = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const horizon = new Date(now); horizon.setDate(now.getDate() + EXPIRY_HORIZON_DAYS);

    let totalValuation = 0;
    let estimadosPorPrecio = 0;
    let expiringCount = 0;
    let expiringValue = 0;

    for (const lot of lotes) {
      const prod = lot.productos;
      if (!prod) continue;
      const cost = costoValuacion(lot.costo, prod.costo, prod.precio_publico);
      const value = Number(lot.stock_lote) * cost;
      totalValuation += value;
      if ((Number(lot.costo) || 0) <= 0 && (Number(prod.costo) || 0) <= 0) estimadosPorPrecio++;

      if (lot.fecha_caducidad) {
        const exp = new Date(lot.fecha_caducidad + 'T00:00:00');
        if (exp <= horizon) { expiringCount++; expiringValue += value; }
      }
    }

    const lowStock = productos.filter(p => Number(p.stock) <= Number(p.stock_minimo)).length;

    return {
      totalValuation,
      estimadosPorPrecio,
      skus: productos.length,
      lowStock,
      expiringCount,
      expiringValue,
    };
  }, [lotes, productos]);

  // ── Valor de inventario por categoría (barras horizontales) ────────────────
  const porCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    for (const lot of lotes) {
      const prod = lot.productos;
      if (!prod) continue;
      const cat = prod.categoria || 'Sin categoría';
      const cost = costoValuacion(lot.costo, prod.costo, prod.precio_publico);
      map[cat] = (map[cat] || 0) + Number(lot.stock_lote) * cost;
    }
    const arr = Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
    const max = arr.length ? arr[0].total : 1;
    return arr.map((x, i) => ({ ...x, pct: max > 0 ? (x.total / max) * 100 : 0, color: GREEN_SHADES[Math.min(i, GREEN_SHADES.length - 1)] }));
  }, [lotes]);

  // ── Lotes por caducar: valor en riesgo por mes (próximos 6 meses) ──────────
  const expiryTimeline = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const bins: { label: string; count: number; value: number; key: string }[] = [];
    const idx = new Map<string, number>();
    for (let i = 0; i < TIMELINE_MONTHS; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      idx.set(key, i);
      const label = `${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)}`;
      bins.push({ label, count: 0, value: 0, key });
    }
    const limit = new Date(now.getFullYear(), now.getMonth() + TIMELINE_MONTHS, 1);

    for (const lot of lotes) {
      const prod = lot.productos;
      if (!prod || !lot.fecha_caducidad) continue;
      const exp = new Date(lot.fecha_caducidad + 'T00:00:00');
      if (exp >= limit) continue; // fuera del horizonte de 6 meses
      // Lotes ya vencidos o de este mes se agrupan en el primer bin.
      const refKey = exp < now ? bins[0].key : `${exp.getFullYear()}-${exp.getMonth()}`;
      const bi = idx.get(refKey);
      if (bi === undefined) continue;
      const cost = costoValuacion(lot.costo, prod.costo, prod.precio_publico);
      bins[bi].value += Number(lot.stock_lote) * cost;
      bins[bi].count += 1;
    }

    const max = Math.max(...bins.map(b => b.value), 1);
    // Color por urgencia: primeros 2 meses rojo, 3-4 ámbar, resto verde
    return bins.map((b, i) => ({
      ...b,
      h: (b.value / max) * 150,
      color: i <= 1 ? 'var(--red)' : i <= 3 ? 'var(--amber)' : 'var(--ok)',
    }));
  }, [lotes]);

  // ── Rotación por categoría (unidades vendidas ÷ stock en mano, periodo) ─────
  // Nota: no se usa la fórmula contable (COGS/inv. promedio) porque el costo
  // está casi todo en 0; se aproxima con unidades reales movidas vs. existencia.
  const rotacion = useMemo(() => {
    const stockPorCat: Record<string, number> = {};
    for (const p of productos) {
      const cat = p.categoria || 'Sin categoría';
      stockPorCat[cat] = (stockPorCat[cat] || 0) + Number(p.stock);
    }
    const vendidoPorCat: Record<string, number> = {};
    for (const v of sales) for (const d of v.ventas_detalles || []) {
      const cat = d.productos?.categoria || 'Sin categoría';
      vendidoPorCat[cat] = (vendidoPorCat[cat] || 0) + Number(d.cantidad || 0);
    }
    const arr = Object.keys({ ...stockPorCat, ...vendidoPorCat })
      .map(cat => {
        const stock = stockPorCat[cat] || 0;
        const vendido = vendidoPorCat[cat] || 0;
        const ratio = stock > 0 ? vendido / stock : 0;
        return { cat, ratio, vendido };
      })
      .filter(x => x.vendido > 0)
      .sort((a, b) => b.ratio - a.ratio);
    const max = arr.length ? arr[0].ratio : 1;
    return arr.map((x, i) => ({
      ...x,
      pct: max > 0 ? (x.ratio / max) * 100 : 0,
      color: i < 5 ? 'var(--green)' : 'oklch(0.80 0.09 82)',
    }));
  }, [productos, sales]);

  // ── Productos críticos: stock bajo o lote por caducar ──────────────────────
  const criticos = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const horizon = new Date(now); horizon.setDate(now.getDate() + EXPIRY_HORIZON_DAYS);

    // Lote más próximo a caducar (dentro del horizonte) por producto
    const proxCad = new Map<string, Date>();
    for (const lot of lotes) {
      if (!lot.productos || !lot.fecha_caducidad) continue;
      const exp = new Date(lot.fecha_caducidad + 'T00:00:00');
      if (exp > horizon) continue;
      const prev = proxCad.get(lot.producto_id);
      if (!prev || exp < prev) proxCad.set(lot.producto_id, exp);
    }

    type Critico = {
      id: string; nombre: string; categoria: string; stock: number; minimo: number;
      caducidad: Date | null; estado: 'critico' | 'bajo' | 'caducar'; orden: number;
    };
    const rows: Critico[] = [];

    for (const p of productos) {
      const stock = Number(p.stock);
      const minimo = Number(p.stock_minimo);
      const bajo = stock <= minimo;
      const cad = proxCad.get(p.id) ?? null;
      if (!bajo && !cad) continue;

      const dias = cad ? Math.ceil((cad.getTime() - now.getTime()) / 86_400_000) : Infinity;
      // Crítico: stock bajo Y a la vez por caducar, o caducidad <= 15 días
      let estado: Critico['estado'];
      if ((bajo && cad) || dias <= 15) estado = 'critico';
      else if (bajo) estado = 'bajo';
      else estado = 'caducar';
      const orden = estado === 'critico' ? 0 : estado === 'bajo' ? 1 : 2;

      rows.push({ id: p.id, nombre: p.nombre, categoria: p.categoria || 'Sin categoría', stock, minimo, caducidad: cad, estado, orden });
    }

    return rows.sort((a, b) => a.orden - b.orden || a.stock / (a.minimo || 1) - b.stock / (b.minimo || 1)).slice(0, 12);
  }, [productos, lotes]);

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

  const valorEntero = Math.trunc(metrics.totalValuation);
  const valorCentavos = Math.round((metrics.totalValuation - valorEntero) * 100);

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
              {metrics.estimadosPorPrecio > 0 ? 'Valuado a costo (estimado a precio donde no hay costo) · MXN' : 'Valuado a costo · MXN'}
            </span>
          </div>
          <span className="num" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>{fmtMXN(metrics.totalValuation)}</span>
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
                      {r.caducidad ? fmtFecha(r.caducidad.toISOString().slice(0, 10)) : '—'}
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
