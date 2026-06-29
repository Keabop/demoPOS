import { describe, it, expect } from 'vitest';
import { precioPorNivel, nivelPrecioDefault } from './precios';
import type { Producto, Cliente } from '../types';

const prod = (over: Partial<Producto> = {}): Producto => ({
  id: '1', sku: 'X', nombre: 'P', categoria: 'Semillas', unidad: 'pza',
  precio_publico: 100, precio_mayoreo: 0, tasa_iva: 0, costo: 0, stock: 0, stock_minimo: 5,
  precio_credito: 120, precio_subdistribuidor: 90, ...over,
} as Producto);

describe('precioPorNivel', () => {
  it('contado devuelve precio_publico', () => {
    expect(precioPorNivel(prod(), 'contado')).toBe(100);
  });
  it('credito devuelve precio_credito', () => {
    expect(precioPorNivel(prod(), 'credito')).toBe(120);
  });
  it('subdistribuidor devuelve precio_subdistribuidor', () => {
    expect(precioPorNivel(prod(), 'subdistribuidor')).toBe(90);
  });
  it('cae a contado si el precio del nivel es 0 o ausente', () => {
    expect(precioPorNivel(prod({ precio_credito: 0 }), 'credito')).toBe(100);
    expect(precioPorNivel(prod({ precio_subdistribuidor: undefined }), 'subdistribuidor')).toBe(100);
  });
});

describe('nivelPrecioDefault', () => {
  const cli = (nivel?: Cliente['nivel_precio']): Cliente => ({
    id: '1', nombre: 'C', limite_credito: 0, saldo_deudor: 0,
    activo_para_credito: true, nivel_precio: nivel,
  } as Cliente);
  it('venta a credito => credito', () => {
    expect(nivelPrecioDefault(cli('contado'), true)).toBe('credito');
  });
  it('cliente subdistribuidor (contado) => subdistribuidor', () => {
    expect(nivelPrecioDefault(cli('subdistribuidor'), false)).toBe('subdistribuidor');
  });
  it('cliente de credito (contado) => credito', () => {
    expect(nivelPrecioDefault(cli('credito'), false)).toBe('credito');
  });
  it('sin cliente / anonima => contado', () => {
    expect(nivelPrecioDefault(null, false)).toBe('contado');
  });
});
