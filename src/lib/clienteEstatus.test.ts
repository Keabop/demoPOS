import { describe, it, expect } from 'vitest';
import { estatusNota, estatusCliente } from './clienteEstatus';

describe('estatusNota', () => {
  it('al-corriente si no hay saldo', () => {
    expect(estatusNota({ saldo: 0, fechaVenta: '2026-01-01', plazoDias: 30 }, '2026-06-01')).toBe('al-corriente');
  });

  it('vencida si pasó la fecha de vencimiento con saldo', () => {
    expect(estatusNota({ saldo: 100, fechaVenta: '2026-01-01', plazoDias: 30 }, '2026-06-01')).toBe('vencida');
  });

  it('por-vencer si vence dentro de 7 días', () => {
    // venta 2026-06-01 + 30 = vence 2026-07-01; hoy 2026-06-28 → faltan 3 días
    expect(estatusNota({ saldo: 100, fechaVenta: '2026-06-01', plazoDias: 30 }, '2026-06-28')).toBe('por-vencer');
  });

  it('al-corriente si vence en más de 7 días', () => {
    expect(estatusNota({ saldo: 100, fechaVenta: '2026-06-01', plazoDias: 30 }, '2026-06-10')).toBe('al-corriente');
  });
});

describe('estatusCliente', () => {
  it('toma el peor estatus (vencida gana)', () => {
    const notas = [
      { saldo: 0, fechaVenta: '2026-01-01', plazoDias: 30 },
      { saldo: 50, fechaVenta: '2026-06-01', plazoDias: 30 },
      { saldo: 50, fechaVenta: '2026-01-01', plazoDias: 30 },
    ];
    expect(estatusCliente(notas, '2026-06-28')).toBe('vencida');
  });

  it('por-vencer si la peor nota está próxima a vencer', () => {
    const notas = [
      { saldo: 0, fechaVenta: '2026-01-01', plazoDias: 30 },
      { saldo: 50, fechaVenta: '2026-06-01', plazoDias: 30 }, // vence 2026-07-01
    ];
    expect(estatusCliente(notas, '2026-06-28')).toBe('por-vencer');
  });

  it('al-corriente si todas liquidadas', () => {
    expect(estatusCliente([{ saldo: 0, fechaVenta: '2026-01-01', plazoDias: 30 }], '2026-06-01')).toBe('al-corriente');
  });
});
