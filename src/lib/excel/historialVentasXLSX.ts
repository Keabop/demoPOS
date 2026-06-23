import * as XLSX from 'xlsx';

export interface DatosExport {
  columnas: string[];
  filas: (string | number)[][];
  total: number;
  desde: string;
  hasta: string;
}

/** Matriz (array de arrays) lista para volverse hoja: encabezado + filas + TOTAL. */
export function construirWorksheetData(d: DatosExport): (string | number)[][] {
  const filaTotal: (string | number)[] = new Array(Math.max(d.columnas.length - 2, 0)).fill('');
  filaTotal.push('TOTAL', d.total);
  return [d.columnas, ...d.filas, [], filaTotal];
}

export function exportarHistorialXLSX(d: DatosExport): void {
  const ws = XLSX.utils.aoa_to_sheet(construirWorksheetData(d));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
  XLSX.writeFile(wb, `historial-ventas_${d.desde}_${d.hasta}.xlsx`);
}
