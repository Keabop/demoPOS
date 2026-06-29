import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { FULL_SCHEMA_SQL } from './schema_all';

describe('DEMO_SCHEMA_SQL', () => {
  it('carga en PGlite sin error y crea las tablas/funciones clave', async () => {
    const db = new PGlite(); // en memoria (node)
    await db.exec(FULL_SCHEMA_SQL);
    const t = await db.query<{ c: number }>(
      `select count(*)::int as c from information_schema.tables where table_schema='public'`);
    expect(t.rows[0].c).toBeGreaterThanOrEqual(14);
    const f = await db.query(`select 1 from pg_proc where proname='fn_registrar_venta_completa'`);
    expect(f.rows.length).toBe(1);
    // auth.uid() responde NULL sin sesión:
    const u = await db.query<{ uid: string | null }>(`select auth.uid() as uid`);
    expect(u.rows[0].uid).toBeNull();
    // los 4 triggers existen:
    const trg = await db.query<{ c: number }>(
      `select count(*)::int as c from pg_trigger where tgname like 'trg_%'`);
    // 4 base + materialización de crédito/abonado + 17 trg_audit de bitácora.
    expect(trg.rows[0].c).toBeGreaterThanOrEqual(20);
  });

  it('un alta de inventario tipo entrada dispara el trigger y crea lote + stock', async () => {
    const db = new PGlite();
    await db.exec(FULL_SCHEMA_SQL);
    await db.exec(`
      INSERT INTO productos(id,sku,nombre,categoria,unidad,precio_publico,precio_mayoreo,costo,stock)
        VALUES ('00000000-0000-0000-0000-0000000000d1','S1','Urea','Fert','bulto',520,500,460,0);
      INSERT INTO movimientos_inventario(producto_id,tipo,cantidad,referencia)
        VALUES ('00000000-0000-0000-0000-0000000000d1','entrada',40,'INIT');
    `);
    const p = await db.query<{ stock: string }>(`select stock from productos where sku='S1'`);
    expect(Number(p.rows[0].stock)).toBe(40);
    const l = await db.query<{ c: number }>(`select count(*)::int c from lotes`);
    expect(l.rows[0].c).toBe(1);
  });
});
