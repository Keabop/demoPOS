// Lógica pura de caja: agrupación por método de pago y cuadre de efectivo del turno.
//
// Reglas del negocio (M1):
//   - El "efectivo esperado en cajón" (arqueo físico) cuenta SOLO efectivo:
//     fondo + ventas/abonos en efectivo + ingresos manuales - egresos manuales.
//   - Tarjeta y débito se presentan como un solo grupo "tarjeta" (banco), con color distintivo.
//   - La venta a crédito de tienda (fiado) NO es dinero del turno: se muestra como informativo.

import { round2 } from './money';

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'debito';
export type TipoPagoVenta = MetodoPago | 'credito';
export type GrupoCaja = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito';

/** Agrupa el método/tipo de pago para la vista de caja: tarjeta y débito → 'tarjeta'. */
export function grupoCaja(tipo: string): GrupoCaja {
  switch (tipo) {
    case 'efectivo': return 'efectivo';
    case 'transferencia': return 'transferencia';
    case 'credito': return 'credito';
    case 'tarjeta':
    case 'debito':
    default: return 'tarjeta';
  }
}

/** ¿Este grupo es dinero que entra al negocio en el turno? El crédito (fiado) NO. */
export function esDinero(grupo: GrupoCaja): boolean {
  return grupo !== 'credito';
}

export interface TotalesGrupo {
  efectivo: number;
  tarjeta: number;       // tarjeta + débito (banco)
  transferencia: number; // banco
  credito: number;       // informativo, NO es dinero
}

export interface ResumenCajaInput {
  startingCash: number;
  ventas: { tipo_pago: string; total: number }[];
  abonos: { metodo: string; monto: number }[];
  ingresos: number; // suma de ingresos manuales (sin apertura)
  egresos: number;  // suma de egresos manuales (sin corte)
}

export interface ResumenCaja {
  ventasPorGrupo: TotalesGrupo;
  abonosPorGrupo: TotalesGrupo; // credito siempre 0 (un abono nunca es "a crédito")
  /** Efectivo físico esperado en cajón: SOLO efectivo. */
  efectivoEsperado: number;
  /** Suma de TODAS las ventas del turno (todos los métodos, incluido crédito). */
  totalVentas: number;
}

function nuevoTotales(): TotalesGrupo {
  return { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0 };
}

export function calcularResumenCaja(input: ResumenCajaInput): ResumenCaja {
  const ventasPorGrupo = nuevoTotales();
  for (const v of input.ventas) {
    ventasPorGrupo[grupoCaja(v.tipo_pago)] += Number(v.total) || 0;
  }

  const abonosPorGrupo = nuevoTotales();
  for (const a of input.abonos) {
    abonosPorGrupo[grupoCaja(a.metodo)] += Number(a.monto) || 0;
  }

  const efectivoEsperado = round2(
    input.startingCash + ventasPorGrupo.efectivo + abonosPorGrupo.efectivo + input.ingresos - input.egresos,
  );

  const totalVentas = round2(
    ventasPorGrupo.efectivo + ventasPorGrupo.tarjeta + ventasPorGrupo.transferencia + ventasPorGrupo.credito,
  );

  return { ventasPorGrupo, abonosPorGrupo, efectivoEsperado, totalVentas };
}
