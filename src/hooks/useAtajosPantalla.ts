import { useEffect, useRef } from 'react';
import { esContextoEscritura, hayModalAbierto } from '../lib/atajos';

/**
 * Atajos de una sola tecla (letras) acotados a la pantalla ACTIVA (R8). Como el keep-alive
 * mantiene varias pantallas montadas, estos atajos SOLO se enganchan cuando `activo` es
 * true; así "n" no dispara "nuevo" en tres pantallas a la vez.
 *
 * `mapa` asocia teclas (en minúscula) a acciones, p.ej. `{ n: () => abrirNuevo() }`.
 * Se suprime mientras se escribe en un campo o si hay un modal abierto.
 */
export function useAtajosPantalla(activo: boolean, mapa: Record<string, () => void>): void {
  const mapaRef = useRef(mapa);
  // Mantener el mapa más reciente sin mutar el ref durante el render.
  useEffect(() => { mapaRef.current = mapa; });
  useEffect(() => {
    if (!activo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (esContextoEscritura(e.target) || hayModalAbierto()) return;
      const fn = mapaRef.current[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activo]);
}
