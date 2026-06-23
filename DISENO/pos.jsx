// POS / Nueva Venta — main selling screen
const POS = () => {
  const [cart, setCart] = useState([
    { id: 'P001', qty: 2 },
    { id: 'P002', qty: 3 },
    { id: 'P010', qty: 4 },
  ]);
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState('');
  const [cat, setCat] = useState('Todos');
  const [tipoVenta, setTipoVenta] = useState('cliente'); // 'anonima' | 'cliente'
  const [credito, setCredito] = useState(false);
  const [selectedClient, setSelectedClient] = useState(CLIENTS[3]);
  const scanRef = useRef(null);

  useEffect(() => { if (scanRef.current) scanRef.current.focus(); }, []);

  const cats = ['Todos', ...new Set(PRODUCTS.map(p => p.cat))];

  const filtered = PRODUCTS.filter(p =>
    (cat === 'Todos' || p.cat === cat) &&
    (search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search))
  );

  const addToCart = (id) => {
    setCart(prev => {
      const ex = prev.find(c => c.id === id);
      if (ex) return prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.flatMap(c => {
      if (c.id !== id) return c;
      const next = c.qty + delta;
      if (next <= 0) return [];
      return { ...c, qty: next };
    }));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));

  const cartItems = cart.map(c => ({ ...PRODUCTS.find(p => p.id === c.id), qty: c.qty }));
  const subtotal = cartItems.reduce((s, c) => s + c.price * c.qty, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  return (
    <>
      <Topbar title="Nueva Venta" subtitle={`Folio próximo: V-04813 · Caja 1 · ${new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'})}`}>
        <button className="btn btn-secondary"><Icon name="clock" size={16} />Suspender</button>
        <button className="btn btn-danger"><Icon name="x" size={16} />Cancelar venta</button>
      </Topbar>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 420px', height: 'calc(100vh - 64px)', minHeight: 0}}>

        {/* LEFT: products */}
        <div style={{padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0}}>

          {/* Scanner row */}
          <div style={{display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12}}>
            <div className="card" style={{padding: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)', border: '1.5px solid var(--green-line)'}}>
              <div style={{width: 44, height: 44, borderRadius: 10, background: 'var(--green-soft)', color: 'var(--green-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                <Icon name="barcode" size={22} />
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 11, fontWeight: 600, color: 'var(--green-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2}}>Lector de código de barras</div>
                <input
                  ref={scanRef}
                  className="mono"
                  value={scan}
                  onChange={e => setScan(e.target.value)}
                  placeholder="Escanee o teclee el código…"
                  style={{ width: '100%', border: 0, background: 'transparent', fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: 0.5 }}
                />
              </div>
              <span className="kbd">F2</span>
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: var_radius(), padding: '0 14px', height: 76}}>
              <Icon name="search" size={18} color="var(--muted)" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o clave…"
                style={{ flex: 1, border: 0, background: 'transparent', fontSize: 15 }}
              />
              {search && <button onClick={() => setSearch('')} style={{ color: 'var(--muted)', padding: 4 }}><Icon name="x" size={16} /></button>}
            </div>
          </div>

          {/* Category pills */}
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            {cats.map(c => (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{
                  height: 36, padding: '0 16px', borderRadius: 999,
                  background: cat === c ? 'var(--ink)' : 'var(--surface)',
                  color: cat === c ? '#fff' : 'var(--ink-2)',
                  border: `1px solid ${cat === c ? 'var(--ink)' : 'var(--line)'}`,
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12}}>
            {filtered.map(p => {
              const low = p.stock < p.min;
              const critical = p.stock < p.min / 2;
              const inCart = cart.find(c => c.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p.id)}
                  disabled={p.stock === 0}
                  style={{
                    background: 'var(--surface)',
                    border: `1.5px solid ${inCart ? 'var(--green)' : 'var(--line)'}`,
                    borderRadius: 12, padding: 12, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    transition: 'all 0.12s', position: 'relative',
                    boxShadow: inCart ? '0 0 0 3px oklch(0.58 0.13 145 / 0.12)' : 'var(--shadow-sm)',
                  }}
                >
                  {/* image placeholder */}
                  <div style={{
                    height: 90, borderRadius: 8,
                    background: `repeating-linear-gradient(45deg, var(--surface-2) 0 6px, #efece3 6px 12px)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--line-2)', position: 'relative',
                  }}>
                    <div style={{fontSize: 36, fontWeight: 800, color: 'var(--muted-2)', fontFamily: 'JetBrains Mono'}}>{p.img}</div>
                    {inCart && (
                      <div style={{position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 999, background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700}}>{inCart.qty}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: 'var(--ink)', minHeight: 32 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unit}</div>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2}}>
                    <div className="num" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{fmtMXN(p.price)}</div>
                    <span className={`badge ${critical ? 'red' : low ? 'amber' : 'gray'}`} style={{height: 20, padding: '0 7px', fontSize: 11}}>
                      <span className="dot"></span>
                      {p.stock}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: cart */}
        <div style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--line)',
          display: 'flex', flexDirection: 'column', minHeight: 0
        }}>
          {/* Type selector */}
          <div style={{padding: 16, borderBottom: '1px solid var(--line)'}}>
            <div className="label">Tipo de venta</div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
              <button onClick={() => setTipoVenta('anonima')} style={{
                padding: '12px 12px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: `1.5px solid ${tipoVenta === 'anonima' ? 'var(--ink)' : 'var(--line)'}`,
                background: tipoVenta === 'anonima' ? 'var(--ink)' : 'var(--surface)',
                color: tipoVenta === 'anonima' ? '#fff' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Icon name="cart" size={16} />
                Venta Anónima
              </button>
              <button onClick={() => setTipoVenta('cliente')} style={{
                padding: '12px 12px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: `1.5px solid ${tipoVenta === 'cliente' ? 'var(--green)' : 'var(--line)'}`,
                background: tipoVenta === 'cliente' ? 'var(--green-soft)' : 'var(--surface)',
                color: tipoVenta === 'cliente' ? 'var(--green-2)' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Icon name="users" size={16} />
                Venta a Cliente
              </button>
            </div>

            {tipoVenta === 'cliente' && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar" style={{width: 32, height: 32, background: 'var(--green)', fontSize: 12, color: '#fff'}}>IP</div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontSize: 13, fontWeight: 600}}>{selectedClient.name}</div>
                  <div style={{fontSize: 11, color: 'var(--muted)'}}>{selectedClient.rancho} · Crédito disp. {fmtMXN(selectedClient.limite - selectedClient.credito)}</div>
                </div>
                <button className="btn-ghost" style={{padding: 6, borderRadius: 6, color: 'var(--muted)'}}><Icon name="edit" size={14} /></button>
              </div>
            )}
          </div>

          {/* Cart items */}
          <div style={{flex: 1, overflowY: 'auto', padding: '12px 16px', minHeight: 0}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
              <div className="h3">Productos ({cartItems.length})</div>
              <button style={{fontSize: 12, fontWeight: 600, color: 'var(--muted)'}}>Vaciar carrito</button>
            </div>

            {cartItems.length === 0 ? (
              <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', border: '2px dashed var(--line)', borderRadius: 10}}>
                <Icon name="cart" size={28} color="var(--muted-2)" />
                <div style={{marginTop: 10, fontSize: 13}}>Escanea o selecciona un producto para empezar</div>
              </div>
            ) : (
              <div style={{display: 'grid', gap: 8}}>
                {cartItems.map(it => (
                  <div key={it.id} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line-2)' }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{fontSize: 13, fontWeight: 600, lineHeight: 1.3}}>{it.name}</div>
                        <div style={{fontSize: 11, color: 'var(--muted)', marginTop: 2}} className="num">{fmtMXN(it.price)} · {it.unit}</div>
                      </div>
                      <button onClick={() => removeFromCart(it.id)} style={{ color: 'var(--muted)', padding: 4, alignSelf: 'flex-start' }}>
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)'}}>
                        <button onClick={() => updateQty(it.id, -1)} style={{width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)'}}>
                          <Icon name="minus" size={14} />
                        </button>
                        <div className="num" style={{width: 36, textAlign: 'center', fontSize: 15, fontWeight: 700}}>{it.qty}</div>
                        <button onClick={() => updateQty(it.id, 1)} style={{width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)'}}>
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      <div className="num" style={{fontSize: 15, fontWeight: 700}}>{fmtMXN(it.qty * it.price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{borderTop: '1px solid var(--line)', padding: '14px 16px', background: 'var(--surface-2)'}}>
            <div style={{display: 'grid', gap: 6, marginBottom: 12, fontSize: 13}}>
              <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)'}}>
                <span>Subtotal</span>
                <span className="num">{fmtMXN(subtotal)}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)'}}>
                <span>IVA (16%)</span>
                <span className="num">{fmtMXN(iva)}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 10, borderTop: '1px dashed var(--line)'}}>
                <span style={{fontWeight: 700, fontSize: 15}}>Total</span>
                <span className="num" style={{fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em'}}>{fmtMXN(total)}</span>
              </div>
            </div>

            {/* Credit toggle */}
            {tipoVenta === 'cliente' && (
              <button onClick={() => setCredito(!credito)} style={{
                width: '100%', padding: '10px 12px', marginBottom: 10,
                border: `1.5px solid ${credito ? 'oklch(0.86 0.07 80)' : 'var(--line)'}`,
                background: credito ? 'var(--amber-soft)' : 'var(--surface)',
                borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 38, height: 22, borderRadius: 999,
                  background: credito ? 'var(--amber)' : '#cdc8b8',
                  position: 'relative', flex: 'none', transition: 'all 0.15s'
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 999, background: '#fff',
                    position: 'absolute', top: 2, left: credito ? 18 : 2,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'all 0.15s'
                  }}></div>
                </div>
                <div style={{flex: 1, textAlign: 'left'}}>
                  <div style={{fontSize: 13, fontWeight: 600, color: 'var(--ink)'}}>Nota a Crédito (30 días)</div>
                  <div style={{fontSize: 11, color: 'var(--muted)'}}>Vence el 11 de junio 2026</div>
                </div>
                <Icon name="credit" size={18} color={credito ? 'oklch(0.5 0.12 70)' : 'var(--muted)'} />
              </button>
            )}

            <button className="btn btn-primary btn-xl btn-block" style={{ background: credito ? 'oklch(0.55 0.16 70)' : 'var(--green)' }}>
              <Icon name={credito ? 'credit' : 'cash'} size={20} />
              {credito ? 'Generar Nota a Crédito' : 'Cobrar'}
              <span className="num" style={{marginLeft: 'auto', fontSize: 20}}>{fmtMXN(total)}</span>
            </button>

            <div style={{display: 'flex', gap: 8, marginTop: 8}}>
              <button className="btn btn-secondary" style={{flex: 1}}><Icon name="printer" size={14} />Imprimir</button>
              <button className="btn btn-secondary" style={{flex: 1}}><Icon name="file" size={14} />Cotización</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// helper to read CSS var fallback when needed inline
function var_radius() { return 12; }

window.POS = POS;
