import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { DEMO_SCHEMA_SQL } from './schema';
import * as dbMod from './db';
import { from } from './queryBuilder';

// Reemplazamos getDB por una PGlite en memoria sembrada a mano.
let mem: PGlite;
beforeAll(async () => {
  mem = new PGlite();
  await mem.exec(DEMO_SCHEMA_SQL);
  await mem.exec(`
    INSERT INTO perfiles(id,email,nombre,rol) VALUES
      ('00000000-0000-0000-0000-000000000001','a@d.mx','Admin','admin');
    INSERT INTO clientes(id,nombre) VALUES ('00000000-0000-0000-0000-0000000000c1','Rancho El Sol');
    INSERT INTO productos(id,sku,nombre,categoria,unidad,precio_publico,precio_mayoreo,costo,stock)
      VALUES ('00000000-0000-0000-0000-0000000000d1','SKU1','Urea 46','Fertilizante','bulto',520,500,460,0);
    INSERT INTO movimientos_inventario(producto_id,tipo,cantidad,referencia)
      VALUES ('00000000-0000-0000-0000-0000000000d1','entrada',100,'INIT'); -- dispara trigger: crea lote y stock
  `);
  await mem.exec(`SELECT set_config('demo.uid','00000000-0000-0000-0000-000000000001',false);`);
  dbMod.__setTestDB(mem);
});

describe('queryBuilder', () => {
  it('select simple con eq + single', async () => {
    const { data, error } = await from('productos').select('sku, nombre, stock').eq('sku', 'SKU1').single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ sku: 'SKU1', nombre: 'Urea 46' });
    expect(Number((data as Record<string, unknown>).stock)).toBe(100); // la entrada sumó stock
  });

  it('insert dispara trigger PEPS al vender (vía ventas_detalles)', async () => {
    const venta = await from('ventas').insert({
      folio: 'V-TEST-1', cliente_id: '00000000-0000-0000-0000-0000000000c1',
      vendedor_id: '00000000-0000-0000-0000-000000000001', tipo_pago: 'efectivo',
      subtotal: 520, iva: 0, total: 520, estado: 'cobrada', plazo_dias: 30,
    }).select('id').single();
    expect(venta.error).toBeNull();
    const vid = (venta.data as Record<string, unknown>).id;
    const det = await from('ventas_detalles').insert({
      venta_id: vid, producto_id: '00000000-0000-0000-0000-0000000000d1',
      cantidad: 10, precio_unitario: 52, subtotal: 520,
    }).select();
    expect(det.error).toBeNull();
    const p = await from('productos').select('stock').eq('sku', 'SKU1').single();
    expect(Number((p.data as Record<string, unknown>).stock)).toBe(90); // 100 - 10
  });

  it('select con embed many-to-one', async () => {
    const { data } = await from('ventas').select('folio, clientes:cliente_id(nombre)').eq('folio', 'V-TEST-1').single();
    expect((data as { clientes: { nombre: string } }).clientes.nombre).toBe('Rancho El Sol');
  });

  it('select con embed one-to-many devuelve arreglo', async () => {
    const { data } = await from('ventas').select('folio, pagos_credito(monto)').eq('folio', 'V-TEST-1').single();
    expect(Array.isArray((data as { pagos_credito: unknown[] }).pagos_credito)).toBe(true);
  });

  it('update con eq y returning', async () => {
    const r = await from('clientes').update({ telefono: '4620000000' }).eq('id', '00000000-0000-0000-0000-0000000000c1').select().single();
    expect(r.error).toBeNull();
    expect((r.data as Record<string, unknown>).telefono).toBe('4620000000');
  });
});
