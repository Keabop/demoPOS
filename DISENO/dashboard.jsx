// Admin Dashboard
const Dashboard = ({ onNav }) => {
  const today = new Date();
  const dateStr = today.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const lowStock = PRODUCTS.filter(p => p.stock < p.min);
  const totalSalesToday = 38940;
  const totalSalesYday  = 31250;
  const deltaPct = ((totalSalesToday - totalSalesYday) / totalSalesYday) * 100;

  const cards = [
    {
      key: 'sales',
      label: 'Ventas de hoy',
      value: fmtMXN(totalSalesToday),
      delta: `+${deltaPct.toFixed(1)}% vs ayer`,
      deltaUp: true,
      sub: '23 transacciones · turno T-2',
      icon: 'cash',
      accent: 'green',
    },
    {
      key: 'stock',
      label: 'Alertas de stock bajo',
      value: lowStock.length,
      delta: '3 productos críticos',
      deltaUp: false,
      sub: 'NPK Triple 17, Herbicida 1L, Cal Dolomita',
      icon: 'alert',
      accent: 'amber',
    },
    {
      key: 'credit',
      label: 'Notas a crédito pendientes',
      value: 7,
      delta: '2 vencidas',
      deltaUp: false,
      sub: 'Por cobrar $54,820.00',
      icon: 'credit',
      accent: 'red',
    },
    {
      key: 'clients',
      label: 'Clientes activos',
      value: CLIENTS.length,
      delta: '+1 esta semana',
      deltaUp: true,
      sub: 'Crédito utilizado 38%',
      icon: 'users',
      accent: 'blue',
    },
  ];

  const accentMap = {
    green: { bg: 'var(--green-soft)', fg: 'var(--green-2)', line: 'var(--green-line)' },
    amber: { bg: 'var(--amber-soft)', fg: 'oklch(0.5 0.12 70)', line: 'oklch(0.86 0.07 80)' },
    red:   { bg: 'var(--red-soft)',   fg: 'var(--red)',     line: 'oklch(0.86 0.07 25)' },
    blue:  { bg: 'var(--blue-soft)',  fg: 'var(--blue)',    line: 'oklch(0.86 0.05 240)' },
  };

  const maxV = Math.max(...WEEK_SALES.map(d => d.v));

  return (
    <>
      <Topbar title="Tablero" subtitle={dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}>
        <button className="btn btn-secondary"><Icon name="download" size={16} />Exportar</button>
        <button className="btn btn-primary" onClick={() => onNav('pos')}><Icon name="plus" size={16} />Nueva Venta</button>
      </Topbar>

      <div className="content">
        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {cards.map(c => {
            const a = accentMap[c.accent];
            return (
              <div key={c.key} className="card" style={{ padding: 20, position: 'relative', cursor: 'pointer' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14}}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{c.label}</div>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: a.bg, color: a.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={c.icon} size={16} />
                  </div>
                </div>
                <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{c.value}</div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${c.deltaUp ? 'green' : c.accent === 'red' ? 'red' : 'amber'}`}>
                    <Icon name={c.deltaUp ? 'arrow-up' : 'arrow-down'} size={12} strokeWidth={2.5} />
                    {c.delta}
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{c.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Chart + Low stock */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18}}>
              <div>
                <div className="h3">Ventas de la semana</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Lunes 4 — Domingo 10 de mayo</div>
              </div>
              <div style={{display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)'}}>
                {['Semana', 'Mes', 'Año'].map((t, i) => (
                  <button key={t} style={{padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 5, background: i === 0 ? 'var(--surface)' : 'transparent', color: i === 0 ? 'var(--ink)' : 'var(--muted)', boxShadow: i === 0 ? 'var(--shadow-sm)' : 'none'}}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
              <div className="num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtMXN(172200)}</div>
              <span className="badge green"><Icon name="arrow-up" size={12} strokeWidth={2.5} />+12.4%</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>vs semana anterior</span>
            </div>

            {/* Chart */}
            <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 14, paddingTop: 18, position: 'relative' }}>
              {/* gridlines */}
              <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none'}}>
                {[0,1,2,3].map(i => <div key={i} style={{borderTop: '1px dashed var(--line)'}}></div>)}
              </div>
              {WEEK_SALES.map((d, i) => {
                const h = (d.v / maxV) * 100;
                const isHighlight = i === 5;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
                    {isHighlight && (
                      <div style={{ position: 'absolute', bottom: `calc(${h}% + 6px)`, background: 'var(--ink)', color: '#fff', fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span className="num">{fmtMXN0(d.v)}</span>
                      </div>
                    )}
                    <div style={{ width: '100%', maxWidth: 56, height: `${h}%`, background: isHighlight ? 'var(--green)' : 'oklch(0.86 0.06 145)', borderRadius: '6px 6px 0 0', transition: 'all 0.3s', position: 'relative' }}>
                      {isHighlight && (
                        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, oklch(0.65 0.13 145) 0%, var(--green) 100%)', borderRadius: '6px 6px 0 0'}}></div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: isHighlight ? 'var(--ink)' : 'var(--muted)', fontWeight: isHighlight ? 700 : 500 }}>{d.d}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Low stock panel */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
              <div className="h3">Stock bajo</div>
              <button onClick={() => onNav('inventario')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-2)' }}>Ver todo →</button>
            </div>
            <div style={{display: 'grid', gap: 10}}>
              {lowStock.slice(0, 4).map(p => {
                const pct = (p.stock / p.min) * 100;
                const critical = pct < 50;
                return (
                  <div key={p.id} style={{padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8}}>
                      <div style={{flex: 1, minWidth: 0, paddingRight: 8}}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unit}</div>
                      </div>
                      <span className={`badge ${critical ? 'red' : 'amber'}`}>
                        <span className="dot"></span>
                        {p.stock}/{p.min}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: critical ? 'var(--red)' : 'var(--amber)', borderRadius: 999 }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent + Credit alert row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
              <div className="h3">Ventas recientes</div>
              <button style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-2)' }}>Ver historial →</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ textAlign: 'left',  padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Folio</th>
                  <th style={{ textAlign: 'left',  padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Cliente</th>
                  <th style={{ textAlign: 'left',  padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Hora</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_SALES.map(r => (
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
          </div>

          <div className="card" style={{ padding: 22, background: 'linear-gradient(160deg, oklch(0.97 0.04 25) 0%, var(--surface) 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Icon name="alert" size={18} color="var(--red)" />
              <div className="h3" style={{ color: 'var(--red)' }}>Atención requerida</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, marginBottom: 18, lineHeight: 1.5 }}>
              Hay <strong>2 notas a crédito vencidas</strong> por un total de <span className="num" style={{fontWeight: 700}}>$23,930.00</span>. Contacta a los clientes para gestionar el pago.
            </p>

            <div style={{display: 'grid', gap: 10, marginBottom: 18}}>
              {[
                {n: 'María de la Luz Vázquez', m: 5150.00, dias: 18},
                {n: 'Cooperativa Los Robles',  m: 15280.00, dias: 12},
              ].map(c => (
                <div key={c.n} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)'}}>
                  <div>
                    <div style={{fontSize: 13, fontWeight: 600}}>{c.n}</div>
                    <div style={{fontSize: 11, color: 'var(--red)', fontWeight: 600}}>{c.dias} días vencido</div>
                  </div>
                  <div className="num" style={{fontSize: 14, fontWeight: 700}}>{fmtMXN(c.m)}</div>
                </div>
              ))}
            </div>

            <button className="btn btn-secondary btn-block" onClick={() => onNav('credito')}>
              <Icon name="credit" size={16} />
              Ver notas vencidas
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

window.Dashboard = Dashboard;
