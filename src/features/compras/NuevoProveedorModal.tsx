import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import type { Proveedor } from '../../types';

interface NuevoProveedorModalProps {
  isOpen: boolean;
  proveedor?: Proveedor | null;
  onClose: () => void;
  onSaved?: () => void;
}

export const NuevoProveedorModal: React.FC<NuevoProveedorModalProps> = ({
  isOpen,
  proveedor,
  onClose,
  onSaved,
}) => {
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [rfc, setRfc] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const esEdicion = !!proveedor;

  useEffect(() => {
    if (isOpen) {
      setNombre(proveedor?.nombre ?? '');
      setContacto(proveedor?.contacto ?? '');
      setTelefono(proveedor?.telefono ?? '');
      setEmail(proveedor?.email ?? '');
      setDireccion(proveedor?.direccion ?? '');
      setRfc(proveedor?.rfc ?? '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, proveedor]);

  if (!isOpen) return null;

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
      setErrorMsg('El nombre del proveedor es obligatorio.');
      return;
    }
    setLoading(true);
    try {
      const datos = {
        nombre: nombreLimpio,
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
        rfc: rfc.trim() || null,
      };
      if (esEdicion && proveedor) {
        const { error } = await supabase.from('proveedores').update(datos).eq('id', proveedor.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('proveedores').insert(datos);
        if (error) throw new Error(error.message);
      }
      setSuccessMsg(esEdicion ? 'Proveedor actualizado.' : 'Proveedor creado.');
      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar el proveedor.');
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
          position: fixed; inset: 0; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
          animation: modal-fade-in 0.2s ease-out;
        }
        .modal-card {
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow-lg); width: 100%; max-width: 480px;
          animation: modal-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; flex-direction: column; overflow: hidden; max-height: 92vh;
        }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line-2); }
        .modal-title { font-size: 17px; font-weight: 700; margin: 0; color: var(--ink); }
        .modal-close-btn { color: var(--muted); padding: 4px; border-radius: 6px; display: flex; transition: background 0.12s, color 0.12s; }
        .modal-close-btn:hover { background: var(--line-2); color: var(--ink); }
        .modal-body { padding: 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 22px; background: var(--surface-2); border-top: 1px solid var(--line-2); }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .error-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--red-soft); border: 1px solid oklch(0.85 0.1 25); border-radius: var(--radius-sm); color: var(--red); font-size: 13px; }
        .success-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--green-soft, oklch(0.95 0.05 150)); border: 1px solid oklch(0.8 0.12 150); border-radius: var(--radius-sm); color: var(--green, oklch(0.5 0.15 150)); font-size: 13px; }
        .spinner { animation: spin 0.8s linear infinite; }
      `}</style>

      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 className="modal-title">{esEdicion ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
            <button type="button" className="modal-close-btn" onClick={handleClose} disabled={loading}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <div className="modal-body">
            {errorMsg && <div className="error-banner"><Icon name="alert" size={16} /><span>{errorMsg}</span></div>}
            {successMsg && <div className="success-banner"><Icon name="check" size={16} /><span>{successMsg}</span></div>}

            <div className="form-group">
              <label className="label" htmlFor="prov-nombre">Nombre / Empresa *</label>
              <input id="prov-nombre" type="text" className="input" placeholder="Ej. VERSA"
                value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={loading} required autoFocus />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="prov-contacto">Persona de contacto</label>
              <input id="prov-contacto" type="text" className="input" value={contacto}
                onChange={(e) => setContacto(e.target.value)} disabled={loading} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="label" htmlFor="prov-tel">Teléfono</label>
                <input id="prov-tel" type="text" className="input" value={telefono}
                  onChange={(e) => setTelefono(e.target.value)} disabled={loading} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="prov-rfc">RFC</label>
                <input id="prov-rfc" type="text" className="input" value={rfc}
                  onChange={(e) => setRfc(e.target.value)} disabled={loading} />
              </div>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="prov-email">Email</label>
              <input id="prov-email" type="email" className="input" value={email}
                onChange={(e) => setEmail(e.target.value)} disabled={loading} autoComplete="off" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="prov-dir">Dirección</label>
              <input id="prov-dir" type="text" className="input" value={direccion}
                onChange={(e) => setDireccion(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              {successMsg ? 'Cerrar' : 'Cancelar'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {loading ? (
                <>
                  <svg className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  Guardando...
                </>
              ) : (esEdicion ? 'Guardar cambios' : 'Crear proveedor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
