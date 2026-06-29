import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { FULL_SCHEMA_SQL } from './schema_all';
import * as dbMod from './db';
import { supabase } from './client';

beforeAll(async () => {
  const mem = new PGlite();
  await mem.exec(FULL_SCHEMA_SQL);
  await mem.exec(`
    INSERT INTO perfiles(id,email,nombre,rol) VALUES ('00000000-0000-0000-0000-000000000002','t@d.mx','Tec','vendedor');
    INSERT INTO clientes(id,nombre,limite_credito) VALUES ('00000000-0000-0000-0000-0000000000c1','Rancho',100000);
    INSERT INTO productos(id,sku,nombre,categoria,unidad,precio_publico,precio_mayoreo,costo,stock)
      VALUES ('00000000-0000-0000-0000-0000000000d1','S1','Urea','Fert','bulto',520,500,460,0);
    INSERT INTO movimientos_inventario(producto_id,tipo,cantidad,referencia) VALUES ('00000000-0000-0000-0000-0000000000d1','entrada',50,'INIT');
    SELECT set_config('demo.uid','00000000-0000-0000-0000-000000000002',false);
  `);
  dbMod.__setTestDB(mem);
});

describe('rpc', () => {
  it('fn_registrar_venta_completa registra venta, descuenta stock (PEPS) y mueve caja', async () => {
    const { data, error } = await supabase.rpc('fn_registrar_venta_completa', {
      p_cliente_id: '00000000-0000-0000-0000-0000000000c1',
      p_vendedor_id: '00000000-0000-0000-0000-000000000002', p_tipo_pago: 'efectivo',
      p_subtotal: 1040, p_iva: 0, p_total: 1040,
      p_detalles: [{ producto_id: '00000000-0000-0000-0000-0000000000d1', cantidad: 2, precio_unitario: 520, subtotal: 1040 }],
      p_plazo_dias: 30,
    });
    expect(error).toBeNull();
    // La firma nueva devuelve json { venta_id, folio } (antes era el uuid suelto).
    const venta = data as { venta_id: string; folio: string };
    expect(venta.venta_id).toBeTruthy();
    expect(venta.folio).toBeTruthy();
    const p = await supabase.from('productos').select('stock').eq('sku', 'S1').single();
    expect(Number((p.data as Record<string, unknown>).stock)).toBe(48);
    const caja = await supabase.from('movimientos_caja').select('tipo, monto').eq('tipo', 'venta');
    expect((caja.data as unknown[]).length).toBe(1);
  });

  it('fn_registrar_abono baja saldo y registra el abono en caja', async () => {
    const venta = await supabase.rpc('fn_registrar_venta_completa', {
      p_cliente_id: '00000000-0000-0000-0000-0000000000c1',
      p_vendedor_id: '00000000-0000-0000-0000-000000000002', p_tipo_pago: 'credito',
      p_subtotal: 520, p_iva: 0, p_total: 520,
      p_detalles: [{ producto_id: '00000000-0000-0000-0000-0000000000d1', cantidad: 1, precio_unitario: 520, subtotal: 520 }],
      p_plazo_dias: 30,
    });
    expect(venta.error).toBeNull();
    const ventaId = (venta.data as { venta_id: string }).venta_id;
    const folio = await supabase.rpc('fn_registrar_abono', {
      p_venta_id: ventaId, p_monto: 200, p_metodo: 'efectivo',
    });
    expect(folio.error).toBeNull();
    expect(typeof folio.data).toBe('string'); // folio del abono (RETURNS varchar)
    const cli = await supabase.from('clientes').select('saldo_deudor').eq('id', '00000000-0000-0000-0000-0000000000c1').single();
    expect(Number((cli.data as Record<string, unknown>).saldo_deudor)).toBe(320); // 520 - 200
    const abono = await supabase.from('movimientos_caja').select('monto').eq('tipo', 'abono');
    expect((abono.data as unknown[]).length).toBe(1);
  });
});
