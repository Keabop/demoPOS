export const fmtMXN = (n: number): string =>
  '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMXN0 = (n: number): string =>
  '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
