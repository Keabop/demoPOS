// Selección del precio de venta según el nivel del cliente/venta.
// Vive en lib (puro, testeable). El POS lo usa como única fuente de precio.
import type { Producto, Cliente } from '../types';

export type NivelPrecio = 'contado' | 'credito' | 'subdistribuidor';

export const NIVELES_PRECIO: { value: NivelPrecio; label: string }[] = [
  { value: 'contado', label: 'Contado' },
  { value: 'credito', label: 'Crédito' },
  { value: 'subdistribuidor', label: 'Subdistribuidor' },
];

/**
 * Precio del producto para un nivel dado. Contado = precio_publico.
 * Si el precio del nivel no está capturado (0/ausente) cae a Contado,
 * espejo del patrón histórico `precio_mayoreo || precio_publico`.
 */
export function precioPorNivel(p: Producto, nivel: NivelPrecio): number {
  const contado = Number(p.precio_publico) || 0;
  if (nivel === 'credito') return Number(p.precio_credito) || contado;
  if (nivel === 'subdistribuidor') return Number(p.precio_subdistribuidor) || contado;
  return contado;
}

/** Nivel sugerido según el cliente y si la venta es a crédito. El vendedor puede cambiarlo. */
export function nivelPrecioDefault(cliente: Cliente | null, esCredito: boolean): NivelPrecio {
  if (esCredito) return 'credito';
  if (cliente?.nivel_precio === 'subdistribuidor') return 'subdistribuidor';
  if (cliente?.nivel_precio === 'credito') return 'credito';
  return 'contado';
}
