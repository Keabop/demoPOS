// Utilidades de fechas para crédito y caducidades.
//
// Problemas reales que resuelve (no es el "overflow de setDate", que es un mito:
// sumar días con setDate cruza meses correctamente):
//   1. Parsear 'YYYY-MM-DD' con `new Date(str)` lo interpreta como UTC medianoche,
//      y al mostrarlo en zonas con offset negativo (México) "retrocede" un día.
//   2. Calcular diferencias de días con (t2 - t1)/86400000 es sensible al horario
//      de verano: un día con cambio de hora tiene 23 o 25 horas y el cociente falla.
// La solución a (2) es comparar mediodías UTC normalizados (inmunes al DST).

/** Zona horaria del negocio (Irapuato, GTO). México sin horario de verano desde 2022 → UTC-6 fijo. */
export const TZ_MX = 'America/Mexico_City';
const OFFSET_MX = '-06:00';

/** Fecha calendario (YYYY-MM-DD) de un instante, vista en la zona horaria de México. */
export function ymdEnMX(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_MX, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Instante (UTC) del inicio del día (00:00) en México para una fecha 'YYYY-MM-DD'. */
export function inicioDiaMX(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000${OFFSET_MX}`);
}

/** Instante (UTC) del fin del día (23:59:59.999) en México para una fecha 'YYYY-MM-DD'. */
export function finDiaMX(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999${OFFSET_MX}`);
}

/** Formatea un timestamp ISO a 'DD/MM/YYYY HH:mm' en hora de México (no del navegador). */
export function formatFechaHoraMX(fecha?: string): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ_MX, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (no UTC), evitando el corrimiento de un día. */
export function parseLocalDate(input: string | Date): Date {
  if (input instanceof Date) return new Date(input.getTime());
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (soloFecha) {
    const [, y, m, d] = soloFecha;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(input);
}

/** Devuelve una NUEVA fecha sumando `n` días (no muta la original; n puede ser negativo). */
export function addDays(date: Date, n: number): Date {
  const r = new Date(date.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Diferencia en días CALENDARIO entre dos fechas (b - a), inmune al horario de verano.
 * Positivo si `b` es posterior a `a`. Ignora la hora del día.
 */
export function diffInCalendarDays(a: Date | string, b: Date | string): number {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Fecha de vencimiento de una venta a crédito = fecha de venta + plazo en días. */
export function fechaVencimiento(fechaVenta: Date | string, plazoDias: number): Date {
  return addDays(parseLocalDate(fechaVenta), plazoDias);
}

/**
 * Días de atraso respecto a HOY: >0 si ya venció (positivo = días vencidos),
 * <=0 si aún está al corriente (negativo = días que faltan para vencer).
 */
export function diasDeAtraso(fechaVencimiento: Date | string, hoy: Date | string = new Date()): number {
  return diffInCalendarDays(fechaVencimiento, hoy);
}

/**
 * Días de atraso a MOSTRAR (mora real): días vencidos contados desde la fecha de
 * vencimiento, nunca negativo. Devuelve 0 si la nota aún no vence. Es el valor
 * correcto para la columna "DÍAS DE ATRASO" del estado de cuenta (y su PDF/Excel).
 */
export function diasAtrasoMostrar(fechaVencimiento: Date | string, hoy: Date | string = new Date()): number {
  return Math.max(0, diasDeAtraso(fechaVencimiento, hoy));
}

/**
 * Fecha de vencimiento contada desde HOY, formateada para mostrar (es-MX).
 * Vive aquí (no en el componente) para no llamar funciones impuras en el render.
 */
export function fechaVencimientoDesdeHoy(plazoDias: number): string {
  return addDays(new Date(), plazoDias).toLocaleDateString('es-MX');
}
