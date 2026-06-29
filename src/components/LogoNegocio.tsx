import React from 'react';
import { iniciales } from '../lib/iniciales';

interface LogoNegocioProps {
  /** URL de la imagen del logo; si está vacía/null se dibuja el monograma. */
  logoUrl?: string | null;
  /** Nombre del negocio: alt de la imagen y origen de las iniciales. */
  nombre: string;
  /** Tamaño de fuente del monograma en px. */
  fontSize?: number;
  /** Radio de las esquinas del monograma en px. */
  radius?: number;
}

/**
 * Muestra el logo del negocio llenando su contenedor padre.
 * Si hay imagen la renderiza; si no, dibuja un monograma con las iniciales del
 * nombre (capa de productización: sin logo no aparece la marca de otro cliente).
 */
export const LogoNegocio: React.FC<LogoNegocioProps> = ({ logoUrl, nombre, fontSize = 16, radius = 6 }) => {
  if (logoUrl) {
    return <img src={logoUrl} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
  }
  return (
    <div
      aria-label={nombre}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--green-2)',
        color: '#fff',
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: '0.01em',
        borderRadius: radius,
        userSelect: 'none',
      }}
    >
      {iniciales(nombre)}
    </div>
  );
};
