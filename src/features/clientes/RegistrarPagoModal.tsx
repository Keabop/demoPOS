import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getConfig } from '../../lib/configNegocio';
import { Icon } from '../../components/Icon';

interface RegistrarPagoModalProps {
  isOpen: boolean;
  ventaId: string;
  folio: string;
  saldo: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const RegistrarPagoModal: React.FC<RegistrarPagoModalProps> = ({
  isOpen,
  ventaId,
  folio,
  saldo,
  onClose,
  onSuccess,
}) => {
  const [monto, setMonto] = useState<string>('');
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'debito'>('efectivo');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize/reset form state when modal opens or saldo changes
  useEffect(() => {
    if (isOpen) {
      setMonto(saldo.toString());
      setMetodo('efectivo');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, saldo]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('El monto a abonar debe ser mayor a 0.');
      return;
    }
    if (montoNum > saldo) {
      setError(`El monto a abonar no puede exceder el saldo pendiente ($${saldo.toFixed(2)}).`);
      return;
    }

    setLoading(true);
    try {
      // El servidor valida el tope de sobre-pago (FOR UPDATE) y genera el folio único.
      const { data: generatedFolio, error: rpcError } = await supabase.rpc('fn_registrar_abono', {
        p_venta_id: ventaId,
        p_monto: montoNum,
        p_metodo: metodo,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Error al registrar el pago.');
      }

      // Send webhook to n8n for abono notification
      try {
        const { data: vData } = await supabase
          .from('ventas')
          .select('folio, clientes(nombre, telefono, lada)')
          .eq('id', ventaId)
          .single();

        if (vData) {
          const clientInfo = Array.isArray(vData.clientes) ? vData.clientes[0] : (vData.clientes as { telefono?: string; nombre?: string; lada?: string });
          if (clientInfo && clientInfo.telefono) {
            const webhookUrl = import.meta.env.VITE_N8N_ABONOS_WEBHOOK_URL || 'http://localhost:5678/webhook/agromar-abonos';
            
            const formattedDateTime = new Date().toLocaleString('es-MX', { hour12: false });
            const paymentLabels: Record<string, string> = {
              efectivo: 'EFECTIVO',
              transferencia: 'TRANSFERENCIA BANCARIA',
              tarjeta: 'TARJETA DE CRÉDITO',
              debito: 'TARJETA DE DÉBITO'
            };
            const metodoLabel = paymentLabels[metodo] || metodo.toUpperCase();

            const text = `*${getConfig().nombre} - RECIBO DE ABONO*
----------------------------------
*Folio Pago:* ${generatedFolio}
*Remisión:* ${folio}
*Fecha:* ${formattedDateTime}
*Cliente:* ${clientInfo.nombre}
----------------------------------
*Abono registrado:* $${montoNum.toFixed(2)} MXN
*Método de pago:* ${metodoLabel}
*Saldo pendiente:* $${Math.max(0, saldo - montoNum).toFixed(2)} MXN
----------------------------------
¡Gracias por su pago!`;

            const controller = new AbortController();
            const tId = setTimeout(() => controller.abort(), 1200);
            
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
              body: JSON.stringify({
                phone: clientInfo.telefono,
                lada: clientInfo.lada || '52',
                text,
                abono: {
                  folio_pago: generatedFolio,
                  monto: montoNum,
                  metodo: metodo,
                  fecha: formattedDateTime
                },
                venta: {
                  folio: folio,
                  saldo_anterior: saldo,
                  nuevo_saldo: Math.max(0, saldo - montoNum)
                },
                cliente: {
                  nombre: clientInfo.nombre,
                  telefono: clientInfo.telefono
                }
              }),
              signal: controller.signal
            }).catch(e => console.warn('Abono Webhook failed', e));
            
            clearTimeout(tId);
          }
        }
      } catch (err) {
        console.warn('Error sending abono webhook:', err);
      }

      // Reset form inputs upon successful registration
      setMonto('');
      setMetodo('efectivo');
      setError(null);

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al registrar el pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="card" style={{
        width: '90%',
        maxWidth: 480,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h3" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="cash" size={22} color="var(--green)" />
            Registrar Pago / Abono
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              padding: 4,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{
              background: 'var(--red-soft)',
              color: 'var(--red)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid oklch(0.58 0.16 25 / 0.2)',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Read-only fields in grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span className="label">Folio Venta</span>
              <input
                className="input mono"
                type="text"
                value={folio}
                disabled
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--ink-2)',
                  cursor: 'not-allowed',
                  borderStyle: 'dashed'
                }}
              />
            </div>
            <div>
              <span className="label">Saldo Pendiente</span>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  fontWeight: 600,
                  fontSize: '14px'
                }}>$</span>
                <input
                  className="input num"
                  type="text"
                  value={saldo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  disabled
                  style={{
                    paddingLeft: 24,
                    background: 'var(--surface-2)',
                    color: 'var(--red)',
                    fontWeight: 600,
                    cursor: 'not-allowed',
                    borderStyle: 'dashed'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label htmlFor="monto-input" className="label">Monto a Abonar *</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                fontWeight: 600,
                fontSize: '14px'
              }}>$</span>
              <input
                id="monto-input"
                className="input num"
                type="number"
                step="any"
                required
                value={monto}
                onChange={e => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                max={saldo}
                disabled={loading}
                style={{
                  paddingLeft: 24,
                  fontWeight: 600,
                  fontSize: '15px'
                }}
              />
            </div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
              <span>Monto máximo: ${saldo.toFixed(2)}</span>
              <button
                type="button"
                onClick={() => setMonto(saldo.toString())}
                style={{
                  color: 'var(--green)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  fontSize: '11px'
                }}
                disabled={loading}
              >
                Liquidar Total
              </button>
            </div>
          </div>

          {/* Payment Method select */}
          <div>
            <label htmlFor="metodo-select" className="label">Método de Pago *</label>
            <select
              id="metodo-select"
              className="input"
              value={metodo}
              onChange={e => setMetodo(e.target.value as 'efectivo' | 'transferencia' | 'tarjeta' | 'debito')}
              disabled={loading}
              style={{
                background: 'var(--surface)',
                cursor: 'pointer'
              }}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta de Crédito</option>
              <option value="debito">Tarjeta de Débito</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Registrando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
