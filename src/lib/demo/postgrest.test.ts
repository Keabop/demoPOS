import { describe, it, expect } from 'vitest';
import { parseSelect, buildSelectSql, lit } from './postgrest';

describe('lit', () => {
  it('escapa comillas y mapea tipos', () => {
    expect(lit("O'Brien")).toBe("'O''Brien'");
    expect(lit(42)).toBe('42');
    expect(lit(true)).toBe('true');
    expect(lit(null)).toBe('NULL');
  });
});

describe('parseSelect', () => {
  it('columnas simples', () => {
    expect(parseSelect('id, folio, total', 'ventas')).toEqual([
      { col: 'id' }, { col: 'folio' }, { col: 'total' },
    ]);
  });
  it('embed many-to-one con alias:fk (con espacios)', () => {
    const f = parseSelect('*, vendedor:vendedor_id ( nombre )', 'movimientos_caja');
    expect(f[1]).toMatchObject({ key: 'vendedor', table: 'perfiles', kind: 'one', joinCol: 'vendedor_id' });
  });
  it('embed many-to-one sin alias (por nombre de tabla)', () => {
    const f = parseSelect('cantidad, productos(nombre)', 'ventas_detalles');
    expect(f[1]).toMatchObject({ key: 'productos', table: 'productos', kind: 'one', joinCol: 'producto_id' });
  });
  it('embed one-to-many sin alias', () => {
    const f = parseSelect('*, pagos_credito(monto)', 'ventas');
    expect(f[1]).toMatchObject({ key: 'pagos_credito', table: 'pagos_credito', kind: 'many', joinCol: 'venta_id' });
  });
  it('embed anidado 2 niveles', () => {
    const f = parseSelect('*, ventas_detalles(*, productos(*))', 'ventas') as Array<Record<string, unknown> & { fields?: unknown[] }>;
    expect(f[1].key).toBe('ventas_detalles');
    expect(f[1].kind).toBe('many');
    const nested = (f[1].fields as Array<Record<string, unknown>>);
    expect(nested[1].key).toBe('productos');
    expect(nested[1].kind).toBe('one');
  });
});

describe('buildSelectSql', () => {
  it('genera objeto jsonb para many-to-one', () => {
    const sql = buildSelectSql('ventas', 'id, clientes:cliente_id(nombre)', '', '');
    expect(sql).toContain('FROM ventas b');
    expect(sql).toContain(`'nombre'`);
    expect(sql).toContain('AS "clientes"');
  });
  it('genera jsonb_agg para one-to-many', () => {
    const sql = buildSelectSql('ventas', '*, pagos_credito(monto)', '', '');
    expect(sql).toContain('jsonb_agg');
    expect(sql).toContain('AS "pagos_credito"');
  });
  it('conserva columnas con * + embed anidado (to_jsonb || jsonb_build_object)', () => {
    const sql = buildSelectSql('ventas', '*, ventas_detalles(*, productos(*))', '', '');
    expect(sql).toContain('to_jsonb');
    expect(sql).toContain('AS "ventas_detalles"');
  });
});
