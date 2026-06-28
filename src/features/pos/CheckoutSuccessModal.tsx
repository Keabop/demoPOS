import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Producto } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { useConfig } from '../config/ConfigContext';
import { toast } from '../../lib/toast';

interface CheckoutSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  folio: string;
  subtotal: number;
  iva: number;
  total: number;
  vendedorNombre: string;
  clientName?: string | null;
  clientPhone?: string | null;
  cartItems: Array<Producto & { qty: number }>; // contains products with quantity
  onSendWhatsApp: (phone: string) => Promise<boolean>;
  metodoPago: string;
  efectivoRecibido?: number | null;
  cambio?: number | null;
}

interface CartItemWithQty extends Producto {
  qty: number;
}

export const CheckoutSuccessModal: React.FC<CheckoutSuccessModalProps> = ({
  isOpen,
  onClose,
  folio,
  subtotal,
  total,
  clientName,
  clientPhone,
  cartItems,
  onSendWhatsApp,
  metodoPago,
  efectivoRecibido = null,
  cambio = null,
}) => {
  const { config } = useConfig();
  const [phone, setPhone] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Pre-fill phone number and reset status when modal opens or client info changes
  useEffect(() => {
    if (isOpen) {
      const cleaned = clientPhone ? clientPhone.replace(/\D/g, '') : '';
      // If it contains a Mexican country code prefix (e.g. 52), extract the 10-digit subscriber number
      const formattedPhone = cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
      setPhone(formattedPhone);
      setSendStatus('idle');
    }
  }, [isOpen, clientPhone]);

  if (!isOpen) return null;

  const paymentLabels: Record<string, string> = {
    efectivo: 'EFECTIVO',
    tarjeta: 'TARJETA DE CRÉDITO',
    debito: 'TARJETA DE DÉBITO',
    transferencia: 'TRANSFERENCIA BANCARIA',
    credito: 'CRÉDITO'
  };
  const paymentLabel = paymentLabels[metodoPago] || metodoPago.toUpperCase();

  const handleSendWhatsApp = async () => {
    if (!phone) {
      toast.error('Por favor, ingresa un número de teléfono.');
      return;
    }

    const is10Digits = /^\d{10}$/.test(phone);
    if (!is10Digits) {
      toast.error('El número de WhatsApp debe tener exactamente 10 dígitos.');
      return;
    }

    setSendStatus('sending');
    try {
      const success = await onSendWhatsApp(phone);
      if (success) {
        setSendStatus('success');
      } else {
        setSendStatus('error');
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      setSendStatus('error');
    }
  };

  // Inline styles for high design quality and responsiveness
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '16px',
    animation: 'fadeIn 0.25s ease-out',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '20px',
    boxShadow: 'var(--shadow-lg)',
    width: '100%',
    maxWidth: '460px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    position: 'relative',
    animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  const iconWrapperStyle: React.CSSProperties = {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--ok-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--ok)',
    margin: '0 auto 8px auto',
    border: '1px solid var(--ok-line)',
    boxShadow: '0 8px 16px oklch(0.56 0.13 150 / 0.16)',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: '800',
    color: 'var(--ink)',
    margin: '0',
    letterSpacing: '-0.02em',
  };

  const summaryBoxStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface-2)',
    border: '1px solid var(--line-2)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '6px',
  };

  const whatsappInputGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  };

  const getWhatsAppButtonColor = () => {
    switch (sendStatus) {
      case 'success':
        return 'var(--ok)';
      case 'error':
        return 'var(--red)';
      default:
        return '#25D366'; // Official WhatsApp Green
    }
  };

  const getWhatsAppButtonText = () => {
    switch (sendStatus) {
      case 'sending':
        return 'Enviando...';
      case 'success':
        return 'Enviado';
      case 'error':
        return 'Reintentar';
      default:
        return 'Enviar por WhatsApp';
    }
  };

  return (
    <div style={overlayStyle}>
      {/* Styles for print-only rules, modal animations and custom scrollbars */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        
        @media screen {
          .print-only-ticket {
            display: none !important;
          }
        }
        
        @media print {
          /* Hide all body children except our print portal ticket */
          body > *:not(.print-only-ticket) {
            display: none !important;
          }
          html, body {
            background: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Show and format print ticket only */
          .print-only-ticket {
            display: block !important;
            position: relative !important;
            width: 80mm !important;
            max-width: 80mm !important;
            padding: 4mm !important;
            margin: 0 auto !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 12px !important;
            line-height: 1.3 !important;
            color: #000 !important;
            background: #fff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>

      {/* Screen Modal Card */}
      <div style={cardStyle}>
        {/* Close Button in corner */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Cerrar"
        >
          <Icon name="x" size={18} />
        </button>

        {/* Success Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={iconWrapperStyle}>
            <Icon name="check" size={32} strokeWidth={2.5} />
          </div>
          <h2 style={headerStyle}>¡Venta Realizada con Éxito!</h2>
        </div>

        {/* Details Box */}
        <div style={summaryBoxStyle}>
          <div style={summaryRowStyle}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Folio de Nota</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>{folio}</span>
          </div>
          <div style={summaryRowStyle}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Total Pagado</span>
            <span className="num" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ok-2)' }}>
              {fmtMXN(total)}
            </span>
          </div>
          {clientName && (
            <div style={summaryRowStyle}>
              <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Cliente</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{clientName}</span>
            </div>
          )}
        </div>

        {/* WhatsApp Send Form */}
        <div>
          <label style={labelStyle}>WhatsApp del Cliente</label>
          <div style={whatsappInputGroupStyle}>
            <input
              type="text"
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Número de WhatsApp (10 dígitos)"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleSendWhatsApp}
              disabled={sendStatus === 'sending'}
              className="btn"
              style={{
                backgroundColor: getWhatsAppButtonColor(),
                color: '#fff',
                fontWeight: 600,
                transition: 'all 0.2s',
                minWidth: '150px',
              }}
            >
              {sendStatus === 'success' && <Icon name="check" size={16} />}
              {sendStatus === 'error' && <Icon name="alert" size={16} />}
              {getWhatsAppButtonText()}
            </button>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' }} />

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => window.print()}
            className="btn btn-secondary"
            style={{ flex: 1, height: '48px', justifyContent: 'center' }}
          >
            <Icon name="printer" size={18} />
            Imprimir Ticket
          </button>
          
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ flex: 1, height: '48px', justifyContent: 'center' }}
          >
            Nueva Venta
          </button>
        </div>
      </div>

      {/* Ticket Container (Rendered outside #root using portal, visible only during printing) */}
      {createPortal(
        <div className="print-only-ticket">
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>{config.nombre}</h1>
            <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>{config.descripcion}</div>
            <div style={{ fontSize: '9px', marginTop: '4px' }}>{config.direccion}</div>
            <div style={{ fontSize: '9px' }}>{config.ciudad} - Tel: {config.telefono}</div>
          </div>

          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', marginBottom: '10px', fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>FOLIO: {folio}</span>
              <span>FECHA: {new Date().toLocaleString('es-MX', { hour12: false })}</span>
            </div>
            {clientName && <div>CLIENTE: {clientName.toUpperCase()}</div>}
            <div>FORMA DE PAGO: {paymentLabel}</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', paddingBottom: '4px', width: '45%' }}>PRODUCTO</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px', width: '20%' }}>CANT</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', width: '15%' }}>PRECIO</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', width: '20%' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map((item: CartItemWithQty, idx) => {
                const price = Number(item.precio_publico || 0);
                const qty = Number(item.qty || 0);
                const sub = price * qty;
                return (
                  <tr key={idx} style={{ verticalAlign: 'top' }}>
                    <td style={{ padding: '4px 0', wordBreak: 'break-word' }}>
                      {item.nombre}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 0' }}>
                      {qty} {item.unidad}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 0' }}>
                      {fmtMXN(price)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '4px 0' }}>
                      {fmtMXN(sub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span>SUBTOTAL:</span>
              <span>{fmtMXN(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid #000', paddingTop: '4px', marginTop: '4px' }}>
              <span>TOTAL:</span>
              <span>{fmtMXN(total)}</span>
            </div>
            {efectivoRecibido != null && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span>EFECTIVO RECIBIDO:</span>
                  <span>{fmtMXN(efectivoRecibido)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>CAMBIO:</span>
                  <span>{fmtMXN(Math.max(0, cambio ?? 0))}</span>
                </div>
              </>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '9px', borderTop: '1px solid #000', paddingTop: '8px' }}>
            <div>¡GRACIAS POR SU COMPRA!</div>
            <div style={{ marginTop: '2px' }}>CONSERVE ESTE TICKET PARA CUALQUIER ACLARACIÓN</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
