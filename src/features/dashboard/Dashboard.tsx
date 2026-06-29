import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { Topbar } from '../../components/Topbar';
import { fmtMXN } from '../../lib/format';
import { TZ_MX, ymdEnMX, inicioDiaMX } from '../../lib/dates';
import { useAlActivar } from '../../hooks/useAlActivar';

const formatK = (v: number) => (v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);

interface DashboardProps {
  onNav: (screen: string) => void;
  activo?: boolean;
}

interface SaleRecord { folio: string; cliente: string; tipo: string; hora: string; total: number; }
interface LowStockProduct { id: string; name: string; unit: string; stock: number; min: number; }
interface OverdueCredit { n: string; m: number; dias: number; }

// Respuesta de la RPC fn_dashboard (agregados en SQL).
interface DashboardData {
  ventasHoySum: number; ventasHoyCount: number; ventasHoyDevueltas: number;
  lowStockCount: number; lowStockList: { id: string; name: string; unit: string; stock: number; min: number }[];
  pendingCreditsCount: number; pendingCreditsSum: number;
  activeClientsCount: number;
  recentSales: { folio: string; tipo_pago: string; total: number; fecha: string; cliente: string | null }[];
  overdueCount: number; overdueList: { n: string; m: number; dias: number }[];
}

export const Dashboard: React.FC<DashboardProps> = ({ onNav, activo }) => {
  const [loading, setLoading] = useState(true);

  const [todaySalesSum, setTodaySalesSum] = useState(0);
  const [todayTransactions, setTodayTransactions] = useState(0);
  const [todayDevueltas, setTodayDevueltas] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingCreditsCount, setPendingCreditsCount] = useState(0);
  const [pendingCreditsSum, setPendingCreditsSum] = useState(0);
  const [activeClientsCount, setActiveClientsCount] = useState(0);

  const [lowStockList, setLowStockList] = useState<LowStockProduct[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [overdueCredits, setOverdueCredits] = useState<OverdueCredit[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [weeklySalesData, setWeeklySalesData] = useState<{ d: string; sub?: string; v: number }[]>([]);
  const [timeRange, setTimeRange] = useState<'semana' | 'mes' | 'ano'>('semana');
  const [chartLoading, setChartLoading] = useState(false);

  // Fecha actual (encabezado) en hora de México, no del navegador.
  const today = new Date();
  const dateStr = today.toLocaleDateString('es-MX', { timeZone: TZ_MX, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // KPIs y listas cortas agregados en SQL (fn_dashboard); "hoy" anclado a MX.
      const todayStart = inicioDiaMX(ymdEnMX());
      const { data, error } = await supabase.rpc('fn_dashboard', { p_hoy_inicio: todayStart.toISOString() });
      if (error) throw error;
      const d = data as DashboardData;

      setTodaySalesSum(Number(d.ventasHoySum));
      setTodayTransactions(d.ventasHoyCount);
      setTodayDevueltas(Number(d.ventasHoyDevueltas) || 0);
      setLowStockCount(d.lowStockCount);
      setLowStockList(d.lowStockList.map(p => ({ id: p.id, name: p.name, unit: p.unit, stock: Number(p.stock), min: Number(p.min) })));
      setPendingCreditsCount(d.pendingCreditsCount);
      setPendingCreditsSum(Number(d.pendingCreditsSum));
      setActiveClientsCount(d.activeClientsCount);
      setRecentSales(d.recentSales.map(r => ({
        folio: r.folio,
        cliente: r.cliente || 'Venta Anónima',
        tipo: r.tipo_pago === 'credito' ? 'Crédito' : r.tipo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo',
        hora: new Date(r.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
        total: Number(r.total),
      })));
      setOverdueCount(d.overdueCount);
      setOverdueCredits(d.overdueList.map(o => ({ n: o.n, m: Number(o.m), dias: o.dias })));
    } catch (err) {
      console.error('Error al cargar métricas del Tablero:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadChartData = async (range: 'semana' | 'mes' | 'ano') => {
    try {
      setChartLoading(true);
      const keyDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const keyMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const inicio = new Date();
      if (range === 'semana') { inicio.setDate(inicio.getDate() - 6); inicio.setHours(0, 0, 0, 0); }
      else if (range === 'mes') { inicio.setDate(inicio.getDate() - 27); inicio.setHours(0, 0, 0, 0); }
      else { inicio.setMonth(inicio.getMonth() - 11); inicio.setDate(1); inicio.setHours(0, 0, 0, 0); }

      const { data, error } = await supabase.rpc('fn_dashboard_serie', { p_inicio: inicio.toISOString(), p_modo: range });
      if (error) throw error;
      const buckets = (data as { bucket: string; total: number }[]) || [];
      const by = new Map(buckets.map(b => [b.bucket, Number(b.total)]));

      if (range === 'semana') {
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(); d.setDate(d.getDate() - 6 + i);
          return { d: dayNames[d.getDay()], v: by.get(keyDay(d)) ?? 0 };
        });
        setWeeklySalesData(days);
      } else if (range === 'mes') {
        const weeks = Array.from({ length: 4 }).map((_, i) => {
          const end = new Date(); end.setDate(end.getDate() - (3 - i) * 7); end.setHours(0, 0, 0, 0);
          const start = new Date(end); start.setDate(start.getDate() - 6);
          let v = 0;
          const cur = new Date(start);
          while (cur <= end) { v += by.get(keyDay(cur)) ?? 0; cur.setDate(cur.getDate() + 1); }
          const sub = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`;
          return { d: `Sem ${i + 1}`, sub, v };
        });
        setWeeklySalesData(weeks);
      } else {
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const months = Array.from({ length: 12 }).map((_, i) => {
          const d = new Date(); d.setMonth(d.getMonth() - 11 + i);
          return { d: monthNames[d.getMonth()], sub: String(d.getFullYear()).slice(-2), v: by.get(keyMonth(d)) ?? 0 };
        });
        setWeeklySalesData(months);
      }
    } catch (err) {
      console.error('Error al cargar datos del gráfico:', err);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboardData();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChartData(timeRange);
  }, [timeRange]);

  // Keep-alive: al volver a esta pantalla (sin remontar), recarga KPIs y la serie
  // del gráfico desde el servidor, conservando el rango de tiempo seleccionado.
  useAlActivar(activo ?? true, () => { loadDashboardData(); loadChartData(timeRange); });

  const totalWeeklySalesSum = weeklySalesData.reduce((acc, curr) => acc + curr.v, 0);

  const chart = useMemo(() => {
    const mL = 40, mT = 14, mB = 182, xR = 720;
    if (!weeklySalesData.length) return null;
    const maxV = Math.max(...weeklySalesData.map(d => d.v), 1);
    const niceMax = maxV * 1.12;
    const n = weeklySalesData.length;
    const xFor = (i: number) => (n === 1 ? (mL + (xR - mL) / 2) : mL + (i / (n - 1)) * (xR - mL));
    const yFor = (v: number) => mB - (v / niceMax) * (mB - mT);
    const pts = weeklySalesData.map((d, i) => ({ x: xFor(i), y: yFor(d.v), d }));
    const line = 'M ' + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${mB} L ${pts[0].x.toFixed(1)} ${mB} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: mT + r * (mB - mT), val: niceMax * (1 - r) }));
    const colW = n > 1 ? (xR - mL) / (n - 1) : (xR - mL);
    const step = Math.max(1, Math.ceil(n / 9));
    return { mL, mT, mB, pts, line, area, grid, colW, step };
  }, [weeklySalesData]);

  if (loading) {
    return (
      <>
        <Topbar title="Tablero" subtitle="Cargando...">
          <button className="btn btn-secondary" disabled>Exportar</button>
          <button className="btn btn-primary" disabled>Nueva Venta</button>
        </Topbar>
        <div className="content">
          <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
            <div className="h2" style={{ color: 'var(--ink)' }}>Cargando datos...</div>
            <p style={{ marginTop: 8, fontSize: 14 }}>Conectando con Supabase para obtener estadísticas en tiempo real.</p>
          </div>
        </div>
      </>
    );
  }

  const cards = [
    { key: 'sales', label: 'Ventas de hoy', value: fmtMXN(todaySalesSum), sub: `${todayTransactions} transacciones${todayDevueltas > 0 ? ` · ${todayDevueltas} devueltas` : ''}`, icon: 'cash', accent: 'green', screen: 'caja' },
    { key: 'stock', label: 'Alertas de stock bajo', value: lowStockCount, sub: lowStockList.length > 0 ? (lowStockList.map(p => p.name.split(' ')[0]).join(', ').slice(0, 42) + '...') : 'Sin alertas de stock', icon: 'alert', accent: 'amber', screen: 'inventario' },
    { key: 'credit', label: 'Notas a crédito pendientes', value: pendingCreditsCount, sub: `Por cobrar ${fmtMXN(pendingCreditsSum)}`, icon: 'credit', accent: 'red', screen: 'credito' },
    { key: 'clients', label: 'Clientes activos', value: activeClientsCount, sub: 'Clientes en base de datos', icon: 'users', accent: 'blue', screen: 'clientes' },
  ];

  const accentMap: Record<string, { bg: string; fg: string }> = {
    green: { bg: 'var(--green-soft)', fg: 'var(--green-2)' },
    amber: { bg: 'var(--amber-soft)', fg: 'oklch(0.5 0.12 70)' },
    red:   { bg: 'var(--red-soft)',   fg: 'var(--red)' },
    blue:  { bg: 'var(--blue-soft)',  fg: 'var(--blue)' },
  };

  return (
    <>
      <Topbar title="Tablero" subtitle={formattedDate}>
        <button className="btn btn-secondary" onClick={() => onNav('reportes')}>
          <Icon name="report" size={16} />
          Reportes
        </button>
        <button className="btn btn-primary" onClick={() => onNav('pos')}>
          <Icon name="plus" size={16} />
          Nueva Venta
        </button>
      </Topbar>

      <div className="content">
        {/* KPI grid */}
        <div className="catalog-kpis-grid" data-tour="dash-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {cards.map(c => {
            const a = accentMap[c.accent];
            return (
              <div
                key={c.key}
                className="card"
                style={{ padding: 20, position: 'relative', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease' }}
                onClick={() => onNav(c.screen)}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = 'var(--green)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = ''; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{c.label}</div>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: a.bg, color: a.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={c.icon} size={16} />
                  </div>
                </div>
                <div className="num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{c.value}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{c.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Acciones rápidas */}
        <div className="card" data-tour="dash-acciones" style={{ padding: 18, marginBottom: 24 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Acciones rápidas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            {[
              { label: 'Flujo de caja', icon: 'cash', screen: 'caja' },
              { label: 'Cobranza', icon: 'credit', screen: 'credito' },
              { label: 'Inventario', icon: 'box', screen: 'inventario' },
              { label: 'Clientes', icon: 'users', screen: 'clientes' },
            ].map(a => (
              <button key={a.screen} type="button" className="btn btn-secondary" onClick={() => onNav(a.screen)}
                style={{ height: 64, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <Icon name={a.icon} size={22} color="var(--green-2)" />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart + Low stock */}
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="h3">{timeRange === 'semana' ? 'Ventas de la semana' : timeRange === 'mes' ? 'Ventas del mes' : 'Ventas del año'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {timeRange === 'semana' ? 'Registro semanal de transacciones' : timeRange === 'mes' ? 'Registro agrupado por semanas' : 'Registro anual agrupado por meses'}
                </div>
              </div>
              <div data-tour="dash-rango" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
                {(['semana', 'mes', 'ano'] as const).map((r) => {
                  const labelMap = { semana: 'Semana', mes: 'Mes', ano: 'Año' };
                  const active = timeRange === r;
                  return (
                    <button key={r} onClick={() => setTimeRange(r)}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 5, background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--ink)' : 'var(--muted)', boxShadow: active ? 'var(--shadow-sm)' : 'none', border: 0, cursor: 'pointer' }}>
                      {labelMap[r]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
              <div className="num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtMXN(totalWeeklySalesSum)}</div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {timeRange === 'semana' ? 'Total ventas de la semana' : timeRange === 'mes' ? 'Total ventas del mes' : 'Total ventas del año'}
              </span>
            </div>

            {chartLoading ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted)' }}>Cargando gráfico...</div>
            ) : !chart || totalWeeklySalesSum === 0 ? (
              <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}>
                <Icon name="report" size={24} color="var(--muted)" />
                <div style={{ fontSize: 13 }}>Sin ventas registradas en este periodo.</div>
              </div>
            ) : (
              <svg viewBox="0 0 760 220" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
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
                <path d={chart.area} fill="url(#dashArea)" />
                <path d={chart.line} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {chart.pts.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r={3} fill="var(--green)" />)}
                {chart.pts.map((p, i) => (
                  (i % chart.step === 0 || i === chart.pts.length - 1) &&
                  <text key={`x${i}`} x={p.x} y={208} textAnchor="middle" fontSize={10} fill="var(--muted)" fontWeight={600}>{p.d.d}</text>
                ))}
                {chart.pts.map((p, i) => (
                  <g className="col" key={`c${i}`}>
                    <rect x={p.x - chart.colW / 2} y={14} width={chart.colW} height={168} fill="transparent" />
                    <line className="col-line" x1={p.x} y1={14} x2={p.x} y2={182} stroke="var(--green)" strokeWidth={1} strokeDasharray="3 3" />
                    <circle className="col-dot" cx={p.x} cy={p.y} r={5} fill="var(--surface)" stroke="var(--green)" strokeWidth={2.5} />
                    <g className="col-tip" transform={`translate(${Math.min(Math.max(p.x, 50), 710)}, ${p.y})`}>
                      <rect x={-52} y={-52} width={104} height={42} rx={6} fill="var(--ink)" />
                      <text x={0} y={-35} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600} fontFamily="'Manrope'">{p.d.d}{p.d.sub ? ` ${p.d.sub}` : ''}</text>
                      <text x={0} y={-19} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} fontFamily="'JetBrains Mono'">{fmtMXN(p.d.v)}</text>
                    </g>
                  </g>
                ))}
              </svg>
            )}
          </div>

          {/* Low stock panel */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="h3">Stock bajo</div>
              <button onClick={() => onNav('inventario')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-2)' }}>Ver todo →</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {lowStockList.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', border: '2px dashed var(--line)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Icon name="check" size={24} color="var(--green)" />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Todo en orden</div>
                  <div style={{ fontSize: 11 }}>No hay productos con stock bajo.</div>
                </div>
              ) : (
                lowStockList.slice(0, 4).map(p => {
                  const pct = p.min > 0 ? (p.stock / p.min) * 100 : 0;
                  const critical = pct < 50;
                  return (
                    <div key={p.id} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unit}</div>
                        </div>
                        <span className={`badge ${critical ? 'red' : 'amber'}`}><span className="dot"></span>{p.stock}/{p.min}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 999 }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: critical ? 'var(--red)' : 'var(--amber)', borderRadius: 999 }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Recent + Credit alert row */}
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 22, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="h3">Ventas recientes</div>
              <button onClick={() => onNav('pos')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-2)' }}>Nueva venta →</button>
            </div>
            {recentSales.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', border: '2px dashed var(--line)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Icon name="cart" size={28} color="var(--muted-2)" />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Sin ventas recientes</div>
                <div style={{ fontSize: 11 }}>Las transacciones realizadas aparecerán en esta tabla.</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Folio</th>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Tipo</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Hora</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map(r => (
                    <tr key={r.folio}>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid var(--line-2)' }} className="num">{r.folio}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid var(--line-2)' }}>{r.cliente}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid var(--line-2)' }}>
                        <span className={`badge ${r.tipo === 'Crédito' ? 'amber' : 'green'}`}><span className="dot"></span>{r.tipo}</span>
                      </td>
                      <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--muted)', borderBottom: '1px solid var(--line-2)' }} className="num">{r.hora}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--line-2)' }} className="num">{fmtMXN(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" data-tour="dash-alertas" style={{ padding: 22, background: overdueCount > 0 ? 'linear-gradient(160deg, oklch(0.97 0.04 25) 0%, var(--surface) 60%)' : 'linear-gradient(160deg, var(--green-soft) 0%, var(--surface) 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Icon name={overdueCount > 0 ? 'alert' : 'check'} size={18} color={overdueCount > 0 ? 'var(--red)' : 'var(--green)'} />
              <div className="h3" style={{ color: overdueCount > 0 ? 'var(--red)' : 'var(--green-2)' }}>
                {overdueCount > 0 ? 'Atención requerida' : 'Créditos al corriente'}
              </div>
            </div>

            {overdueCount === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
                No hay notas de crédito vencidas en el sistema. Todos los saldos pendientes de tus clientes están al corriente.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, marginBottom: 18, lineHeight: 1.5 }}>
                  Hay <strong>{overdueCount} notas a crédito vencidas</strong>. Contacta a los clientes para gestionar el pago.
                </p>
                <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                  {overdueCredits.slice(0, 3).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)' }}>
                      <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.n}</div>
                        <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{c.dias} días vencido</div>
                      </div>
                      <div className="num" style={{ fontSize: 14, fontWeight: 700, flex: 'none' }}>{fmtMXN(c.m)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button className="btn btn-secondary btn-block" style={{ marginTop: overdueCount === 0 ? 20 : 0 }} onClick={() => onNav('credito')}>
              <Icon name="credit" size={16} />
              Ver panel de créditos
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
