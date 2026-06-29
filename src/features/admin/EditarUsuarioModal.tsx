import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import type { Perfil } from '../../types';
import { PermisosEditor, type PerfilForm } from './PermisosEditor';
import { permisosCompletos, permisosDePlantilla, derivarRol } from '../../lib/capacidades';

interface EditarUsuarioModalProps {
  isOpen: boolean;
  usuario: Perfil | null;
  /** Si es true, no se puede cambiar el propio perfil/capa (p.ej. el admin no puede degradarse a sí mismo). */
  bloquearRol?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const EditarUsuarioModal: React.FC<EditarUsuarioModalProps> = ({
  isOpen,
  usuario,
  bloquearRol = false,
  onClose,
  onSaved,
}) => {
  const [nombre, setNombre] = useState('');
  const [perfil, setPerfil] = useState<PerfilForm>({ plantilla: 'personalizado', etiqueta: '', permisos: { ...permisosDePlantilla('vendedor')!.permisos } });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sincronizar el formulario con el usuario seleccionado cada vez que cambia.
  useEffect(() => {
    if (usuario) {
      setNombre(usuario.nombre);
      setPerfil({
        plantilla: usuario.plantilla || 'personalizado',
        etiqueta: usuario.etiqueta || '',
        permisos: permisosCompletos(usuario.permisos, usuario.rol),
      });
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [usuario]);

  if (!isOpen || !usuario) return null;

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      // Solo nombre y rol viven en public.perfiles y son editables desde el cliente
      // (la RLS `perfiles_update_admin` lo permite al admin). El rol solo se envía
      // si no está bloqueado, para no degradar al propio administrador.
      const cambios: { nombre: string; etiqueta: string; plantilla: string; permisos: PerfilForm['permisos']; rol?: string } = {
        nombre: nombreLimpio,
        etiqueta: perfil.etiqueta.trim() || 'Usuario',
        plantilla: perfil.plantilla,
        permisos: perfil.permisos,
      };
      if (!bloquearRol) cambios.rol = derivarRol(perfil);

      const { error } = await supabase
        .from('perfiles')
        .update(cambios)
        .eq('id', usuario.id);

      if (error) throw new Error(error.message);

      setSuccessMsg('Cambios guardados.');
      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <style>{`
        @keyframes modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modal-scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .modal-overlay {
          position: fixed; inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 20px;
          animation: modal-fade-in 0.2s ease-out;
        }
        .modal-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius); box-shadow: var(--shadow-lg);
          width: 100%; max-width: 460px;
          animation: modal-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; border-bottom: 1px solid var(--line-2);
        }
        .modal-title { font-size: 18px; font-weight: 700; margin: 0; color: var(--ink); }
        .modal-close-btn {
          color: var(--muted); padding: 4px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        .modal-close-btn:hover { background: var(--line-2); color: var(--ink); }
        .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .modal-footer {
          display: flex; justify-content: flex-end; gap: 12px;
          padding: 16px 24px; background: var(--surface-2); border-top: 1px solid var(--line-2);
        }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .error-banner {
          display: flex; align-items: center; gap: 10px; padding: 12px 16px;
          background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25);
          border-radius: var(--radius-sm); color: var(--red); font-size: 13px;
        }
        .success-banner {
          display: flex; align-items: center; gap: 10px; padding: 12px 16px;
          background: var(--green-soft, oklch(0.95 0.05 150)); border: 1px solid oklch(0.8 0.12 150);
          border-radius: var(--radius-sm); color: var(--green, oklch(0.5 0.15 150)); font-size: 13px;
        }
        .field-hint { font-size: 12px; color: var(--muted); }
        .spinner { animation: spin 0.8s linear infinite; }
      `}</style>

      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 className="modal-title">Editar Usuario</h3>
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
              <label className="label" htmlFor="edit-email">Email</label>
              <input id="edit-email" type="email" className="input" value={usuario.email} disabled readOnly />
              <span className="field-hint">El email y la contraseña no se editan aquí (requieren reenvío seguro).</span>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="edit-nombre">Nombre *</label>
              <input
                id="edit-nombre"
                type="text"
                className="input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <PermisosEditor value={perfil} onChange={setPerfil} disabled={loading || bloquearRol} />
            {bloquearRol && (
              <span className="field-hint">No puedes cambiar tu propio perfil/capa mientras estás conectado.</span>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              {successMsg ? 'Cerrar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              {loading ? (
                <>
                  <svg className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
