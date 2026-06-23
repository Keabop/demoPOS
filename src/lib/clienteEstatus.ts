// Cálculo puro del estatus de crédito de un cliente y de sus notas, para las
// tarjetas, filtros y KPIs de la pantalla de Clientes. Usa `dates.ts` para que
// los vencimientos sean inmunes a zona horaria / horario de verano.

import { diasDeAtraso, fechaVencimiento } from './dates';

export type EstatusCliente = 'al-corriente' | 'por-vencer' | 'vencida';

export interface NotaCredito {
  /** Saldo pendiente de la nota (0 si está liquidada). */
  saldo: number;
  /** Fecha de la venta ('YYYY-MM-DD' o ISO). */
  fechaVenta: string;
  /** Plazo de crédito de la nota, en días. */
  plazoDias: number;
}

/** Estatus de una sola nota respecto a HOY. */
export function estatusNota(nota: NotaCredito, hoy?: Date | string): EstatusCliente {
  if (nota.saldo <= 0) return 'al-corriente';
  const venc = fechaVencimiento(nota.fechaVenta, nota.plazoDias);
  const atraso = diasDeAtraso(venc, hoy); // >0 vencida, <=0 al corriente
  if (atraso > 0) return 'vencida';
  if (atraso >= -7) return 'por-vencer'; // vence dentro de 7 días
  return 'al-corriente';
}

/** Estatus consolidado de un cliente: el peor estatus entre sus notas con saldo. */
export function estatusCliente(notas: NotaCredito[], hoy?: Date | string): EstatusCliente {
  let resultado: EstatusCliente = 'al-corriente';
  for (const n of notas) {
    if (n.saldo <= 0) continue;
    const e = estatusNota(n, hoy);
    if (e === 'vencida') return 'vencida';
    if (e === 'por-vencer') resultado = 'por-vencer';
  }
  return resultado;
}
