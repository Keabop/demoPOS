import { describe, it, expect } from 'vitest';
import { DEFAULT_PERMISOS, PLANTILLAS, permisosCompletos, CAPACIDADES_META } from './capacidades';

describe('capacidades', () => {
  it('admin tiene todas; visitante no ve costos ni vende', () => {
    expect(DEFAULT_PERMISOS.admin.configurar_sistema).toBe(true);
    expect(DEFAULT_PERMISOS.visitante.ver_costos).toBe(false);
    expect(DEFAULT_PERMISOS.visitante.vender).toBe(false);
  });

  it('plantilla técnico vs ventas difieren solo en ver_costos', () => {
    const t = PLANTILLAS.find((p) => p.id === 'tecnico')!.permisos;
    const v = PLANTILLAS.find((p) => p.id === 'ventas')!.permisos;
    expect(t.ver_costos).toBe(false);
    expect(v.ver_costos).toBe(true);
    expect(t.vender).toBe(false);
    expect(v.vender).toBe(false);
  });

  it('permisosCompletos cae a defaults cuando viene vacío', () => {
    expect(permisosCompletos(undefined, 'vendedor').vender).toBe(true);
    expect(permisosCompletos({ ver_costos: false }, 'vendedor').ver_costos).toBe(false);
    expect(permisosCompletos({ ver_costos: false }, 'vendedor').vender).toBe(true);
  });
});

describe('capacidad administrar_cartera', () => {
  it('existe en el catálogo como Acción', () => {
    expect(CAPACIDADES_META.find((c) => c.cap === 'administrar_cartera')?.grupo).toBe('Acciones');
  });
  it('solo el admin la trae por defecto', () => {
    expect(DEFAULT_PERMISOS.admin.administrar_cartera).toBe(true);
    expect(DEFAULT_PERMISOS.vendedor.administrar_cartera).toBe(false);
    expect(DEFAULT_PERMISOS.visitante.administrar_cartera).toBe(false);
  });
});
