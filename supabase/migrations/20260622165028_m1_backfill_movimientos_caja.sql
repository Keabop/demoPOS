-- M1 backfill: dejar movimientos_caja consistente con el histórico, sin duplicar.

-- A. Backfill de metodo/categoria/venta_id en los movimientos 'venta' YA existentes
--    (efectivo/tarjeta insertados por el RPC viejo, sin estos campos). Match por folio.
UPDATE public.movimientos_caja m
SET metodo    = v.tipo_pago,
    categoria = CASE WHEN v.tipo_pago = 'efectivo' THEN 'caja' ELSE 'banco' END,
    venta_id  = v.id
FROM public.ventas v
WHERE m.tipo = 'venta'
  AND m.venta_id IS NULL
  AND m.descripcion = 'Venta contado folio ' || v.folio;

-- B. Ventas de contado que NO generaron movimiento (transferencia/debito del RPC viejo).
INSERT INTO public.movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, venta_id, fecha)
SELECT v.vendedor_id, 'venta', v.total, 'Venta contado folio ' || v.folio,
       v.tipo_pago, 'banco', v.id, v.fecha
FROM public.ventas v
WHERE v.tipo_pago IN ('transferencia','debito')
  AND NOT EXISTS (SELECT 1 FROM public.movimientos_caja m WHERE m.venta_id = v.id);

-- C. Abonos a crédito que no tienen su movimiento de caja.
INSERT INTO public.movimientos_caja (vendedor_id, tipo, monto, descripcion, metodo, categoria, pago_id, fecha)
SELECT NULL, 'abono', pc.monto, 'Abono credito folio ' || pc.folio_pago,
       pc.metodo, CASE WHEN pc.metodo = 'efectivo' THEN 'caja' ELSE 'banco' END, pc.id, pc.fecha
FROM public.pagos_credito pc
WHERE NOT EXISTS (SELECT 1 FROM public.movimientos_caja m WHERE m.pago_id = pc.id);
