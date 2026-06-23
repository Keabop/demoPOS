// Clientes
const Clientes = ({ onNav }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');

  const filtered = CLIENTS.filter(c => {
    if (filter === 'vencida' && c.status !== 'vencida') return false;
    if (filter === 'al-corriente' && c.status !== 'al-corriente') return false;
    if (filter === 'pronto-vence' && c.status !== 'pronto-vence') return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: CLIENTS.length,
    corriente: CLIENTS.filter(c => c.status === 'al-corriente').length,
    vencida: CLIENTS.filter(c => c.status === 'vencida').length,
    prontoVence: CLIENTS.filter(c => c.status === 'pronto-vence').length,
  };

  const statusBadge = (s) => {
    if (s === 'al-corriente') return <span className="badge green"><span className="dot"></span>Al corriente</span>;
    if (s === 'vencida') return <span className="badge red"><span className="dot"></span>Deuda vencida</span>;
    if (s === 'pronto-vence') return <span className="badge amber"><span className="dot"></span>Próxima a vencer</span>;
  };

  const initials = (n) => n.split(' ').slice(0, 2).map(s => s[0]).join('');
  const avatarBg = (s) => s === 'vencida' ? 'oklch(0.55 0.14 25)' : s === 'pronto-vence' ? 'oklch(0.6 0.13 75)' : 'oklch(0.4 0.05 145)';

  return (
    <>
      <Topbar title="Clientes" subtitle={`${CLIENTS.length} clientes registrados · ${stats.vencida} con deuda vencida`}>
        <button className="btn btn-secondary"><Icon name="download" size={16} />Exportar</button>
        <button className="btn btn-primary"><Icon name="plus" size={16} />Nuevo Cliente</button>
      </Topbar>

      <div className="content">
        {/* Summary */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20}}>
          {[
            {label: 'Clientes totales', val: stats.total, sub: 'Activos en el sistema', color: 'gray'},
            {label: 'Al corriente',     val: stats.corriente, sub: 'Sin adeudos vencidos', color: 'green'},
            {label: 'Por vencer (7d)',  val: stats.prontoVence, sub: 'Requieren seguimiento', color: 'amber'},
            {label: 'Deuda vencida',    val: stats.vencida, sub: fmtMXN(23930) + ' por cobrar', color: 'red'},
          ].map(s => (
            <div key={s.label} className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14}}>
              <div className={`badge ${s.color}`} style={{width: 44, height: 44, borderRadius: 10, padding: 0, justifyContent: 'center'}}>
                <span className="num" style={{fontSize: 18, fontWeight: 700}}>{s.val}</span>
              </div>
              <div>
                <div style={{fontSize: 13, fontWeight: 600}}>{s.label}</div>
                <div style={{fontSize: 11, color: 'var(--muted)', marginTop: 2}}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="card" style={{padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12}}>
          <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 40, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)'}}>
            <Icon name="search" size={16} color="var(--muted)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono o rancho…" style={{flex: 1, border: 0, background: 'transparent', fontSize: 14}} />
          </div>
          <div style={{display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)'}}>
            {[
              {id: 'todos', label: 'Todos'},
              {id: 'al-corriente', label: 'Al corriente'},
              {id: 'pronto-vence', label: 'Por vencer'},
              {id: 'vencida', label: 'Vencidas'},
            ].map(t => (
              <button key={t.id} onClick={() => setFilter(t.id)} style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                background: filter === t.id ? 'var(--surface)' : 'transparent',
                color: filter === t.id ? 'var(--ink)' : 'var(--muted)',
                boxShadow: filter === t.id ? 'var(--shadow-sm)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>
          <button className="btn btn-secondary"><Icon name="filter" size={14} />Más filtros</button>
        </div>

        {/* Client cards */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12}}>
          {filtered.map(c => {
            const credUsed = (c.credito / c.limite) * 100;
            return (
              <div key={c.id} className="card" style={{padding: 18, position: 'relative'}}>
                <div style={{display: 'flex', gap: 14, marginBottom: 14}}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 12, background: avatarBg(c.status),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 15, flex: 'none',
                  }}>{initials(c.name)}</div>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{fontWeight: 700, fontSize: 15, lineHeight: 1.2}}>{c.name}</div>
                        <div style={{fontSize: 12, color: 'var(--muted)', marginTop: 3}}>{c.rancho}</div>
                      </div>
                      {statusBadge(c.status)}
                    </div>
                    <div style={{display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--muted)'}}>
                      <span style={{display: 'flex', alignItems: 'center', gap: 4}}><Icon name="phone" size={11} />{c.phone}</span>
                      <span className="mono" style={{display: 'flex', alignItems: 'center', gap: 4}}><Icon name="file" size={11} />{c.id}</span>
                    </div>
                  </div>
                </div>

                {/* Credit bar */}
                <div style={{padding: 12, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 12}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8}}>
                    <div>
                      <div style={{fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600}}>Crédito utilizado</div>
                      <div className="num" style={{fontSize: 18, fontWeight: 700, marginTop: 2}}>
                        {fmtMXN(c.credito)}
                        <span style={{fontSize: 12, color: 'var(--muted)', fontWeight: 500}}> / {fmtMXN(c.limite)}</span>
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontSize: 11, color: 'var(--muted)'}}>Notas activas</div>
                      <div style={{fontSize: 14, fontWeight: 700}}>{c.notas}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 999 }}>
                    <div style={{
                      height: '100%', width: `${credUsed}%`,
                      background: c.status === 'vencida' ? 'var(--red)' : c.status === 'pronto-vence' ? 'var(--amber)' : 'var(--green)',
                      borderRadius: 999,
                    }}></div>
                  </div>
                </div>

                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
                  <div style={{fontSize: 11, color: 'var(--muted)'}}>Última nota: {new Date(c.ultima).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})}</div>
                  <div style={{display: 'flex', gap: 6}}>
                    <button className="btn btn-secondary" style={{height: 34, padding: '0 12px', fontSize: 12}}>Ver perfil</button>
                    <button className="btn btn-primary" style={{height: 34, padding: '0 12px', fontSize: 12}} onClick={() => onNav('credito')}>
                      <Icon name="credit" size={12} />
                      Notas ({c.notas})
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

window.Clientes = Clientes;
