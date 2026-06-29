import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScreenHistory } from './useScreenHistory';

describe('useScreenHistory', () => {
  beforeEach(() => {
    // Aísla cada prueba: restaura espías (evita que el conteo de pushState se
    // arrastre entre tests) y limpia el estado del historial.
    vi.restoreAllMocks();
    window.history.replaceState(null, '');
  });

  it('navigate cambia la pantalla y agrega una entrada al historial', () => {
    const setScreen = vi.fn();
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useScreenHistory('clientes', setScreen));

    act(() => result.current('reportes'));

    expect(setScreen).toHaveBeenCalledWith('reportes');
    expect(push).toHaveBeenCalledWith({ screen: 'reportes' }, '');
  });

  it('navigate hacia la misma pantalla no agrega entradas duplicadas', () => {
    const setScreen = vi.fn();
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useScreenHistory('clientes', setScreen));

    act(() => result.current('clientes'));

    expect(push).not.toHaveBeenCalled();
    expect(setScreen).not.toHaveBeenCalled();
  });

  it('el evento popstate restaura la pantalla guardada (botón Volver)', () => {
    const setScreen = vi.fn();
    renderHook(() => useScreenHistory('reportes', setScreen));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'clientes' } }));
    });

    expect(setScreen).toHaveBeenCalledWith('clientes');
  });

  it('popstate sin estado de pantalla no cambia nada', () => {
    const setScreen = vi.fn();
    renderHook(() => useScreenHistory('reportes', setScreen));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    expect(setScreen).not.toHaveBeenCalled();
  });

  it('al desmontar deja de escuchar popstate', () => {
    const setScreen = vi.fn();
    const { unmount } = renderHook(() => useScreenHistory('reportes', setScreen));

    unmount();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'clientes' } }));
    });

    expect(setScreen).not.toHaveBeenCalled();
  });
});
