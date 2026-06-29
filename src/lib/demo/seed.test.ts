import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { FULL_SCHEMA_SQL } from './schema_all';
import { DEMO_SEED_SQL } from './seed';

// UUIDs de referencia usados por el dataset (deben coincidir con seed.ts).
const C_MOROSO = '00000000-0000-0000-0000-0000000c0004'; // crédito vencido impago → bloqueada
const C_ABONO_PARCIAL = '00000000-0000-0000-0000-0000000c0002'; // V-0005: 16000 - 6000 = 10000

describe('DEMO_SEED_SQL', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite(); // Postgres en memoria (node)
    await db.exec(FULL_SCHEMA_SQL);
    await db.exec(DEMO_SEED_SQL);
  });

  it('siembra el catálogo de productos (>= 24)', async () => {
    const r = await db.query<{ c: number }>(`select count(*)::int c from productos`);
    expect(r.rows[0].c).toBeGreaterThanOrEqual(24);
  });

  it('siembra exactamente 8 clientes', async () => {
    const r = await db.query<{ c: number }>(`select count(*)::int c from clientes`);
    expect(Number(r.rows[0].c)).toBe(8);
  });

  it('el cliente moroso queda bloqueado para crédito tras evaluar', async () => {
    const r = await db.query<{ activo: boolean }>(
      `select activo_para_credito as activo from clientes where id=$1`, [C_MOROSO]);
    expect(r.rows[0].activo).toBe(false);
  });

  it('existe al menos una venta a crédito pendiente', async () => {
    const r = await db.query<{ c: number }>(
      `select count(*)::int c from ventas where tipo_pago='credito' and estado='pendiente'`);
    expect(Number(r.rows[0].c)).toBeGreaterThanOrEqual(1);
  });

  it('el cliente con abono parcial tiene saldo_deudor = total - abono (> 0)', async () => {
    // V-0005: total 16000, abono 6000 → saldo de la venta = 10000.
    // c0002 no tiene otras ventas a crédito, así que su saldo_deudor refleja ese resto.
    const r = await db.query<{ s: string }>(
      `select saldo_deudor s from clientes where id=$1`, [C_ABONO_PARCIAL]);
    const saldo = Number(r.rows[0].s);
    expect(saldo).toBe(10000);
    expect(saldo).toBeGreaterThan(0);
  });

  it('caja contiene ventas (>0), abonos (>0) y exactamente 1 apertura', async () => {
    const venta = await db.query<{ c: number }>(
      `select count(*)::int c from movimientos_caja where tipo='venta'`);
    const abono = await db.query<{ c: number }>(
      `select count(*)::int c from movimientos_caja where tipo='abono'`);
    const apertura = await db.query<{ c: number }>(
      `select count(*)::int c from movimientos_caja where tipo='apertura'`);
    expect(Number(venta.rows[0].c)).toBeGreaterThan(0);
    expect(Number(abono.rows[0].c)).toBeGreaterThan(0);
    expect(Number(apertura.rows[0].c)).toBe(1);
  });

  it('los movimientos de caja de abono quedan atribuidos al vendedor (set_config OK)', async () => {
    const r = await db.query<{ c: number }>(
      `select count(*)::int c from movimientos_caja where tipo='abono' and vendedor_id is null`);
    expect(Number(r.rows[0].c)).toBe(0);
  });

  it('ningún producto con stock negativo', async () => {
    const r = await db.query<{ c: number }>(
      `select count(*)::int c from productos where stock < 0`);
    expect(Number(r.rows[0].c)).toBe(0);
  });

  it('hay al menos un producto bajo su stock_minimo y al menos uno agotado', async () => {
    const bajo = await db.query<{ c: number }>(
      `select count(*)::int c from productos where stock < stock_minimo and stock > 0`);
    const cero = await db.query<{ c: number }>(
      `select count(*)::int c from productos where stock = 0`);
    expect(Number(bajo.rows[0].c)).toBeGreaterThanOrEqual(1);
    expect(Number(cero.rows[0].c)).toBeGreaterThanOrEqual(1);
  });

  it('cada venta cuadra con la suma de sus detalles (subtotal/total)', async () => {
    const r = await db.query<{ c: number }>(`
      select count(*)::int c from ventas v
      where v.total <> v.subtotal + v.iva
         or v.subtotal <> (select coalesce(sum(d.subtotal),0) from ventas_detalles d where d.venta_id = v.id)
    `);
    expect(Number(r.rows[0].c)).toBe(0);
  });

  it('se sembraron las 14 ventas históricas con su detalle', async () => {
    const v = await db.query<{ c: number }>(`select count(*)::int c from ventas`);
    const d = await db.query<{ c: number }>(`select count(*)::int c from ventas_detalles`);
    expect(Number(v.rows[0].c)).toBe(14);
    expect(Number(d.rows[0].c)).toBeGreaterThan(14);
  });
});
