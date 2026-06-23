import React, { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from './AuthContext';
import { useConfig } from '../config/ConfigContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { config } = useConfig();

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await login(email, pass);
      if (!res.success) {
        setErrorMsg(res.error || 'Credenciales incorrectas');
      }
    } catch (err) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 980, display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 0, background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)' }}>

        {/* Left brand panel */}
        <div style={{ background: 'linear-gradient(160deg, #0f1714 0%, #1a2a23 100%)', color: '#fff', padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -120, top: -120, width: 380, height: 380, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.15)' }}></div>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.1)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
              <img src={config.logoUrl} alt={config.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>{config.nombre}</div>
              <div style={{ fontSize: 11, color: '#a4b3ad', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Punto de Venta</div>
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
            <span>Conectado a Supabase</span>
          </div>
        </div>

        {/* Right form panel */}
        <div style={{ padding: '44px 44px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Iniciar sesión</div>
          <h1 className="h1" style={{ marginTop: 6, marginBottom: 26 }}>Bienvenido de vuelta</h1>

          <form onSubmit={handleSubmit}>
            {errorMsg && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--red-soft)',
                border: '1.5px solid var(--red)',
                color: 'var(--red)',
                borderRadius: 10,
                marginBottom: 20,
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <Icon name="alert" size={16} color="var(--red)" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="label">Usuario / Correo</div>
            <input
              className="input input-lg"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{marginBottom: 14}}
              disabled={loading}
              required
            />

            <div className="label">
              <span>Contraseña</span>
            </div>
            <div style={{position: 'relative', marginBottom: 22}}>
              <input
                className="input input-lg"
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                style={{paddingRight: 44}}
                disabled={loading}
                required
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 8, color: 'var(--muted)', background: 'transparent', border: 0, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading ? 'Validando acceso...' : 'Entrar al sistema'}
              {!loading && <Icon name="arrow-right" size={18} />}
            </button>
          </form>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', display:'flex', justifyContent: 'space-between' }}>
            <span>© 2026 {config.nombre}</span>
            <span>Soporte: 462 270 1280</span>
          </div>
        </div>
      </div>
    </div>
  );
};
