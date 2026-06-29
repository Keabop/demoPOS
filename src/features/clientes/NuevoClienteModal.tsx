import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';

interface NuevoClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const NuevoClienteModal: React.FC<NuevoClienteModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [nombre, setNombre] = useState('');
  const [rancho, setRancho] = useState('');
  const [telefono, setTelefono] = useState('');
  const [lada, setLada] = useState('52');
  const [limite, setLimite] = useState('0.00');
  const [diasCredito, setDiasCredito] = useState('30');
  const [nivelPrecio, setNivelPrecio] = useState<'contado' | 'credito' | 'subdistribuidor'>('contado');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setNombre('');
    setRancho('');
    setTelefono('');
    setLada('52');
    setLimite('0.00');
    setDiasCredito('30');
    setNivelPrecio('contado');
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from('clientes')
        .insert([{ 
          nombre: nombre.trim(), 
          rancho: rancho.trim() || null, 
          telefono: telefono.trim() || null,
          lada,
          limite_credito: Number(limite) || 0.00,
          dias_credito: Number(diasCredito) || 30,
          nivel_precio: nivelPrecio,
          saldo_deudor: 0.00,
          activo_para_credito: true
        }]);

      if (error) {
        throw error;
      }

      onSave();
      handleClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar el cliente.');
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
        .spinner {
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 className="modal-title">Nuevo Cliente</h3>
            <button type="button" className="modal-close-btn" onClick={handleClose}>
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

            <div className="form-group">
              <label className="label" htmlFor="client-name">Nombre *</label>
              <input
                id="client-name"
                type="text"
                className="input"
                placeholder="Nombre completo o razón social"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="client-rancho">Rancho / Predio</label>
              <input
                id="client-rancho"
                type="text"
                className="input"
                placeholder="Nombre del rancho (opcional)"
                value={rancho}
                onChange={(e) => setRancho(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="client-phone">Teléfono</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="input"
                  style={{ width: 120, flex: 'none' }}
                  value={lada}
                  onChange={(e) => setLada(e.target.value)}
                  disabled={loading}
                  aria-label="Código de país"
                >
                  <option value="52">🇲🇽 +52</option>
                  <option value="1">🇺🇸 +1</option>
                </select>
                <input
                  id="client-phone"
                  type="tel"
                  className="input"
                  placeholder="Ej. 33 1234 5678 (opcional)"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="client-credit-limit">Límite de Crédito ($)</label>
              <input
                id="client-credit-limit"
                type="number"
                step="0.01"
                min="0"
                className="input"
                placeholder="0.00"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="client-credit-days">Plazo de Crédito Predeterminado (Días)</label>
              <input
                id="client-credit-days"
                type="number"
                min="0"
                className="input"
                placeholder="30"
                value={diasCredito}
                onChange={(e) => setDiasCredito(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="client-price-level">Nivel de precio</label>
              <select
                id="client-price-level"
                className="input"
                value={nivelPrecio}
                onChange={(e) => setNivelPrecio(e.target.value as 'contado' | 'credito' | 'subdistribuidor')}
                disabled={loading}
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
                <option value="subdistribuidor">Subdistribuidor</option>
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
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
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
                  Guardando...
                </>
              ) : (
                'Guardar Cliente'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
