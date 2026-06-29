// Aritmética monetaria para el POS (MXN, 2 decimales / centavos).
// El objetivo es evitar la acumulación de errores de punto flotante binario
// (ej. 0.1 + 0.2 = 0.30000000000000004) en totales, IVA y arqueos de caja.
// Para mostrar montos en pantalla usa `fmtMXN` de `./format`.

/** Redondea un monto a centavos (2 decimales) de forma estable. */
export function round2(n: number): number {
  // El + EPSILON compensa el truncamiento hacia abajo de valores como 1.005.
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Suma una lista de montos y redondea el resultado a centavos. */
export function sumMoney(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + Number(v || 0), 0));
}

export interface LineaVenta {
  precioUnitario: number;
  cantidad: number;
  /** Tasa de IVA como fracción: 0.00 (exento), 0.16 (16%), etc. */
  tasaIva: number;
  /** Tasa de IEPS como fracción: 0.00 (exento), 0.06 (6%), etc. */
  tasaIeps?: number;
}

export interface TotalesVenta {
  subtotal: number;
  iva: number;
  ieps: number;
  total: number;
}

/**
 * Calcula subtotal, IVA y total redondeando POR PARTIDA a centavos antes de sumar.
 * Redondear por línea (no al final) hace que el total coincida exactamente con la
 * suma de las partidas que se imprimen en el ticket, evitando descuadres de 1 centavo.
 */
export function calcularTotales(lineas: LineaVenta[]): TotalesVenta {
  let subtotal = 0;
  let iva = 0;
  let ieps = 0;
  for (const l of lineas) {
    const baseLinea = round2(Number(l.precioUnitario) * Number(l.cantidad));
    const iepsLinea = round2(baseLinea * Number(l.tasaIeps || 0));
    // Orden fiscal: IVA sobre base + IEPS. En AGROMAR tasaIva = 0, así que iva = 0.
    const ivaLinea = round2((baseLinea + iepsLinea) * Number(l.tasaIva || 0));
    subtotal += baseLinea;
    ieps += iepsLinea;
    iva += ivaLinea;
  }
  subtotal = round2(subtotal);
  ieps = round2(ieps);
  iva = round2(iva);
  return { subtotal, iva, ieps, total: round2(subtotal + iva + ieps) };
}

/** Subtotal de una sola partida (precio * cantidad) redondeado a centavos. */
export function subtotalLinea(precioUnitario: number, cantidad: number): number {
  return round2(Number(precioUnitario) * Number(cantidad));
}

export interface MargenProducto {
  utilidad: number;   // precio_publico - costo (centavos)
  porcentaje: number; // utilidad / precio_publico * 100
}

/** Margen de utilidad de un producto: ganancia ($) y % sobre el precio público. */
export function margen(precioPublico: number, costo: number): MargenProducto {
  const utilidad = round2(Number(precioPublico) - Number(costo));
  const porcentaje = Number(precioPublico) > 0 ? round2((utilidad / Number(precioPublico)) * 100) : 0;
  return { utilidad, porcentaje };
}
