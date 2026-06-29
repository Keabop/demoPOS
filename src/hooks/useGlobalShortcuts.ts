import { useEffect } from 'react';
import type { NavItem } from '../config/navegacion';
import { esContextoEscritura, hayModalAbierto } from '../lib/atajos';

export interface GlobalShortcutsOpts {
  items: NavItem[];
  navigate: (screen: string) => void;
  onAbrirAyuda: () => void;
  habilitado: boolean;
}

/**
 * Atajos GLOBALES (R8): números 1–9 navegan al N-ésimo item visible del menú,
 * `?` abre la ayuda, `/` enfoca el buscador de la pantalla, y ↑/↓ desde `body`
 * entran al menú lateral. Se suprime al escribir o con un modal abierto.
 * Los contextos con foco (menú/rejilla/combobox) manejan sus propias flechas.
 */
export function useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado }: GlobalShortcutsOpts): void {
  useEffect(() => {
    if (!habilitado) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (esContextoEscritura(e.target) || hayModalAbierto()) return;

      if (e.key === '?') { e.preventDefault(); onAbrirAyuda(); return; }

      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < items.length) { e.preventDefault(); navigate(items[idx].id); }
        return;
      }

      if (e.key === '/') {
        // Acotar a la pantalla ACTIVA: con keep-alive hay buscadores de otras pantallas
        // ocultas montados en el DOM; sin esto, `/` podría enfocar uno invisible.
        const label = document.querySelector('.app')?.getAttribute('data-screen-label');
        const ambito: ParentNode = (label && document.querySelector(`[data-keepalive="${label}"]`)) || document;
        const el = ambito.querySelector<HTMLInputElement>(
          '[data-atajo="buscar-productos"], [data-atajo="buscar-cliente"], [data-atajo="buscar"]',
        );
        if (el) { e.preventDefault(); el.focus(); }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const activo = document.activeElement;
        const enBody = !activo || activo === document.body;
        if (enBody) {
          const item = document.querySelector<HTMLElement>('.sidebar-item.active')
            || document.querySelector<HTMLElement>('.sidebar-item');
          if (item) { e.preventDefault(); item.focus(); }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, navigate, onAbrirAyuda, habilitado]);
}
