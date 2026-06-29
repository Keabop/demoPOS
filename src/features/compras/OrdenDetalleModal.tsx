import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { exportarOrdenCompraPDF } from '../../lib/pdf/ordenCompraPDF';
import type { OrdenCompra, OrdenCompraDetalle, EstadoOrden } from '../../types';

interface OrdenDetalleModalProps {
  isOpen: boolean;
  ordenId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

const ESTADO_BADGE: Record<EstadoOrden, { bg: string; fg: string; label: string }> = {
  borrador: { bg: 'var(--surface-2)', fg: 'var(--ink-2)', label: 'Borrador' },
  enviada: { bg: 'var(--amber-soft)', fg: 'oklch(0.5 0.12 70)', label: 'Enviada' },
  recibida: { bg: 'var(--green-soft, oklch(0.95 0.04 145))', fg: 'var(--green-2)', label: 'Recibida' },
  cancelada: { bg: 'var(--red-soft)', fg: 'var(--red)', label: 'Cancelada' },
};

interface OrdenConProveedor extends OrdenCompra {
  proveedores: { nombre: string; direccion?: string; contacto?: string; telefono?: string } | null;
}

export const OrdenDetalleModal: React.FC<OrdenDetalleModalProps> = ({ isOpen, ordenId, onClose, onChanged }) => {
  const [orden, setOrden] = useState<OrdenConProveedor | null>(null);
  const [detalles, setDetalles] = useState<OrdenCompraDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRecibir, setConfirmRecibir] = useState(false);

  const cargar = useCallback(async () => {
    if (!ordenId) return;
    setLoading(true);
    setActionError(null);
    const { data: ord } = await supabase
      .from('ordenes_compra')
      .select('*, proveedores(nombre, direccion, contacto, telefono)')
      .eq('id', ordenId)
      .single();
    const { data: dets } = await supabase
      .from('ordenes_compra_detalles')
      .select('*')
      .eq('orden_id', ordenId);
    setOrden((ord as OrdenConProveedor) ?? null);
    setDetalles((dets as OrdenCompraDetalle[]) ?? []);
    setLoading(false);
  }, [ordenId]);

  useEffect(() => {
    if (isOpen && ordenId) cargar();
  }, [isOpen, ordenId, cargar]);

  if (!isOpen || !ordenId) return null;

  const cambiarEstado = async (estado: EstadoOrden) => {
    setActionLoading(true);
    setActionError(null);
    const { error } = await supabase.from('ordenes_compra').update({ estado }).eq('id', ordenId);
    setActionLoading(false);
    if (error) { setActionError(error.message); return; }
    await cargar();
    onChanged?.();
  };

  const recibir = async () => {
    setActionLoading(true);
    setActionError(null);
    const { error } = await supabase.rpc('fn_recibir_orden_compra', { p_orden_id: ordenId });
    setActionLoading(false);
    setConfirmRecibir(false);
    if (error) { setActionError(error.message); return; }
    await cargar();
    onChanged?.();
  };

  const descargarPDF = async (modo: 'descargar' | 'imprimir' = 'descargar') => {
    if (!orden) return;
    await exportarOrdenCompraPDF({
      folio: orden.folio,
      fecha: orden.fecha ? new Date(orden.fecha).toLocaleDateString('es-MX') : '',
      proveedor: {
        nombre: orden.proveedores?.nombre ?? '—',
        direccion: orden.proveedores?.direccion,
        contacto: orden.proveedores?.contacto,
        telefono: orden.proveedores?.telefono,
      },
      partidas: detalles.map((d) => ({
        descripcion: d.descripcion ?? '',
        cantidad: d.cantidad,
        presentacion: d.presentacion ?? '',
        precioUnitario: d.precio_unitario,
        total: d.subtotal,
      })),
      subtotal: orden.subtotal,
      iva: orden.iva,
      tasaIva: orden.tasa_iva,
      total: orden.total,
      instrucciones: orden.instrucciones,
    }, modo);
  };

