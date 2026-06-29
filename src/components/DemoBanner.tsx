import { useState } from 'react';
import { resetDemo } from '../lib/demo/db';

// Barra fija superior que identifica la sesión como demo interactiva y ofrece
// reiniciar la base PGlite del navegador a los datos sembrados originales.
export const DemoBanner = () => {
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    if (!confirm('¿Reiniciar la demo a los datos originales?')) return;
    setBusy(true);
    try {
      await resetDemo();
    } catch {
      // resetDemo recarga la página; si algo falla, liberamos el botón.
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#0a120e',
        color: '#dfe9e2',
        fontSize: 12,
        lineHeight: 1,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }}
    >
      <span>● DEMO interactiva — datos de ejemplo en tu navegador</span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('demo:start-tour'))}
        style={{
          background: 'oklch(0.69 0.14 76)',
          color: '#1a140a',
          border: 0,
          borderRadius: 4,
          padding: '1px 9px',
          fontSize: 11,
          lineHeight: 1.4,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ▶ Ver tutorial
      </button>
      <button
        type="button"
        onClick={handleReset}
        disabled={busy}
        style={{
          background: 'transparent',
          color: '#dfe9e2',
          border: '1px solid rgba(223,233,226,0.4)',
          borderRadius: 4,
          padding: '1px 8px',
          fontSize: 11,
          lineHeight: 1.4,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Reiniciando…' : 'Reiniciar demo'}
      </button>
    </div>
  );
};
