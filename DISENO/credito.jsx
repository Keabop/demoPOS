// Nota de Crédito detail
const Credito = ({ onNav }) => {
  const n = CREDIT_NOTE;
  const subtotal = n.items.reduce((s, i) => s + i.qty * i.price, 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  const pagado = n.pagos.reduce((s, p) => s + p.monto, 0);
  const saldo = total - pagado;

  const venceDate = new Date(n.vence);
  const today = new Date('2026-05-12');
  const diffDays = Math.ceil((venceDate - today) / (1000 * 60 * 60 * 24));
  const vencida = diffDays < 0;

  return (
    <>
      <Topbar title="Nota a Crédito" subtitle={
        <span>
          <button onClick={() => onNav('clientes')} style={{color: 'var(--green-2)', fontWeight: 600}}>Clientes</button>
          <span style={{margin: '0 6px', color: 'var(--muted-2)'}}>/</span>
          <span>{n.cliente.name}</span>
          <span style={{margin: '0 6px', color: 'var(--muted-2)'}}>/</span>
          <span className="mono">{n.folio}</span>
        </span>
      }>
        <button className="btn btn-secondary"><Icon name="printer" size={16} />Imprimir nota</button>
        <button className="btn btn-secondary"><Icon name="mail" size={16} />Enviar por correo</button>
        <button className="btn btn-primary"><Icon name="cash" size={16} />Registrar pago</button>
      </Topbar>

      <div className="content">
        {/* Status banner */}
        <div className="card" style={{
          padding: 20, marginBottom: 20,
          background: vencida ? 'linear-gradient(135deg, var(--red-soft) 0%, var(--surface) 70%)' : 'linear-gradient(135deg, var(--green-soft) 0%, var(--surface) 70%)',
          borderColor: vencida ? 'oklch(0.85 0.08 25)' : 'var(--green-line)',
        }}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: vencida ? 'var(--red)' : 'var(--green)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
              }}>
                <Icon name={vencida ? 'alert' : 'credit'} size={26} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span className="mono" style={{fontSize: 16, fontWeight: 700, letterSpacing: 0.5}}>{n.folio}</span>
                  {vencida
                    ? <span className="badge red"><span className="dot"></span>Vencida hace {Math.abs(diffDays)} días</span>
                    : <span className="badge green"><span className="dot"></span>Al corriente · vence en {diffDays} días</span>
                  }
                </div>
                <div style={{fontSize: 13, color: 'var(--ink-2)'}}>
                  Emitida el <strong>{new Date(n.fecha).toLocaleDateString('es-MX', {day: 'numeric', month: 'long', year: 'numeric'})}</strong>
                  {' · '}
                  Vence el <strong>{new Date(n.vence).toLocaleDateString('es-MX', {day: 'numeric', month: 'long', year: 'numeric'})}</strong>
                  {' · '}
                  Crédito a 30 días
                </div>
              </div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600}}>Saldo pendiente</div>
              <div className="num" style={{fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', color: vencida ? 'var(--red)' : 'var(--ink)', lineHeight: 1.1}}>{fmtMXN(saldo)}</div>
              <div className="num" style={{fontSize: 12, color: 'var(--muted)', marginTop: 4}}>
                Pagado {fmtMXN(pagado)} de {fmtMXN(total)}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div style={{marginTop: 18}}>
            <div style={{ height: 8, background: 'var(--surface)', borderRadius: 999, border: '1px solid var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(pagado / total) * 100}%`, background: vencida ? 'var(--red)' : 'var(--green)', borderRadius: 999 }}></div>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)'}}>
              <span>{Math.round((pagado / total) * 100)}% liquidado</span>
              <span>2 pagos registrados</span>
            </div>
          </div>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16}}>
          {/* LEFT: items + payment history */}
          <div style={{display: 'grid', gap: 16}}>
            {/* Items */}
            <div className="card">
              <div style={{padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div className="h3">Productos en crédito</div>
                <span style={{fontSize: 12, color: 'var(--muted)'}}>{n.items.length} artículos</span>
              </div>
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
                <thead>
                  <tr style={{color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                    <th style={{textAlign: 'left',  padding: '10px 20px', fontWeight: 600}}>Producto</th>
                    <th style={{textAlign: 'right', padding: '10px 12px', fontWeight: 600}}>Cant.</th>
                    <th style={{textAlign: 'right', padding: '10px 12px', fontWeight: 600}}>Precio</th>
                    <th style={{textAlign: 'right', padding: '10px 20px', fontWeight: 600}}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {n.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{padding: '14px 20px', borderTop: '1px solid var(--line-2)'}}>
                        <div style={{fontWeight: 600}}>{it.name}</div>
                        <div style={{fontSize: 11, color: 'var(--muted)'}}>{it.unit}</div>
                      </td>
                      <td style={{padding: '14px 12px', borderTop: '1px solid var(--line-2)', textAlign: 'right', fontWeight: 600}} className="num">{it.qty}</td>
                      <td style={{padding: '14px 12px', borderTop: '1px solid var(--line-2)', textAlign: 'right'}} className="num">{fmtMXN(it.price)}</td>
                      <td style={{padding: '14px 20px', borderTop: '1px solid var(--line-2)', textAlign: 'right', fontWeight: 700}} className="num">{fmtMXN(it.qty * it.price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan="4" style={{padding: 0, borderTop: '1px solid var(--line)'}}></td></tr>
                  <tr>
                    <td colSpan="3" style={{padding: '10px 20px', textAlign: 'right', color: 'var(--muted)'}}>Subtotal</td>
                    <td style={{padding: '10px 20px', textAlign: 'right'}} className="num">{fmtMXN(subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan="3" style={{padding: '6px 20px', textAlign: 'right', color: 'var(--muted)'}}>IVA (16%)</td>
                    <td style={{padding: '6px 20px', textAlign: 'right'}} className="num">{fmtMXN(iva)}</td>
                  </tr>
                  <tr style={{background: 'var(--surface-2)'}}>
                    <td colSpan="3" style={{padding: '12px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15}}>Total</td>
                    <td className="num" style={{padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: 18}}>{fmtMXN(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment history */}
            <div className="card">
              <div style={{padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div className="h3">Historial de pagos</div>
                <button className="btn btn-secondary" style={{height: 32, fontSize: 12}}><Icon name="plus" size={12} />Registrar pago</button>
              </div>
              <div style={{padding: '4px 20px 16px'}}>
                {n.pagos.map((p, i) => (
                  <div key={i} style={{display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < n.pagos.length - 1 ? '1px solid var(--line-2)' : 'none'}}>
                    <div style={{width: 38, height: 38, borderRadius: 10, background: 'var(--green-soft)', color: 'var(--green-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                      <Icon name="check" size={18} />
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: 600, fontSize: 14}}>{p.metodo}</div>
                      <div style={{fontSize: 12, color: 'var(--muted)'}}>
                        {new Date(p.fecha).toLocaleDateString('es-MX', {day: 'numeric', month: 'long', year: 'numeric'})}
                        {' · '}
                        <span className="mono">Folio {p.folio}</span>
                      </div>
                    </div>
                    <div className="num" style={{fontSize: 16, fontWeight: 700, color: 'var(--green-2)'}}>+{fmtMXN(p.monto)}</div>
                    <button className="btn-ghost" style={{padding: 6, borderRadius: 6, color: 'var(--muted)'}}><Icon name="printer" size={14} /></button>
                  </div>
                ))}
                {/* Pending row */}
                <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px dashed var(--line)', marginTop: 4}}>
                  <div style={{width: 38, height: 38, borderRadius: 10, background: 'var(--red-soft)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>
                    <Icon name="clock" size={18} />
                  </div>
                  <div style={{flex: 1}}>
                    <div style={{fontWeight: 600, fontSize: 14}}>Pago pendiente</div>
                    <div style={{fontSize: 12, color: 'var(--red)', fontWeight: 600}}>Vencido el {new Date(n.vence).toLocaleDateString('es-MX', {day: 'numeric', month: 'long'})}</div>
                  </div>
                  <div className="num" style={{fontSize: 16, fontWeight: 700, color: 'var(--red)'}}>{fmtMXN(saldo)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: client info + actions */}
          <div style={{display: 'grid', gap: 16, alignContent: 'start'}}>
            <div className="card" style={{padding: 18}}>
              <div className="h3" style={{marginBottom: 14}}>Cliente</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--line-2)'}}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: 'oklch(0.55 0.14 25)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flex: 'none',
                }}>{n.cliente.name.split(' ').slice(0, 2).map(s => s[0]).join('')}</div>
                <div style={{minWidth: 0}}>
                  <div style={{fontWeight: 700, fontSize: 14}}>{n.cliente.name}</div>
                  <div style={{fontSize: 12, color: 'var(--muted)', marginTop: 2}}>{n.cliente.rancho}</div>
                </div>
              </div>

              <div style={{display: 'grid', gap: 12, paddingTop: 14, fontSize: 13}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6}}><Icon name="phone" size={13} />Teléfono</span>
                  <span className="mono" style={{fontWeight: 600}}>{n.cliente.phone}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6}}><Icon name="file" size={13} />Cliente #</span>
                  <span className="mono" style={{fontWeight: 600}}>{n.cliente.id}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6}}><Icon name="credit" size={13} />Crédito utilizado</span>
                  <span className="num" style={{fontWeight: 600}}>{fmtMXN0(n.cliente.credito)} / {fmtMXN0(n.cliente.limite)}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6}}><Icon name="file" size={13} />Notas activas</span>
                  <span style={{fontWeight: 600}}>{n.cliente.notas}</span>
                </div>
              </div>

              <button className="btn btn-secondary btn-block" style={{marginTop: 16}} onClick={() => onNav('clientes')}>
                Ver perfil completo
                <Icon name="arrow-right" size={14} />
              </button>
            </div>

            {/* Actions */}
            <div className="card" style={{padding: 18}}>
              <div className="h3" style={{marginBottom: 14}}>Acciones</div>
              <div style={{display: 'grid', gap: 8}}>
                <button className="btn btn-primary btn-lg btn-block">
                  <Icon name="cash" size={18} />
                  Registrar Pago
                </button>
                <button className="btn btn-secondary btn-block" style={{height: 44}}>
                  <Icon name="printer" size={16} />
                  Imprimir Nota
                </button>
                <button className="btn btn-secondary btn-block" style={{height: 44}}>
                  <Icon name="mail" size={16} />
                  Enviar por Correo
                </button>
                <button className="btn btn-secondary btn-block" style={{height: 44}}>
                  <Icon name="phone" size={16} />
                  Llamar al cliente
                </button>
              </div>

              <div style={{marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)', display: 'flex', gap: 8, justifyContent: 'center'}}>
                <button style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Renegociar plazo</button>
                <span style={{color: 'var(--line)'}}>·</span>
                <button style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Marcar como incobrable</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

window.Credito = Credito;
