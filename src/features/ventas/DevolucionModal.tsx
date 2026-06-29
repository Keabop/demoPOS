import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { fmtMXN } from '../../lib/format';
import { montoLineaDevolucion, totalDevolucion } from '../../lib/devoluciones';

interface VentaRef {
  id: string;
  folio: string;
  tipo_pago: string;
  total: number;
}

interface LineaDev {
  venta_detalle_id: string;
  producto_id: string | null;
  nombre: string;
  precio_unitario: number;
  ieps: number;          // IEPS total de la línea (para la cantidad vendida)
  cantidad: number;      // cantidad vendida
  yaDevuelta: number;    // devuelto en devoluciones previas
  disponible: number;    // cantidad - yaDevuelta
  aDevolver: number;     // input
  reingresa: boolean;
}

type MetodoReembolso = 'efectivo' | 'transferencia' | 'tarjeta' | 'debito';

interface Props {
  venta: VentaRef;
  onClose: () => void;
  onSuccess: () => void;
}

const nombreProducto = (p: unknown): string => {
  if (Array.isArray(p)) return (p[0] as { nombre?: string })?.nombre ?? 'Producto';
  return (p as { nombre?: string })?.nombre ?? 'Producto';
};

export const DevolucionModal: React.FC<Props> = ({ venta, onClose, onSuccess }) => {
  const esCredito = venta.tipo_pago === 'credito';
  const [lineas, setLineas] = useState<LineaDev[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState<MetodoReembolso>('efectivo');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const { data: dets, error: e1 } = await supabase
          .from('ventas_detalles')
          .select('id, producto_id, cantidad, precio_unitario, ieps, productos(nombre)')
          .eq('venta_id', venta.id);
        if (e1) throw e1;
        const ids = (dets ?? []).map(d => d.id as string);
        const yaPorLinea: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: prev, error: e2 } = await supabase
            .from('devoluciones_detalles')
            .select('venta_detalle_id, cantidad')
            .in('venta_detalle_id', ids);
          if (e2) throw e2;
          for (const r of prev ?? []) {
            const k = r.venta_detalle_id as string;
            yaPorLinea[k] = (yaPorLinea[k] ?? 0) + Number(r.cantidad);
          }
        }
        if (!active) return;
        setLineas((dets ?? []).map(d => {
          const cantidad = Number(d.cantidad);
          const yaDevuelta = yaPorLinea[d.id as string] ?? 0;
          const disponible = Math.max(0, cantidad - yaDevuelta);
          return {
            venta_detalle_id: d.id as string,
            producto_id: (d.producto_id as string) ?? null,
            nombre: nombreProducto(d.productos),
            precio_unitario: Number(d.precio_unitario),
            ieps: Number(d.ieps ?? 0),
            cantidad,
            yaDevuelta,
            disponible,
            aDevolver: 0,
            reingresa: true,
          };
        }));
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el detalle de la venta.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [venta.id]);

  const setLinea = (idx: number, patch: Partial<LineaDev>) =>
    setLineas(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const totalReembolso = useMemo(
    () => totalDevolucion(lineas.map(l => montoLineaDevolucion(l.precio_unitario, l.ieps, l.cantidad, l.aDevolver))),
    [lineas],
  );

  const hayAlgo = lineas.some(l => l.aDevolver > 0);

  const handleSubmit = async () => {
    if (submitting) return;
    const p_lineas = lineas
      .filter(l => l.aDevolver > 0)
      .map(l => ({ venta_detalle_id: l.venta_detalle_id, cantidad: l.aDevolver, reingresa: l.reingresa }));
    if (p_lineas.length === 0) {
      toast.error('Indica al menos una cantidad a devolver.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('fn_registrar_devolucion', {
        p_venta_id: venta.id,
        p_lineas,
        p_motivo: motivo.trim() || null,
        p_metodo_reembolso: metodo,
      });
      if (error) throw error;
      toast.success(`Devolución registrada (${fmtMXN(totalReembolso)}).`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la devolución.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16,
    }}>
      <div role="dialog" aria-modal="true" className="card" style={{
        width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
        padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h3" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="arrow-right" size={20} color="var(--red)" />
            Devolución · Venta {venta.folio}
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Cargando detalle…</div>
        ) : loadError ? (
          <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: 12, borderRadius: 8, fontSize: 13 }}>{loadError}</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lineas.map((l, idx) => (
                <div key={l.venta_detalle_id} style={{
                  padding: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line-2)',
                  display: 'flex', flexDirection: 'column', gap: 8, opacity: l.disponible <= 0 ? 0.55 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.nombre}</div>
                    <div className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtMXN(l.precio_unitario)} c/u</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                    <span>Vendido: <strong className="num" style={{ color: 'var(--ink-2)' }}>{l.cantidad}</strong></span>
                    {l.yaDevuelta > 0 && <span>Ya devuelto: <strong className="num">{l.yaDevuelta}</strong></span>}
                    <span>Disponible: <strong className="num" style={{ color: 'var(--ink-2)' }}>{l.disponible}</strong></span>
                  </div>
                  {l.disponible > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Devolver:
                        <NumberInput
                          value={l.aDevolver}
                          onChange={(n) => setLinea(idx, { aDevolver: Math.max(0, Math.min(n, l.disponible)) })}
                          className="input num"
                          style={{ width: 80, height: 34, textAlign: 'center', fontWeight: 700 }}
                        />
                      </label>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!l.reingresa}
                          onChange={e => setLinea(idx, { reingresa: !e.target.checked })} />
                        Merma (no reingresa al inventario)
                      </label>
                      <span className="num" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>
                        {fmtMXN(montoLineaDevolucion(l.precio_unitario, l.ieps, l.cantidad, l.aDevolver))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label htmlFor="dev-motivo" className="label">Motivo (opcional)</label>
              <input id="dev-motivo" className="input" value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ej. producto equivocado, cliente desistió…" />
            </div>

            {esCredito ? (
              <div style={{ padding: '10px 12px', background: 'var(--amber-soft)', borderRadius: 8, fontSize: 12, color: 'oklch(0.5 0.12 70)' }}>
                <Icon name="credit" size={14} /> Se descontará de la nota de crédito del cliente. Si ya pagó de más, el excedente se reembolsa en efectivo.
              </div>
            ) : (
              <div>
                <label htmlFor="dev-metodo" className="label">¿Cómo se devolvió el dinero?</label>
                <select id="dev-metodo" className="input" value={metodo}
                  onChange={e => setMetodo(e.target.value as MetodoReembolso)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta de crédito</option>
                  <option value="debito">Tarjeta de débito</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 700 }}>Total a {esCredito ? 'acreditar' : 'reembolsar'}</span>
              <span className="num" style={{ fontWeight: 800, fontSize: 20 }}>{fmtMXN(totalReembolso)}</span>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !hayAlgo}
                style={{ background: 'var(--red)' }}>
                {submitting ? 'Registrando…' : 'Registrar devolución'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
