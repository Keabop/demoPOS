import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';

interface CrearUsuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type Rol = 'admin' | 'vendedor' | 'visitante';

const ROLES: { value: Rol; label: string }[] = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'visitante', label: 'Visitante' },
  { value: 'admin', label: 'Administrador' },
];

// Requisitos de contraseña (deben coincidir con la validación de la Edge Function
// `crear-usuario` y con la política configurada en Supabase Auth).
const REGLAS_PASSWORD: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'Mínimo 8 caracteres', test: (pw) => pw.length >= 8 },
  { label: 'Una letra mayúscula (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Una letra minúscula (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Un número (0-9)', test: (pw) => /[0-9]/.test(pw) },
];

const passwordCumple = (pw: string): boolean => REGLAS_PASSWORD.every((r) => r.test(pw));

// Forma de la respuesta de error que puede traer functions.invoke.
interface ContextConJson {
  json: () => Promise<unknown>;
}

function tieneContextJson(value: unknown): value is { context: ContextConJson } {
  if (typeof value !== 'object' || value === null) return false;
  const ctx = (value as { context?: unknown }).context;
  return (
    typeof ctx === 'object' &&
    ctx !== null &&
    typeof (ctx as { json?: unknown }).json === 'function'
  );
}

// Intenta extraer el mensaje de error legible de un FunctionsHttpError.
async function extraerMensajeError(error: unknown): Promise<string> {
  if (tieneContextJson(error)) {
    try {
      const cuerpo = await error.context.json();
      if (
        typeof cuerpo === 'object' &&
        cuerpo !== null &&
        typeof (cuerpo as { error?: unknown }).error === 'string'
      ) {
        return (cuerpo as { error: string }).error;
      }
    } catch {
      // Ignorar y caer al mensaje genérico de abajo.
    }
  }
  if (error instanceof Error) return error.message;
  return 'Error al crear el usuario.';
}

export const CrearUsuarioModal: React.FC<CrearUsuarioModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('vendedor');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setNombre('');
    setEmail('');
    setPassword('');
    setRol('vendedor');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const nombreLimpio = nombre.trim();
    const emailLimpio = email.trim();

    if (!nombreLimpio) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      setErrorMsg('Introduce un email válido.');
      return;
    }
    if (!passwordCumple(password)) {
      setErrorMsg('La contraseña no cumple todos los requisitos.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke('crear-usuario', {
        body: {
          nombre: nombreLimpio,
          email: emailLimpio,
          password,
          rol,
        },
      });

      if (error) {
        const mensaje = await extraerMensajeError(error);
        throw new Error(mensaje);
      }

      setSuccessMsg('Usuario creado correctamente.');
      setNombre('');
      setEmail('');
      setPassword('');
      setRol('vendedor');
      onCreated?.();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error al crear el usuario.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <style>{`
        @keyframes modal-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: modal-fade-in 0.2s ease-out;
        }
        .modal-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          box-shadow: var(--shadow-lg);
          width: 100%;
          max-width: 500px;
          animation: modal-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--line-2);
        }
        .modal-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          color: var(--ink);
        }
        .modal-close-btn {
          color: var(--muted);
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        .modal-close-btn:hover {
          background: var(--line-2);
          color: var(--ink);
        }
        .modal-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          background: var(--surface-2);
          border-top: 1px solid var(--line-2);
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pw-reqs {
          list-style: none;
          margin: 8px 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pw-req {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
          transition: color 0.12s;
        }
        .pw-req.ok {
          color: var(--ok-2);
        }
        .pw-req-dot {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: none;
        }
        .error-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--red-soft);
          border: 1px solid oklch(0.85 0.1 25);
          border-radius: var(--radius-sm);
          color: var(--red);
          font-size: 13px;
        }
        .success-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--ok-soft);
          border: 1px solid var(--ok-line);
          border-radius: var(--radius-sm);
          color: var(--ok-2);
          font-size: 13px;
        }
        .spinner {
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 className="modal-title">Crear Usuario</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={handleClose}
              disabled={loading}
            >
              <Icon name="x" size={20} />
            </button>
          </div>

          <div className="modal-body">
            {errorMsg && (
              <div className="error-banner">
                <Icon name="alert" size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="success-banner">
                <Icon name="check" size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="form-group">
              <label className="label" htmlFor="user-name">Nombre *</label>
              <input
                id="user-name"
                type="text"
                className="input"
                placeholder="Nombre completo del usuario"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="user-email">Email *</label>
              <input
                id="user-email"
                type="email"
                className="input"
                placeholder="usuario@agromar.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="user-password">Contraseña *</label>
              <input
                id="user-password"
                type="password"
                className="input"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <ul className="pw-reqs">
                {REGLAS_PASSWORD.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.label} className={`pw-req ${ok ? 'ok' : ''}`}>
                      <span className="pw-req-dot">
                        <Icon name={ok ? 'check' : 'x'} size={12} />
                      </span>
                      {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="user-rol">Rol *</label>
              <select
                id="user-rol"
                className="input"
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
                disabled={loading}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              {successMsg ? 'Cerrar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !passwordCumple(password)}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              {loading ? (
                <>
                  <svg
                    className="spinner"
                    style={{ width: '16px', height: '16px', marginRight: '8px' }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  Creando...
                </>
              ) : (
                'Crear Usuario'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
