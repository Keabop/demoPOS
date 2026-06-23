// Costo unitario para valuar inventario.
//
// Regla: usar el costo real (del lote, o del producto como referencia) cuando ya
// está capturado (> 0). Si todavía NO hay costo capturado, estimar con el precio
// de venta para que la valuación no aparezca en $0. Conforme se registren costos
// reales en las entradas, la valuación converge al costo verdadero.
//
// Por qué no basta `costoLote ?? costoProducto ?? precio`: la columna `costo` tiene
// default 0 (no NULL), así que `??` nunca cae al fallback; hay que comparar contra > 0.

export function costoValuacion(
  costoLote: number | null | undefined,
  costoProducto: number | null | undefined,
  precioPublico: number | null | undefined,
): number {
  const cl = Number(costoLote) || 0;
  if (cl > 0) return cl;
  const cp = Number(costoProducto) || 0;
  if (cp > 0) return cp;
  return Number(precioPublico) || 0;
}
