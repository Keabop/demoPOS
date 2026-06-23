// Sistema de toasts ligero (emisor pub/sub a nivel de módulo).
// Permite llamar toast('mensaje') desde cualquier handler sin pasar un hook por props.
// Un único <ToastHost /> (montado en App) se suscribe y los renderiza.

export type ToastTipo = 'info' | 'success' | 'error';
export interface ToastItem {
  id: number;
  mensaje: string;
  tipo: ToastTipo;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = [...toasts];
  listeners.forEach((l) => l(snapshot));
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l([...toasts]);
  return () => {
    listeners.delete(l);
  };
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function baseToast(mensaje: string, tipo: ToastTipo = 'info', duracionMs = 3500): number {
  const id = nextId++;
  toasts = [...toasts, { id, mensaje, tipo }];
  emit();
  if (duracionMs > 0) {
    setTimeout(() => dismissToast(id), duracionMs);
  }
  return id;
}

/** toast(msg) = info · toast.success(msg) · toast.error(msg) */
export const toast = Object.assign(baseToast, {
  success: (m: string, d?: number) => baseToast(m, 'success', d),
  error: (m: string, d?: number) => baseToast(m, 'error', d),
  info: (m: string, d?: number) => baseToast(m, 'info', d),
});
