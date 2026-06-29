import { describe, it, expect } from 'vitest';
import { saldoNota } from './interes';

// Ejemplos del spec, verificados también contra el SQL fn_saldo_nota vía smoke MCP.
describe('interes moratorio (saldoNota)', () => {
  it('Ej.1 — 3 meses vencida, sin pagos: compuesto 2%', () => {
    const s = saldoNota({ total: 1000, fechaVenta: '2026-01-01', plazoDias: 30 }, '2026-04-30');
    expect(s.fechaVenc.getFullYear()).toBe(2026);
    expect(s.mesesVencidos).toBe(3);
    expect(s.capital).toBe(1000);
    expect(s.interes).toBe(61.21);
    expect(s.saldoTotal).toBe(1061.21);
  });

  it('Ej.2 — abono interés-primero a mitad del atraso', () => {
    const s = saldoNota(
      { total: 1000, fechaVenta: '2026-01-01', plazoDias: 30, pagos: [{ monto: 500, fecha: '2026-03-15' }] },
      '2026-04-30',
    );
    expect(s.capital).toBe(520);
    expect(s.interes).toBe(21.01);
    expect(s.saldoTotal).toBe(541.01);
  });

  it('Ej.3 — no vencida: saldo = capital, sin interés', () => {
    const s = saldoNota({ total: 1000, fechaVenta: '2026-01-01', plazoDias: 30 }, '2026-01-15');
    expect(s.mesesVencidos).toBe(0);
    expect(s.interes).toBe(0);
    expect(s.saldoTotal).toBe(1000);
    expect(s.diasAtraso).toBeLessThan(0);
  });

  it('abono que cubre todo (capital+interés) deja saldo 0', () => {
    const s1 = saldoNota({ total: 1000, fechaVenta: '2026-01-01', plazoDias: 30 }, '2026-02-28');
    // 1 mes: interés 20, saldo 1020
    expect(s1.saldoTotal).toBe(1020);
    const s2 = saldoNota(
      { total: 1000, fechaVenta: '2026-01-01', plazoDias: 30, pagos: [{ monto: 1020, fecha: '2026-02-28' }] },
      '2026-02-28',
    );
    expect(s2.saldoTotal).toBe(0);
    expect(s2.capital).toBe(0);
    expect(s2.interes).toBe(0);
  });

  it('devolución reduce capital (no paga interés)', () => {
    // venc 2026-01-31; devolución de 400 el 2026-02-10 baja capital a 600 ANTES del
    // corte de mes (2026-02-28), así el 2% del mes se calcula sobre 600 = 12.
    const s = saldoNota(
      { total: 1000, fechaVenta: '2026-01-01', plazoDias: 30, devoluciones: [{ monto: 400, fecha: '2026-02-10' }] },
      '2026-02-28',
    );
    expect(s.capital).toBe(600);
    expect(s.interes).toBe(12);
    expect(s.saldoTotal).toBe(612);
  });

  it('nota cancelada no debe nada', () => {
    const s = saldoNota({ total: 1000, fechaVenta: '2026-01-01', plazoDias: 30, cancelada: true }, '2026-06-30');
    expect(s.saldoTotal).toBe(0);
  });
});
