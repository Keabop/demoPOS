import { useEffect, useRef } from 'react';

/**
 * Keep-alive: con varias pantallas montadas (ocultas con display:none), una pantalla
 * NO se vuelve a montar al regresar a ella, así que sus datos quedan viejos (estado de
 * caja, stock, listas). Este hook ejecuta `fn` cada vez que la pantalla pasa de inactiva
 * a ACTIVA (no en el primer montaje, que ya carga por su cuenta), para refrescar los
 * datos del servidor conservando el estado de la UI (carrito, filtros, búsqueda).
 */
export function useAlActivar(activo: boolean, fn: () => void): void {
  const previo = useRef(activo);
  const fnRef = useRef(fn);
  // Mantener la referencia a la última `fn` SIN mutar el ref durante el render
  // (lo hace un efecto que corre tras cada render).
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    if (activo && !previo.current) fnRef.current();
    previo.current = activo;
  }, [activo]);
}
