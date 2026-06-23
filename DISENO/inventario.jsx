// Inventario
const Inventario = () => {
  const [search, setSearch] = useState('');
  const [moveType, setMoveType] = useState('entrada');
  const [selProd, setSelProd]   = useState(PRODUCTS[0].id);
  const [qty, setQty] = useState(10);

  const filtered = PRODUCTS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const inv = {
    total: PRODUCTS.length,
    valorTotal: PRODUCTS.reduce((s, p) => s + p.stock * p.price, 0),
    low: PRODUCTS.filter(p => p.stock < p.min).length,
    out: PRODUCTS.filter(p => p.stock === 0).length,
  };

  const stockStatus = (p) => {
    if (p.stock === 0) return { color: 'red', label: 'Agotado' };
    if (p.stock < p.min / 2) return { color: 'red', label: 'Crítico' };
    if (p.stock < p.min) return { color: 'amber', label: 'Bajo' };
    return { color: 'green', label: 'Normal' };
  };

  return (
    <>
      <Topbar title="Inventario" subtitle={`${PRODUCTS.length} productos · Valor total ${fmtMXN0(inv.valorTotal)}`}>
        <button className="btn btn-secondary"><Icon name="download" size={16} />Exportar</button>
        <button className="btn btn-primary"><Icon name="plus" size={16} />Nuevo Producto</button>
      </Topbar>

      <div className="content">
        {/* KPIs */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20}}>
          {[
            {label: 'Productos', val: inv.total, sub: '4 categorías', color: 'gray', icon: 'package'},
            {label: 'Valor en inventario', val: fmtMXN0(inv.valorTotal), sub: 'Costo de reposición', color: 'green', icon: 'cash'},
            {label: 'Stock bajo', val: inv.low, sub: 'Pedir pronto', color: 'amber', icon: 'alert'},
            {label: 'Agotados', val: inv.out, sub: 'Requieren reposición', color: 'red', icon: 'x'},
          ].map(k => (
            <div key={k.label} className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 12}}>
              <div style={{width: 40, height: 40, borderRadius: 10, background: `var(--${k.color === 'gray' ? 'line-2' : `${k.color === 'green' ? 'green-soft' : k.color === 'amber' ? 'amber-soft' : 'red-soft'}`})`, color: k.color === 'green' ? 'var(--green-2)' : k.color === 'amber' ? 'oklch(0.5 0.12 70)' : k.color === 'red' ? 'var(--red)' : 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                <Icon name={k.icon} size={18} />
              </div>
              <div>
                <div className="num" style={{fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em'}}>{k.val}</div>
                <div style={{fontSize: 12, color: 'var(--muted)'}}>{k.label} · {k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16}}>
          {/* Product list */}
          <div className="card" style={{padding: 0, overflow: 'hidden'}}>
            <div style={{padding: 16, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10}}>
              <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 38, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)'}}>
                <Icon name="search" size={16} color="var(--muted)" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" style={{flex: 1, border: 0, background: 'transparent', fontSize: 14}} />
              </div>
              <button className="btn btn-secondary" style={{height: 38}}><Icon name="filter" size={14} />Filtrar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)' }}>
                  <th style={{ textAlign: 'left',  padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Producto</th>
                  <th style={{ textAlign: 'left',  padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>SKU</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Stock</th>
                  <th style={{ textAlign: 'left',  padding: '10px 8px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Nivel</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const s = stockStatus(p);
                  const pct = Math.min((p.stock / (p.min * 2)) * 100, 100);
                  return (
                    <tr key={p.id} style={{cursor: 'pointer'}} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: `repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--line-2) 4px 8px)`,
                            border: '1px solid var(--line)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, color: 'var(--muted)', fontFamily: 'JetBrains Mono', flex: 'none',
                          }}>{p.img}</div>
                          <div>
                            <div style={{fontWeight: 600}}>{p.name}</div>
                            <div style={{fontSize: 11, color: 'var(--muted)'}}>{p.unit} · {p.cat}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)' }} className="mono">{p.sku.slice(-6)}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-2)' }} className="num">
                        <span style={{ fontWeight: 700, fontSize: 14, color: s.color === 'red' ? 'var(--red)' : s.color === 'amber' ? 'oklch(0.5 0.12 70)' : 'var(--ink)' }}>{p.stock}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }}>/ {p.min} mín</span>
                      </td>
                      <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--line-2)', width: 160 }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <div style={{flex: 1, height: 5, background: 'var(--line-2)', borderRadius: 999}}>
                            <div style={{ height: '100%', width: `${pct}%`, background: s.color === 'red' ? 'var(--red)' : s.color === 'amber' ? 'var(--amber)' : 'var(--green)', borderRadius: 999 }}></div>
                          </div>
                          <span className={`badge ${s.color}`} style={{height: 20, fontSize: 10}}>{s.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--line-2)', fontWeight: 700 }} className="num">{fmtMXN(p.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Side: Quick entry */}
          <div style={{display: 'grid', gap: 16, alignContent: 'start'}}>
            <div className="card" style={{padding: 18}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14}}>
                <Icon name="sack" size={20} color="var(--green-2)" />
                <div className="h3">Registrar movimiento</div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14}}>
                <button onClick={() => setMoveType('entrada')} style={{
                  padding: '12px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                  border: `1.5px solid ${moveType === 'entrada' ? 'var(--green)' : 'var(--line)'}`,
                  background: moveType === 'entrada' ? 'var(--green-soft)' : 'var(--surface)',
                  color: moveType === 'entrada' ? 'var(--green-2)' : 'var(--ink-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Icon name="arrow-down" size={14} />
                  Entrada
                </button>
                <button onClick={() => setMoveType('salida')} style={{
                  padding: '12px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                  border: `1.5px solid ${moveType === 'salida' ? 'oklch(0.55 0.16 25)' : 'var(--line)'}`,
                  background: moveType === 'salida' ? 'var(--red-soft)' : 'var(--surface)',
                  color: moveType === 'salida' ? 'var(--red)' : 'var(--ink-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Icon name="arrow-up" size={14} />
                  Salida
                </button>
              </div>

              <div className="label">Producto</div>
              <select className="input" value={selProd} onChange={e => setSelProd(e.target.value)} style={{marginBottom: 12, appearance: 'none', backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%237a827e\' stroke-width=\'2\'><path d=\'m6 9 6 6 6-6\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32}}>
                {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="label">Cantidad (costales / unidades)</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="btn btn-secondary" style={{width: 40, height: 48, padding: 0}}>
                  <Icon name="minus" size={16} />
                </button>
                <input className="input input-lg num" value={qty} onChange={e => setQty(Number(e.target.value) || 0)} style={{textAlign: 'center', fontSize: 18, fontWeight: 700}} />
                <button onClick={() => setQty(qty + 1)} className="btn btn-secondary" style={{width: 40, height: 48, padding: 0}}>
                  <Icon name="plus" size={16} />
                </button>
              </div>

              <div className="label">Referencia / proveedor</div>
              <input className="input" placeholder="Ej. Factura F-12390 Bayer" style={{marginBottom: 14}} />

              <div className="label">Nota (opcional)</div>
              <textarea className="input" rows="2" style={{height: 'auto', padding: '10px 14px', resize: 'none', marginBottom: 14}} placeholder="Lote, caducidad, observaciones…"></textarea>

              <button className="btn btn-primary btn-lg btn-block">
                <Icon name="check" size={16} />
                Registrar {moveType === 'entrada' ? 'entrada' : 'salida'} de {qty}
              </button>
            </div>

            <div className="card" style={{padding: 18}}>
              <div className="h3" style={{marginBottom: 12}}>Movimientos recientes</div>
              <div style={{display: 'grid', gap: 10}}>
                {MOVEMENTS.map((m, i) => (
                  <div key={i} style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flex: 'none',
                      background: m.tipo === 'entrada' ? 'var(--green-soft)' : 'var(--red-soft)',
                      color: m.tipo === 'entrada' ? 'var(--green-2)' : 'var(--red)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={m.tipo === 'entrada' ? 'arrow-down' : 'arrow-up'} size={14} />
                    </div>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{m.prod}</div>
                      <div style={{fontSize: 11, color: 'var(--muted)'}}>{m.fecha} · {m.ref}</div>
                    </div>
                    <div className="num" style={{fontSize: 13, fontWeight: 700, color: m.tipo === 'entrada' ? 'var(--green-2)' : 'var(--red)'}}>
                      {m.tipo === 'entrada' ? '+' : '−'}{m.qty}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

window.Inventario = Inventario;
