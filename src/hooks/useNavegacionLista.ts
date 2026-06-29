import type React from 'react';

interface Opciones {
  /** Se llama con el índice al presionar Enter sobre la fila/tarjeta enfocada. */
  onActivar?: (indice: number) => void;
  /** Se llama con Escape, o con ↑ desde la primera fila (p.ej. volver al buscador). */
  onEscape?: () => void;
}

/**
 * Navegación por teclado de una lista/rejilla (R8). Devuelve un `onKeyDown` que se
 * coloca en el CONTENEDOR de las filas (`<tbody>` en tablas, el `<div>` de la rejilla en
 * tarjetas). Cada fila/tarjeta debe ser enfocable (`tabIndex={0}`) y llevar
 * `data-nav-index={i}` con su índice del .map.
 *
 * - ←/→ mueve una posición; ↑/↓ mueve por filas (detecta columnas de la rejilla;
 *   en tablas = 1 columna). Home/End van al inicio/fin. Enter activa. Escape sale.
 * - Solo actúa cuando la fila misma tiene el foco (no sus botones internos), así que
 *   los botones de cada fila siguen funcionando normalmente con Tab/Enter.
 * - Usa `e.currentTarget` (el contenedor) para localizar las filas, por lo que queda
 *   acotado a la pantalla activa aunque el keep-alive tenga otras montadas.
 */
export function useNavegacionLista(
  cantidad: number,
  { onActivar, onEscape }: Opciones = {},
) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const objetivo = e.target as HTMLElement;
    if (!objetivo.matches('[data-nav-index]')) return;
    const idx = Number(objetivo.getAttribute('data-nav-index'));
    if (Number.isNaN(idx)) return;

    const cont = e.currentTarget;
    const cols = Math.max(
      1,
      getComputedStyle(cont).gridTemplateColumns.split(' ').filter(Boolean).length || 1,
    );
    const enfocar = (i: number) => {
      if (cantidad <= 0) return;
      const j = Math.max(0, Math.min(i, cantidad - 1));
      (cont.querySelector(`[data-nav-index="${j}"]`) as HTMLElement | null)?.focus();
    };

    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); enfocar(idx + 1); break;
      case 'ArrowLeft': e.preventDefault(); enfocar(idx - 1); break;
      case 'ArrowDown': e.preventDefault(); enfocar(idx + cols); break;
      case 'ArrowUp':
        e.preventDefault();
        if (idx - cols < 0) onEscape?.(); else enfocar(idx - cols);
        break;
      case 'Home': e.preventDefault(); enfocar(0); break;
      case 'End': e.preventDefault(); enfocar(cantidad - 1); break;
      case 'Enter': e.preventDefault(); onActivar?.(idx); break;
      case 'Escape': e.preventDefault(); onEscape?.(); break;
      default: break;
    }
  };
}
