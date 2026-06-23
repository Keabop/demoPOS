import { describe, it, expect } from 'vitest';
import { parseLocalDate, addDays, diffInCalendarDays, fechaVencimiento, diasDeAtraso, diasAtrasoMostrar, ymdEnMX, inicioDiaMX, finDiaMX, formatFechaHoraMX } from './dates';

describe('parseLocalDate', () => {
  it('parsea YYYY-MM-DD como fecha local sin correr el día', () => {
    const d = parseLocalDate('2026-01-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0); // enero
    expect(d.getDate()).toBe(15);
  });
});

describe('addDays', () => {
  it('cruza el fin de mes correctamente', () => {
    const d = addDays(parseLocalDate('2026-01-31'), 1);
    expect(d.getMonth()).toBe(1); // febrero
    expect(d.getDate()).toBe(1);
  });

  it('suma 30 días cruzando meses', () => {
    const d = addDays(parseLocalDate('2026-01-15'), 30);
    expect(d.getMonth()).toBe(1); // 14 de febrero
    expect(d.getDate()).toBe(14);
  });

  it('no muta la fecha original', () => {
    const orig = parseLocalDate('2026-01-15');
    addDays(orig, 10);
    expect(orig.getDate()).toBe(15);
  });

  it('acepta días negativos', () => {
    const d = addDays(parseLocalDate('2026-03-01'), -1);
    expect(d.getMonth()).toBe(1); // 28 de febrero (2026 no bisiesto)
    expect(d.getDate()).toBe(28);
  });
});

describe('diffInCalendarDays', () => {
  it('cuenta días calendario entre fechas', () => {
    expect(diffInCalendarDays('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('es negativo si b es anterior a a', () => {
    expect(diffInCalendarDays('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('cruza el cambio de horario de verano sin error de ±1', () => {
    // En México el horario de verano históricamente cambiaba en abril;
    // un día con cambio tiene 23h. El diff debe seguir siendo exacto.
    expect(diffInCalendarDays('2026-04-01', '2026-04-30')).toBe(29);
  });
});

describe('fechaVencimiento', () => {
  it('suma el plazo de crédito a la fecha de venta', () => {
    const v = fechaVencimiento('2026-01-01', 45);
    expect(v.getMonth()).toBe(1); // 15 de febrero
    expect(v.getDate()).toBe(15);
  });
});

describe('diasDeAtraso', () => {
  it('es positivo cuando ya venció', () => {
    expect(diasDeAtraso('2026-01-01', '2026-01-11')).toBe(10);
  });

  it('es negativo cuando aún está al corriente', () => {
    expect(diasDeAtraso('2026-01-20', '2026-01-01')).toBe(-19);
  });

  it('es cero el mismo día del vencimiento', () => {
    expect(diasDeAtraso('2026-01-15', '2026-01-15')).toBe(0);
  });
});

describe('diasAtrasoMostrar', () => {
  it('cuenta la mora real (días vencidos desde el vencimiento)', () => {
    expect(diasAtrasoMostrar('2026-06-01', '2026-06-11')).toBe(10);
  });

  it('es 0 (nunca negativo) cuando la nota aún no vence', () => {
    // Nota a 45 días emitida el 2026-06-12 (vence 2026-07-27), consultada el 2026-06-22:
    // no hay mora todavía → 0, no un número negativo ni días desde la venta.
    expect(diasAtrasoMostrar('2026-07-27', '2026-06-22')).toBe(0);
  });

  it('es 0 el mismo día del vencimiento', () => {
    expect(diasAtrasoMostrar('2026-06-22', '2026-06-22')).toBe(0);
  });
});

describe('zona horaria de México (UTC-6 fijo)', () => {
  it('ymdEnMX usa la fecha calendario de México, no del navegador', () => {
    // 04:00 UTC del 23 = 22:00 (día 22) en México (UTC-6).
    expect(ymdEnMX(new Date('2026-06-23T04:00:00Z'))).toBe('2026-06-22');
    // 06:00 UTC del 23 = 00:00 (día 23) en México.
    expect(ymdEnMX(new Date('2026-06-23T06:00:00Z'))).toBe('2026-06-23');
  });

  it('inicioDiaMX/finDiaMX anclan a medianoche/fin de día de México (instantes UTC)', () => {
    expect(inicioDiaMX('2026-06-22').getTime()).toBe(Date.parse('2026-06-22T06:00:00.000Z'));
    expect(finDiaMX('2026-06-22').getTime()).toBe(Date.parse('2026-06-23T05:59:59.999Z'));
  });

  it('formatFechaHoraMX formatea en hora de México sin importar el navegador', () => {
    expect(formatFechaHoraMX('2026-06-23T04:00:00Z')).toBe('22/06/2026 22:00');
    expect(formatFechaHoraMX('')).toBe('');
  });
});
