import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import type { Perfil } from '../../types';
import { REGLAS_PASSWORD, passwordCumple, generarPassword } from '../../lib/password';
import { extraerMensajeError } from '../../lib/funcionesError';

interface RestablecerPasswordModalProps {
  isOpen: boolean;
  usuario: Perfil | null;
  onClose: () => void;
  onDone?: () => void;
}

export const RestablecerPasswordModal: React.FC<RestablecerPasswordModalProps> = ({
  isOpen,
  usuario,
  onClose,
  onDone,
}) => {
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !usuario) return null;

  const reset = () => {
    setPassword('');
    setConfirmar('');
    setVer(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleGenerar = () => {
    const nueva = generarPassword();
    setPassword(nueva);
    setConfirmar(nueva);
    setVer(true);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!passwordCumple(password)) {
      setErrorMsg('La contraseña no cumple todos los requisitos.');
      return;
    }
    if (password !== confirmar) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('cambiar-password', {
        body: { userId: usuario.id, password },
      });
      if (error) throw new Error(await extraerMensajeError(error, 'No se pudo cambiar la contraseña.'));
      setSuccessMsg(`Contraseña de ${usuario.nombre} actualizada.`);
      setPassword('');
      setConfirmar('');
      onDone?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <style>{`
        @keyframes modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modal-scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .modal-overlay { position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: modal-fade-in 0.2s ease-out; }
        .modal-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-lg); width: 100%; max-width: 460px; animation: modal-scale-in 0.2s cubic-bezier(0.16,1,0.3,1); display: flex; flex-direction: column; overflow: hidden; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--line-2); }
        .modal-title { font-size: 18px; font-weight: 700; margin: 0; color: var(--ink); }
        .modal-close-btn { color: var(--muted); padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; background: var(--surface-2); border-top: 1px solid var(--line-2); }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .pw-reqs { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .pw-req { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
        .pw-req.ok { color: var(--green, oklch(0.5 0.15 150)); }
        .pw-req-dot { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
        .error-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25); border-radius: var(--radius-sm); color: var(--red); font-size: 13px; }
        .success-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--green-soft, oklch(0.95 0.05 150)); border: 1px solid oklch(0.8 0.12 150); border-radius: var(--radius-sm); color: var(--green, oklch(0.5 0.15 150)); font-size: 13px; }
        .field-hint { font-size: 12px; color: var(--muted); }
        .pw-input-row { display: flex; gap: 8px; align-items: center; }
      `}</style>

      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 className="modal-title">Restablecer contraseña</h3>
            <button type="button" className="modal-close-btn" onClick={handleClose} disabled={loading}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <div className="modal-body">
            {errorMsg && (
              <div className="error-banner"><Icon name="alert" size={16} /><span>{errorMsg}</span></div>
            )}
            {successMsg && (
              <div className="success-banner"><Icon name="check" size={16} /><span>{successMsg}</span></div>
            )}

            <div className="form-group">
              <label className="label">Usuario</label>
              <input className="input" value={`${usuario.nombre} · ${usuario.email}`} disabled readOnly />
              <span className="field-hint">Define una contraseña temporal y comunícasela; podrá cambiarla desde su perfil.</span>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="reset-pw">Nueva contraseña</label>
              <div className="pw-input-row">
                <input
                  id="reset-pw"
                  type={ver ? 'text' : 'password'}
                  className="input"
                  style={{ flex: 1 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button type="button" className="btn btn-secondary" onClick={() => setVer((v) => !v)} disabled={loading} title={ver ? 'Ocultar' : 'Mostrar'}>
                  <Icon name="eye" size={16} />
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleGenerar} disabled={loading}>
                  Generar
                </button>
              </div>
              <ul className="pw-reqs">
                {REGLAS_PASSWORD.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.label} className={`pw-req ${ok ? 'ok' : ''}`}>
                      <span className="pw-req-dot"><Icon name={ok ? 'check' : 'x'} size={12} /></span>
                      {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="reset-pw2">Confirmar contraseña</label>
              <input
                id="reset-pw2"
                type={ver ? 'text' : 'password'}
                className="input"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              {successMsg ? 'Cerrar' : 'Cancelar'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !passwordCumple(password)} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {loading ? 'Guardando...' : 'Restablecer contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