  const estado = orden?.estado ?? 'borrador';
  const badge = ESTADO_BADGE[estado];

  return (
    <div className="modal-overlay" onClick={() => !actionLoading && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--line-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h3 className="mono" style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orden?.folio ?? 'Orden'}</h3>
            <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: badge.bg, color: badge.fg }}>{badge.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            {!loading && orden && (
              <>
                <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', fontSize: 13 }}
                  onClick={() => descargarPDF('descargar')} title="Descargar orden de compra en PDF">
                  <Icon name="download" size={14} />PDF
                </button>
                <button className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', fontSize: 13 }}
                  onClick={() => descargarPDF('imprimir')} title="Imprimir orden de compra">
                  <Icon name="printer" size={14} />Imprimir
                </button>
              </>
            )}
            <button className="modal-close-btn" onClick={() => !actionLoading && onClose()} style={{ color: 'var(--muted)', padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Cargando orden...</div>
          ) : !orden ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--red)' }}>No se encontró la orden.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--ink-2)' }}>
                <div><span style={{ color: 'var(--muted)' }}>Proveedor: </span><strong>{orden.proveedores?.nombre ?? '—'}</strong></div>
                {orden.fecha && <div><span style={{ color: 'var(--muted)' }}>Fecha: </span>{new Date(orden.fecha).toLocaleDateString('es-MX')}</div>}
                {orden.fecha_recepcion && <div><span style={{ color: 'var(--muted)' }}>Recibida: </span>{new Date(orden.fecha_recepcion).toLocaleDateString('es-MX')}</div>}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>Producto</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>Cant.</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>Costo</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map((d) => (
                      <tr key={d.id}>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--line-2)' }}>
                          <div style={{ fontWeight: 600 }}>{d.descripcion}</div>
                          {d.presentacion && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.presentacion}</div>}
                        </td>
                        <td className="num" style={{ padding: '10px', borderBottom: '1px solid var(--line-2)', textAlign: 'right' }}>{d.cantidad}</td>
                        <td className="num" style={{ padding: '10px', borderBottom: '1px solid var(--line-2)', textAlign: 'right' }}>{fmtMXN(d.precio_unitario)}</td>
                        <td className="num" style={{ padding: '10px', borderBottom: '1px solid var(--line-2)', textAlign: 'right', fontWeight: 700 }}>{fmtMXN(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div className="num" style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
                  <div>Subtotal: {fmtMXN(orden.subtotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>Total: {fmtMXN(orden.total)}</div>
                </div>
              </div>

              {orden.instrucciones && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}><strong>Instrucciones:</strong> {orden.instrucciones}</div>
              )}

              {actionError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--red-soft)', border: '1px solid oklch(0.85 0.1 25)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontSize: 13 }}>
                  <Icon name="alert" size={16} /><span>{actionError}</span>
                </div>
              )}

              {confirmRecibir && (
                <div style={{ padding: 16, background: 'var(--green-soft, oklch(0.95 0.04 145))', border: '1px solid var(--green-line)', borderRadius: 'var(--radius-sm)' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>
                    Al recibir, cada producto entrará al inventario con su costo y el stock se actualizará. Esta acción no se puede deshacer.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setConfirmRecibir(false)} disabled={actionLoading}>Cancelar</button>
                    <button className="btn btn-primary" onClick={recibir} disabled={actionLoading}>{actionLoading ? 'Recibiendo...' : 'Sí, recibir'}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && orden && estado !== 'recibida' && estado !== 'cancelada' && !confirmRecibir && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 22px', background: 'var(--surface-2)', borderTop: '1px solid var(--line-2)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => cambiarEstado('cancelada')} disabled={actionLoading}>
              Cancelar orden
            </button>
            {estado === 'borrador' && (
              <button className="btn btn-secondary" onClick={() => cambiarEstado('enviada')} disabled={actionLoading}>
                <Icon name="check" size={16} />Marcar enviada
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setConfirmRecibir(true)} disabled={actionLoading}>
              <Icon name="box" size={16} />Marcar recibida
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
