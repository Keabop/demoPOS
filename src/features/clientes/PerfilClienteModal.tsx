import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { getConfig } from '../../lib/configNegocio';
import type { Cliente } from '../../types';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';

interface PerfilClienteModalProps {
  isOpen: boolean;
  cliente: Cliente | null;
  onClose: () => void;
  onVerEstadoCuenta: () => void;
  onOpenAbono: (ventaId: string, folio: string, saldo: number) => void;
}

export const PerfilClienteModal: React.FC<PerfilClienteModalProps> = ({
  isOpen,
  cliente,
  onClose,
  onVerEstadoCuenta,
  onOpenAbono,
}) => {
  const [activeNotesCount, setActiveNotesCount] = useState<number>(0);
  const [activeNotes, setActiveNotes] = useState<{ id: string; folio: string; total: number; saldo: number }[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [lastVenta, setLastVenta] = useState<{ folio: string; fecha: string; total: number } | null>(null);

  const fetchClientDetails = async () => {
    if (!cliente) return;
    try {
      setLoadingNotes(true);

      // 1. Get all credit sales
      const { data: salesData, error: salesError } = await supabase
        .from('ventas')
        .select('id, folio, total')
        .eq('cliente_id', cliente.id)
        .eq('tipo_pago', 'credito');

      if (!salesError && salesData && salesData.length > 0) {
        const saleIds = salesData.map(s => s.id);
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('pagos_credito')
          .select('venta_id, monto')
          .in('venta_id', saleIds);
        
        if (!paymentsError) {
          const payments = paymentsData || [];
          const activeNotesList = salesData.map(s => {
            const salePayments = payments.filter(p => p.venta_id === s.id);
            const totalPaid = salePayments.reduce((sum, p) => sum + p.monto, 0);
            const remaining = Math.max(0, s.total - totalPaid);
            return {
              id: s.id,
              folio: s.folio,
              total: s.total,
              saldo: remaining
            };
          }).filter(n => n.saldo > 0);

          setActiveNotes(activeNotesList);
          setActiveNotesCount(activeNotesList.length);
        }
      } else {
        setActiveNotes([]);
        setActiveNotesCount(0);
      }

      // 2. Get last purchase (any payment type)
      const { data: lastVentaData, error: lastVentaError } = await supabase
        .from('ventas')
        .select('folio, fecha, total')
        .eq('cliente_id', cliente.id)
        .order('fecha', { ascending: false })
        .limit(1);

      if (!lastVentaError && lastVentaData && lastVentaData.length > 0) {
        setLastVenta({
          folio: lastVentaData[0].folio,
          fecha: lastVentaData[0].fecha,
          total: Number(lastVentaData[0].total)
        });
      } else {
        setLastVenta(null);
      }
    } catch (err) {
      console.error('Error fetching client details:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    if (isOpen && cliente) {
      fetchClientDetails();
    }
    // fetchClientDetails se define arriba; se omite de deps a propósito (patrón de carga al abrir).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cliente]);

  const handleAbonoClick = () => {
    if (activeNotes.length === 0) {
      toast.error('Este cliente no tiene notas a crédito pendientes de pago.');
    } else if (activeNotes.length === 1) {
      const singleNote = activeNotes[0];
      onOpenAbono(singleNote.id, singleNote.folio, singleNote.saldo);
    } else {
      toast.error('El cliente tiene múltiples notas activas. Por favor, seleccione la nota específica desde el Estado de Cuenta.');
      onVerEstadoCuenta();
    }
  };

  if (!isOpen || !cliente) return null;

  const getInitials = (n: string) => {
    return n.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  };


  const getAvatarBg = () => {
    return cliente.activo_para_credito ? 'oklch(0.4 0.05 145)' : 'oklch(0.55 0.14 25)';
  };

  const limite = Number(cliente.limite_credito || 0);
  const saldo = Number(cliente.saldo_deudor || 0);
  const disponible = Math.max(0, limite - saldo);
  const credUsedPct = limite > 0 ? Math.min(100, (saldo / limite) * 100) : 0;

  // Actions
  const handleWhatsApp = () => {
    if (cliente.telefono) {
      const cleaned = cliente.telefono.replace(/\D/g, '');
      const phone = cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
      const text = encodeURIComponent(`Hola ${cliente.nombre}, le escribimos de ${getConfig().nombre} para...`);
      window.open(`https://wa.me/52${phone}?text=${text}`, '_blank');
    } else {
      toast.error('Este cliente no tiene un número telefónico registrado.');
    }
  };

  return (
    <div className="perfil-overlay" onClick={onClose}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .perfil-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(3px);
          display: flex;
          justify-content: flex-end;
          z-index: 1500;
          animation: fadeIn 0.2s ease-out;
        }
        .perfil-drawer {
          background: var(--surface);
          border-left: 1px solid var(--line);
          width: 100%;
          max-width: 440px;
          height: 100%;
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .perfil-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid var(--line-2);
        }
        .perfil-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
          color: var(--ink);
        }
        .perfil-close-btn {
          color: var(--muted);
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.12s, color 0.12s;
          cursor: pointer;
        }
        .perfil-close-btn:hover {
          background: var(--line-2);
          color: var(--ink);
        }
        .perfil-body {
          padding: 24px;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .perfil-footer {
          padding: 16px 24px;
          background: var(--surface-2);
          border-top: 1px solid var(--line-2);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .perfil-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          padding: 4px 0;
        }
        .perfil-info-label {
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }
        .perfil-info-value {
          font-weight: 600;
          color: var(--ink);
        }
        .perfil-progress-container {
          background: var(--surface-2);
          border: 1px solid var(--line-2);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .perfil-progress-bar {
          height: 6px;
          background: var(--line-2);
          border-radius: 99px;
          overflow: hidden;
        }
        .perfil-progress-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.3s ease;
        }
      `}</style>

      <div className="perfil-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <h3 className="perfil-title">Información del Cliente</h3>
          <button className="perfil-close-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="perfil-body">
          {/* Main profile card header */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 20, borderBottom: '1px solid var(--line-2)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, background: getAvatarBg(), color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flex: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>{getInitials(cliente.nombre)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)', lineHeight: 1.2 }}>{cliente.nombre}</div>
              </div>
              {cliente.rancho && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="home" size={12} />
                  <span>Rancho: <strong>{cliente.rancho}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', background: cliente.activo_para_credito ? 'var(--green-soft)' : 'var(--red-soft)',
            borderRadius: 8, border: `1px solid ${cliente.activo_para_credito ? 'var(--green-line)' : 'oklch(0.58 0.16 25 / 0.1)'}`
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: cliente.activo_para_credito ? 'var(--green-2)' : 'var(--red)' }}>Estatus de Crédito:</span>
            <span className={`badge ${cliente.activo_para_credito ? 'green' : 'red'}`} style={{ fontSize: 11, fontWeight: 700 }}>
              <span className="dot"></span>
              {cliente.activo_para_credito ? 'Activo (Apto)' : 'Bloqueado (Moroso)'}
            </span>
          </div>

          {/* Contact Details Grid */}
          <div style={{ display: 'grid', gap: 12, padding: '4px 0' }}>
            <div className="perfil-info-row">
              <span className="perfil-info-label"><Icon name="phone" size={14} />Teléfono</span>
              <span className="perfil-info-value mono">
                {cliente.telefono || <span style={{ color: 'var(--muted-2)', fontWeight: 500 }}>Sin registrar</span>}
              </span>
            </div>
            <div className="perfil-info-row">
              <span className="perfil-info-label"><Icon name="file" size={14} />Código Cliente</span>
              <span className="perfil-info-value mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{cliente.id}</span>
            </div>
            <div className="perfil-info-row">
              <span className="perfil-info-label"><Icon name="clock" size={14} />Plazo de Crédito</span>
              <span className="perfil-info-value">{cliente.dias_credito || 30} días</span>
            </div>
            {lastVenta && (
              <div className="perfil-info-row">
                <span className="perfil-info-label"><Icon name="cart" size={14} />Última compra</span>
                <span className="perfil-info-value" style={{ fontSize: 12 }}>
                  {new Date(lastVenta.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ({lastVenta.folio})
                </span>
              </div>
            )}
          </div>

          {/* Credit Bar Panel */}
          <div className="perfil-progress-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Crédito Utilizado</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: saldo > 0 ? 'var(--red)' : 'var(--ink)' }}>
                  {fmtMXN(saldo)}
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}> / {fmtMXN(limite)}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Notas Activas</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
                  {loadingNotes ? '...' : activeNotesCount}
                </div>
              </div>
            </div>
            <div className="perfil-progress-bar">
              <div
                className="perfil-progress-fill"
                style={{
                  width: `${credUsedPct}%`,
                  backgroundColor: saldo > limite ? 'var(--red)' : (credUsedPct > 80 ? 'var(--amber)' : 'var(--green)')
                }}
              ></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
              <span>Crédito disponible: <strong>{fmtMXN(disponible)}</strong></span>
              <span className="num" style={{ fontWeight: 600 }}>{credUsedPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* Contact Action: solo WhatsApp (el teléfono ya se muestra arriba) */}
          {cliente.telefono && (
            <div style={{ marginTop: 4 }}>
              <button className="btn btn-secondary btn-block" style={{ height: 38, fontSize: 13, gap: 6, color: '#25D366' }} onClick={handleWhatsApp}>
                <Icon name="message" size={14} color="#25D366" />
                WhatsApp
              </button>
            </div>
          )}
        </div>

        <div className="perfil-footer">
          <button className="btn btn-primary btn-block" style={{ height: 44 }} onClick={onVerEstadoCuenta}>
            Ver Estado de Cuenta Completo
            <Icon name="arrow-right" size={16} />
          </button>
          
          {saldo > 0 && (
            <button
              className="btn btn-secondary btn-block"
              style={{ height: 44, borderColor: 'var(--green)', color: 'var(--green-2)', background: 'var(--green-soft)' }}
              onClick={handleAbonoClick} // Trigger abono click logic
            >
              <Icon name="plus" size={16} />
              Registrar Abono
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
