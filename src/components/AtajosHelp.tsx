import React from 'react';
import { Icon } from './Icon';

interface Props { open: boolean; onClose: () => void; }

const ATAJOS: Array<{ teclas: string; desc: string }> = [
  { teclas: '1 – 9', desc: 'Ir a la opción correspondiente del menú' },
  { teclas: '↑ / ↓', desc: 'Moverse por el menú lateral o por la lista' },
  { teclas: '/', desc: 'Ir al buscador de la pantalla' },
  { teclas: '↑ / ↓ / ← / →', desc: 'Moverse por la lista o las tarjetas (desde el buscador, ↓ entra)' },
  { teclas: 'Enter', desc: 'Abrir / activar lo resaltado (editar, ver perfil, agregar…)' },
  { teclas: 'N', desc: 'Nuevo (producto, cliente o proveedor)' },
  { teclas: 'P', desc: 'Registrar pago (en Notas a Crédito)' },
  { teclas: 'Esc', desc: 'Volver al buscador / cerrar ventanas' },
  { teclas: '?', desc: 'Mostrar u ocultar esta ayuda' },
];

export const AtajosHelp: React.FC<Props> = ({ open, onClose }) => {
  if (!open) return null;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); }
  };
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Atajos de teclado"
        className="card" tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '90%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h3" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="settings" size={20} color="var(--green)" /> Atajos de teclado
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'var(--muted)' }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ATAJOS.map((a) => (
            <div key={a.teclas} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <span className="kbd" style={{ minWidth: 96, textAlign: 'center', fontWeight: 700 }}>{a.teclas}</span>
              <span style={{ color: 'var(--ink-2)' }}>{a.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
