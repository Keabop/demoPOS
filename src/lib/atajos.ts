/**
 * Helpers de la capa de atajos de teclado (R8). Centralizan cuándo un atajo
 * GLOBAL no debe dispararse: cuando el usuario escribe o cuando hay un modal abierto.
 */

/** True si el foco/objetivo es un campo de escritura. */
export function esContextoEscritura(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // jsdom no computa isContentEditable; el atributo cubre ese caso y es más robusto.
  const ce = target.getAttribute('contenteditable');
  if (ce === '' || ce === 'true') return true;
  return false;
}

/** True si hay un modal/diálogo abierto (marcado con role="dialog"). */
export function hayModalAbierto(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}
