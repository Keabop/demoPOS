import React, { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast, type ToastItem, type ToastTipo } from '../lib/toast';
import { Icon } from './Icon';

const ESTILO: Record<ToastTipo, { bg: string; fg: string; icon: string }> = {
  success: { bg: 'var(--ok-soft)', fg: 'var(--ok-2)', icon: 'check' },
  error: { bg: 'var(--red-soft)', fg: 'var(--red)', icon: 'alert' },
  info: { bg: 'var(--surface-2)', fg: 'var(--ink-2)', icon: 'clock' },
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 3000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380, pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const e = ESTILO[t.tipo] ?? ESTILO.info;
        return (
          <div
            key={t.id}
            role="status"
            onClick={() => dismissToast(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              background: e.bg, border: '1px solid var(--line)', borderRadius: 10,
              boxShadow: 'var(--shadow-lg)', cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)',
              pointerEvents: 'auto', animation: 'scaleIn 0.18s ease-out',
            }}
          >
            <Icon name={e.icon} size={18} color={e.fg} />
            <span style={{ flex: 1 }}>{t.mensaje}</span>
          </div>
        );
      })}
    </div>
  );
};
