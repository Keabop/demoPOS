import { describe, it, expect } from 'vitest';
import { grupoCaja, esDinero, calcularResumenCaja } from './caja';

describe('grupoCaja', () => {
  it('une tarjeta y débito en el grupo "tarjeta"', () => {
    expect(grupoCaja('tarjeta')).toBe('tarjeta');
    expect(grupoCaja('debito')).toBe('tarjeta');
  });
  it('mantiene efectivo, transferencia y crédito separados', () => {
    expect(grupoCaja('efectivo')).toBe('efectivo');
    expect(grupoCaja('transferencia')).toBe('transferencia');
    expect(grupoCaja('credito')).toBe('credito');
  });
});

describe('esDinero', () => {
  it('el crédito de tienda NO es dinero del turno', () => {
    expect(esDinero('credito')).toBe(false);
  });
  it('efectivo, tarjeta y transferencia sí son dinero', () => {
    expect(esDinero('efectivo')).toBe(true);
    expect(esDinero('tarjeta')).toBe(true);
    expect(esDinero('transferencia')).toBe(true);
  });
});

describe('calcularResumenCaja', () => {
  const base = {
    startingCash: 1000,
    ventas: [
      { tipo_pago: 'efectivo', total: 500 },
      { tipo_pago: 'tarjeta', total: 200 },
      { tipo_pago: 'debito', total: 100 },
      { tipo_pago: 'transferencia', total: 300 },
      { tipo_pago: 'credito', total: 999 },
    ],
    abonos: [
      { metodo: 'efectivo', total: 0, monto: 50 },
      { metodo: 'tarjeta', monto: 70 },
      { metodo: 'debito', monto: 30 },
      { metodo: 'transferencia', monto: 40 },
    ],
    ingresos: 25,
    egresos: 15,
  };

  it('agrupa ventas por método (tarjeta = tarjeta + débito)', () => {
    const r = calcularResumenCaja(base);
    expect(r.ventasPorGrupo.efectivo).toBe(500);
    expect(r.ventasPorGrupo.tarjeta).toBe(300); // 200 + 100
    expect(r.ventasPorGrupo.transferencia).toBe(300);
    expect(r.ventasPorGrupo.credito).toBe(999);
  });

  it('agrupa abonos por método (tarjeta = tarjeta + débito)', () => {
    const r = calcularResumenCaja(base);
    expect(r.abonosPorGrupo.efectivo).toBe(50);
    expect(r.abonosPorGrupo.tarjeta).toBe(100); // 70 + 30
    expect(r.abonosPorGrupo.transferencia).toBe(40);
    expect(r.abonosPorGrupo.credito).toBe(0);
  });

  it('el efectivo esperado SOLO cuenta efectivo (no banco ni crédito)', () => {
    const r = calcularResumenCaja(base);
    // 1000 fondo + 500 venta efectivo + 50 abono efectivo + 25 ingreso - 15 egreso = 1560
    expect(r.efectivoEsperado).toBe(1560);
  });

  it('una venta a crédito NO mueve el efectivo esperado', () => {
    const sinCredito = calcularResumenCaja({ ...base, ventas: base.ventas.filter(v => v.tipo_pago !== 'credito') });
    expect(sinCredito.efectivoEsperado).toBe(1560);
  });

  it('total de ventas suma todos los métodos, incluido crédito', () => {
    const r = calcularResumenCaja(base);
    expect(r.totalVentas).toBe(2099); // 500+200+100+300+999
  });
});
