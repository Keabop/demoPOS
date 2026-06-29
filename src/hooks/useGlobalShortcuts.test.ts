import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import type { NavItem } from '../config/navegacion';

const items: NavItem[] = [
  { id: 'dashboard', label: 'Tablero', icon: 'home', cap: 'ver_reportes', grupo: 'operacion' },
  { id: 'pos', label: 'Nueva Venta', icon: 'cart', cap: 'vender', grupo: 'operacion' },
  { id: 'inventario', label: 'Inventario', icon: 'box', cap: 'gestionar_inventario', grupo: 'operacion' },
];

function press(key: string, target: EventTarget = document.body) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', { value: target });
  window.dispatchEvent(ev);
  return ev;
}

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('useGlobalShortcuts', () => {
  let navigate: (screen: string) => void;
  let onAbrirAyuda: () => void;
  beforeEach(() => { navigate = vi.fn(); onAbrirAyuda = vi.fn(); });

  it('número navega al N-ésimo item visible', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    press('2');
    expect(navigate).toHaveBeenCalledWith('pos');
  });

  it('número sin item no hace nada', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    press('9');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('? abre la ayuda', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    press('?');
    expect(onAbrirAyuda).toHaveBeenCalled();
  });

  it('se suprime al escribir en un input', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('2', input);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('se suprime con un modal abierto', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    const d = document.createElement('div'); d.setAttribute('role', 'dialog');
    document.body.appendChild(d);
    press('2');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('no hace nada si está deshabilitado (login)', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: false }));
    press('2');
    press('?');
    expect(navigate).not.toHaveBeenCalled();
    expect(onAbrirAyuda).not.toHaveBeenCalled();
  });

  it('/ enfoca el buscador con data-atajo', () => {
    renderHook(() => useGlobalShortcuts({ items, navigate, onAbrirAyuda, habilitado: true }));
    const inp = document.createElement('input');
    inp.setAttribute('data-atajo', 'buscar-productos');
    document.body.appendChild(inp);
    press('/');
    expect(document.activeElement).toBe(inp);
  });
});
