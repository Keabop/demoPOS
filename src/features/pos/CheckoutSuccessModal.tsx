import React, { useState, useEffect } from 'react';
import type { Producto } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { useConfig } from '../config/ConfigContext';
import { toast } from '../../lib/toast';
import { TicketTermico } from './TicketTermico';
import { ticketDesdeVentaNueva, ticketHTML } from './ticketModel';
import { imprimirTicket } from '../../lib/printing/qz';

interface CheckoutSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  folio: string;
  subtotal: number;
  iva: number;
  ieps?: number;
  total: number;
  vendedorNombre: string;
  clientName?: string | null;
  clientPhone?: string | null;
  clientNumero?: number | null;
  cartItems: Array<Producto & { qty: number; precioVendido?: number }>; // contains products with quantity
  onSendWhatsApp: (phone: string) => Promise<boolean>;
  metodoPago: string;
  efectivoRecibido?: number | null;
  cambio?: number | null;
  esCredito?: boolean;
  onImprimirPagare?: (modo: 'descargar' | 'imprimir') => void;
}

export const CheckoutSuccessModal: React.FC<CheckoutSuccessModalProps> = ({
  isOpen,
  onClose,
  folio,
  subtotal,
  ieps = 0,
  total,
  vendedorNombre,
  clientName,
  clientPhone,
  clientNumero = null,
  cartItems,
  onSendWhatsApp,
  metodoPago,
  efectivoRecibido = null,
  cambio = null,
  esCredito = false,
  onImprimirPagare,
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

  const ticketData = ticketDesdeVentaNueva(
    {
      folio,
      clientName: clientName ?? null,
      clientNumero: clientNumero ?? null,
      cartItems: cartItems.map((it) => ({
        qty: Number(it.qty),
        nombre: it.nombre,
        precioVendido: Number(it.precioVendido ?? it.precio_publico ?? 0),
      })),
      subtotal,
      ieps,
      total,
      metodoPago,
      efectivoRecibido,
      cambio,
    },
    vendedorNombre,
    new Date().toLocaleString('es-MX', { hour12: false }),
  );

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
    backgroundColor: 'var(--green-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--green)',
    margin: '0 auto 8px auto',
    border: '1px solid var(--green-line)',
    boxShadow: '0 8px 16px rgba(oklch(0.58 0.13 145 / 0.08))',
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
        return 'var(--green)';
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
      `}</style>

      {/* Screen Modal Card */}
      <div role="dialog" aria-modal="true" style={cardStyle}>
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
          <h2 style={headerStyle}>{esCredito ? 'Venta a Crédito Registrada' : '¡Venta Realizada con Éxito!'}</h2>
        </div>

        {/* Details Box */}
        <div style={summaryBoxStyle}>
          <div style={summaryRowStyle}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Folio de Nota</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>{folio}</span>
          </div>
          <div style={summaryRowStyle}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Total Pagado</span>
            <span className="num" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--green-2)' }}>
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
          {esCredito ? (
            <>
              <button
                onClick={() => onImprimirPagare?.('descargar')}
                className="btn btn-secondary"
                style={{ flex: 1, height: '48px', justifyContent: 'center' }}
              >
                <Icon name="file" size={18} />
                Descargar pagaré
              </button>
              <button
                onClick={() => onImprimirPagare?.('imprimir')}
                className="btn btn-primary"
                style={{ flex: 1, height: '48px', justifyContent: 'center' }}
              >
                <Icon name="printer" size={18} />
                Imprimir pagaré
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { void imprimirTicket(ticketHTML(ticketData, config.anchoTicket), config.anchoTicket, () => window.print()); }}
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
            </>
          )}
        </div>
      </div>

      {/* Ticket de respaldo (window.print); QZ usa el mismo ticketHTML */}
      <TicketTermico data={ticketData} anchoMm={config.anchoTicket} />
    </div>
  );
};
