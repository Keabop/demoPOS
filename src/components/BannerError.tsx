import React from 'react';
import { Icon } from './Icon';

/**
 * Banner de error visible para fallos de carga (red/RLS), de modo que "sin datos"
 * no se confunda con un error silencioso. Devuelve null si no hay mensaje.
 */
export const BannerError: React.FC<{ mensaje: string | null; onReintentar?: () => void }> = ({ mensaje, onReintentar }) => {
  if (!mensaje) return null;
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16,
      background: 'var(--red-soft)', border: '1px solid oklch(0.58 0.16 25 / 0.25)',
      borderRadius: 'var(--radius)', fontSize: 13,
    }}>
      <Icon name="alert" size={18} color="var(--red)" />
      <span style={{ flex: 1, color: 'var(--ink-2)' }}>{mensaje}</span>
      {onReintentar && (
        <button className="btn btn-secondary" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
};
