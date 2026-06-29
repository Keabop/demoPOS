import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { NumberInput } from '../../components/NumberInput';

interface PagoProveedorModalProps {
  isOpen: boolean;
  ordenId: string | null;
  folio?: string;
  proveedorNombre?: string;
  saldo: number;            // saldo por pagar actual
  onClose: () => void;
  onSaved?: () => void;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

const METODOS: { id: string; label: string }[] = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'debito', label: 'Débito' },
];

export const PagoProveedorModal: React.FC<PagoProveedorModalProps> = ({ isOpen, ordenId, folio, proveedorNombre, saldo, onClose, onSaved }) => {
  const [monto, setMonto] = useState(0);
  const [metodo, setMetodo] = useState('transferencia');
  const [fecha, setFecha] = useState(hoyISO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) { setMonto(0); setMetodo('transferencia'); setFecha(hoyISO()); setError(null); }
  }, [isOpen]);

  if (!isOpen || !ordenId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (monto <= 0) { setError('El monto debe ser mayor a 0.'); return; }
    if (monto > saldo) { setError(`El pago no puede exceder el saldo por pagar (${fmtMXN(saldo)}).`); return; }
    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('fn_registrar_pago_proveedor', {
        p_orden_id: ordenId,
        p_monto: monto,
        p_metodo: metodo,
        p_fecha: new Date(fecha + 'T12:00:00').toISOString(),
      });
      if (rpcError) throw new Error(rpcError.message);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--line-2)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Registrar pago a proveedor</h3>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {proveedorNombre ? `${proveedorNombre} · ` : ''}{folio ? `Compra ${folio}` : ''}
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => !loading && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>

          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--red-soft)', border: '1px solid oklch(0.85 0.1 25)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontSize: 13 }}>
                <Icon name="alert" size={16} /><span>{error}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Saldo por pagar</span>
              <span className="num" style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtMXN(saldo)}</span>
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="label">Monto del pago *</label>
              <NumberInput className="input num" value={monto} onChange={(n) => setMonto(n)} disabled={loading} autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Método</label>
                <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)} disabled={loading}>
                  {METODOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Fecha</label>
                <input type="date" className="input" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} disabled={loading} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 22px', background: 'var(--surface-2)', borderTop: '1px solid var(--line-2)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => !loading && onClose()} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando…' : 'Registrar pago'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
