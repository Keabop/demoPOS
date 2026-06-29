import { describe, it, expect, afterEach } from 'vitest';
import { esContextoEscritura, hayModalAbierto } from './atajos';

afterEach(() => { document.body.innerHTML = ''; });

describe('esContextoEscritura', () => {
  it('es true para input, textarea y select', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag);
      expect(esContextoEscritura(el)).toBe(true);
    }
  });
  it('es true para contenteditable', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    document.body.appendChild(el);
    expect(esContextoEscritura(el)).toBe(true);
  });
  it('es false para button, div y null', () => {
    expect(esContextoEscritura(document.createElement('button'))).toBe(false);
    expect(esContextoEscritura(document.createElement('div'))).toBe(false);
    expect(esContextoEscritura(null)).toBe(false);
  });
});

describe('hayModalAbierto', () => {
  it('detecta un [role="dialog"] en el documento', () => {
    expect(hayModalAbierto()).toBe(false);
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    document.body.appendChild(d);
    expect(hayModalAbierto()).toBe(true);
  });
});
