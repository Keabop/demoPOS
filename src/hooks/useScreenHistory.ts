import { useCallback, useEffect, useRef } from 'react';

/**
 * Sincroniza la pantalla activa (`screen`) con el historial del navegador para
 * que los botones Atrás/Adelante naveguen entre pantallas, sin usar react-router.
 *
 * AGROMAR cambia de módulo con un único estado de React (`screen`), lo que no
 * toca la URL ni el historial: por eso el botón Volver del navegador no regresaba
 * a la pantalla anterior. Este hook agrega una entrada al historial en cada
 * navegación (`pushState`) y restaura la pantalla guardada al recibir `popstate`.
 *
 * @param screen   pantalla activa actual.
 * @param setScreen setter directo del estado (NO agrega historial; lo usa popstate).
 * @returns `navigate(next)`: úsalo para toda navegación iniciada por el usuario.
 */
export function useScreenHistory(
  screen: string,
  setScreen: (s: string) => void,
): (next: string) => void {
  // Espejo de la pantalla actual para comparar sin recrear `navigate` en cada cambio.
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Navegación iniciada por el usuario: registra la entrada y cambia la pantalla.
  const navigate = useCallback(
    (next: string) => {
      if (next === screenRef.current) return; // evita entradas duplicadas
      window.history.pushState({ screen: next }, '');
      setScreen(next);
    },
    [setScreen],
  );

  // Atrás/Adelante del navegador → restaurar la pantalla guardada en la entrada.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const next = (e.state as { screen?: string } | null)?.screen;
      if (next) setScreen(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setScreen]);

  return navigate;
}
