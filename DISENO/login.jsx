// Login screen
const Login = ({ onLogin }) => {
  const [role, setRole] = useState('admin');
  const [user, setUser]   = useState('lucia.bermudez');
  const [pass, setPass]   = useState('••••••••');
  const [showPass, setShowPass] = useState(false);

  const roles = [
    { id: 'admin',    label: 'Administrador', desc: 'Acceso completo · reportes, inventario y caja', icon: 'shield' },
    { id: 'vendedor', label: 'Vendedor',      desc: 'Ventas, clientes y notas a crédito',           icon: 'cart' },
    { id: 'usuario',  label: 'Usuario',       desc: 'Sólo consulta de lista de precios',            icon: 'eye' },
  ];

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 980, display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 0, background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)' }}>

        {/* Left brand panel */}
        <div style={{ background: 'linear-gradient(160deg, #0f1714 0%, #1a2a23 100%)', color: '#fff', padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          {/* decorative ring */}
          <div style={{ position: 'absolute', right: -120, top: -120, width: 380, height: 380, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.15)' }}></div>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.1)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
              <Icon name="leaf" size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>AGROMAR</div>
              <div style={{ fontSize: 11, color: '#a4b3ad', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Punto de Venta · v3.2</div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'pretty' }}>
              Insumos agrícolas para el productor mexicano
            </div>
            <p style={{ marginTop: 14, color: '#a4b3ad', fontSize: 14, lineHeight: 1.55, maxWidth: 380 }}>
              Sistema integral de ventas, inventario y notas a crédito.
              Diseñado para mostradores rápidos y para el productor que paga al levantar la cosecha.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', fontSize: 12, color: '#7d8a83' }}>
            <div style={{display:'flex', alignItems:'center', gap: 6}}>
              <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--green)'}}></span>
              Servidor en línea
            </div>
            <span>·</span>
            <span>Última sincronización 14:24</span>
          </div>
        </div>

        {/* Right form panel */}
        <div style={{ padding: '44px 44px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Iniciar sesión</div>
          <h1 className="h1" style={{ marginTop: 6, marginBottom: 26 }}>Bienvenido de vuelta</h1>

          <div className="label">Tipo de usuario</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {roles.map(r => {
              const active = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                    border: `1.5px solid ${active ? 'var(--green)' : 'var(--line)'}`,
                    background: active ? 'var(--green-soft)' : 'var(--surface)',
                    borderRadius: 10, textAlign: 'left', transition: 'all 0.12s',
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: active ? 'var(--green)' : 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : 'var(--ink-2)', flex: 'none' }}>
                    <Icon name={r.icon} size={18} />
                  </div>
                  <div style={{flex: 1}}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${active ? 'var(--green)' : '#d4cebe'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--green)' }}></div>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="label">Usuario</div>
          <input className="input input-lg" value={user} onChange={e => setUser(e.target.value)} style={{marginBottom: 14}} />

          <div className="label" style={{display: 'flex', justifyContent: 'space-between'}}>
            <span>Contraseña</span>
            <a style={{ color: 'var(--green-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 600, cursor: 'pointer' }}>¿Olvidaste tu contraseña?</a>
          </div>
          <div style={{position: 'relative'}}>
            <input
              className="input input-lg"
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={e => setPass(e.target.value)}
              style={{paddingRight: 44}}
            />
            <button
              onClick={() => setShowPass(!showPass)}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 8, color: 'var(--muted)' }}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>

          <button className="btn btn-primary btn-lg btn-block" style={{marginTop: 22}} onClick={() => onLogin(role)}>
            Entrar al sistema
            <Icon name="arrow-right" size={18} />
          </button>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', display:'flex', justifyContent: 'space-between' }}>
            <span>© 2026 AGROMAR Insumos del Campo</span>
            <span>Soporte: 442 100 0000</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.Login = Login;
