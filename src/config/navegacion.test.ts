import { describe, it, expect } from 'vitest';
import { itemsVisibles, NAV_ITEMS } from './navegacion';

describe('itemsVisibles', () => {
  it('devuelve todos los items si can() siempre es true, en orden de NAV_ITEMS', () => {
    const res = itemsVisibles(() => true);
    expect(res.map(i => i.id)).toEqual(NAV_ITEMS.map(i => i.id));
  });
  it('filtra por capacidad', () => {
    const res = itemsVisibles((c) => c === 'vender');
    expect(res.map(i => i.id)).toContain('pos');
    expect(res.map(i => i.id)).toContain('historial-ventas');
    expect(res.map(i => i.id)).not.toContain('usuarios');
  });
  it('devuelve [] si no hay capacidades', () => {
    expect(itemsVisibles(() => false)).toEqual([]);
  });
});
