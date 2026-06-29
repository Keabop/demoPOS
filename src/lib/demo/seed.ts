// src/lib/demo/seed.ts
// Dataset de siembra de la DEMO portable (PGlite ejecuta el esquema REAL de AGROMAR).
// Un único script SQL idempotente sobre un esquema recién creado: perfiles, configuración,
// proveedores, 28 productos (stock construido con entradas → trigger crea lotes), 8 clientes,
// proveedor_productos, 14 ventas históricas (contado y crédito; el trigger PEPS descuenta lotes
// y valida stock) con abonos (trigger de abono mueve caja + saldo), apertura de caja de hoy y
// evaluación de morosos al final.
//
// REGLAS que impone el esquema y respeta este seed:
//  - Primera sentencia: set_config('demo.uid', <vendedor 0002>) para que fn_procesar_abono_credito
//    registre el movimiento de caja del abono con vendedor (usa auth.uid()).
//  - UUIDs SOLO hexadecimales válidos (0-9, a-f).
//  - Las entradas de inventario van ANTES de cualquier venta (el trigger PEPS valida stock).
//  - Por producto, lo vendido nunca excede lo que entró. 4 productos quedan por debajo de su
//    stock_minimo y 2 quedan en 0 → el Dashboard muestra alertas de inventario.
//  - Ventas a crédito: se suma saldo_deudor manualmente; los abonos NO se descuentan a mano
//    (el trigger ya baja saldo, salda la venta si procede e inserta el movimiento de caja).
//  - iva=0 y total=subtotal en el historial (AGROMAR opera sin IVA; el IVA se demuestra en
//    ventas NUEVAS desde el POS, con configuracion.iva_default=0.16).
export const SEED_VERSION = '2.0.0';

export const DEMO_SEED_SQL = /* sql */ `
-- ===== Sesión: el vendedor activo durante la siembra es el técnico/mostrador (0002) =====
-- fn_procesar_abono_credito inserta en movimientos_caja con auth.uid(); sin esto el abono
-- quedaría sin vendedor (y la FK a perfiles fallaría / el corte de caja no lo atribuiría).
SELECT set_config('demo.uid','00000000-0000-0000-0000-000000000002', false);

-- ===== Perfiles (UUID = DEMO_USERS en auth.ts) =====
INSERT INTO perfiles(id,email,nombre,rol,activo) VALUES
 ('00000000-0000-0000-0000-000000000001','admin@demo.mx','Karen (Administradora)','admin',true),
 ('00000000-0000-0000-0000-000000000002','tecnico@demo.mx','Juan (Técnico/Mostrador)','vendedor',true),
 ('00000000-0000-0000-0000-000000000003','ventas@demo.mx','Consulta (Ventas)','visitante',true);

-- ===== Configuración (singleton id=1; demo CON IVA configurable) =====
INSERT INTO configuracion(id,razon_social,descripcion,responsable,rfc,direccion,cp,ciudad,telefono,tel_pagare,email,logo_url,moneda_simbolo,moneda_iso,locale,iva_default)
VALUES (1,'Agroservicios El Surco','Insumos agrícolas y crédito al productor','Karen Méndez','ASU240101AAA',
        'Carr. a Pénjamo Km 4','38400','Irapuato, Gto.','462 270 1280','462 270 1280','contacto@elsurco.mx',
        '/logo-demo.svg','$','MXN','es-MX',0.16);

-- ===== Proveedores =====
INSERT INTO proveedores(id,nombre,contacto,telefono,email,direccion,rfc,activo) VALUES
 ('00000000-0000-0000-0000-00000000a001','Yara México','Ventas Bajío','477 111 2233','bajio@yara.com.mx','Parque Ind. León, Gto.','YME900101AAA',true),
 ('00000000-0000-0000-0000-00000000a002','Bayer CropScience','Mostrador Mayoreo','477 222 3344','pedidos@bayercrop.mx','Av. Industria 120, León','BCS900101AAA',true),
 ('00000000-0000-0000-0000-00000000a003','Semillas del Centro','Pedidos','462 333 4455','contacto@semillascentro.mx','Carr. Irapuato-Silao Km 8','SDC900101AAA',true),
 ('00000000-0000-0000-0000-00000000a004','FMC Agroquímica','Atención a clientes','477 444 5566','ventas@fmcagro.mx','Blvd. Aeropuerto 45, León','FMA900101AAA',true);

-- ===== Productos (28) — stock arranca en 0; se construye con entradas más abajo =====
INSERT INTO productos(id,sku,nombre,categoria,unidad,precio_publico,precio_mayoreo,costo,stock,stock_minimo,tasa_iva) VALUES
 -- Fertilizantes
 ('00000000-0000-0000-0000-00000000d001','FERT-UREA46','Urea 46% (bulto 50 kg)','Fertilizantes','bulto',780,740,690,0,10,0),
 ('00000000-0000-0000-0000-00000000d002','FERT-MAP1846','MAP 18-46-00 (bulto 50 kg)','Fertilizantes','bulto',980,930,860,0,8,0),
 ('00000000-0000-0000-0000-00000000d003','FERT-DAP','DAP 18-46-00 Granular (50 kg)','Fertilizantes','bulto',1020,970,900,0,8,0),
 ('00000000-0000-0000-0000-00000000d004','FERT-KCL60','Cloruro de Potasio 60% (50 kg)','Fertilizantes','bulto',890,845,780,0,8,0),
 ('00000000-0000-0000-0000-00000000d005','FERT-SAM21','Sulfato de Amonio 21% (50 kg)','Fertilizantes','bulto',520,495,450,0,10,0),
 ('00000000-0000-0000-0000-00000000d006','FERT-1717','Triple 17 (17-17-17) (50 kg)','Fertilizantes','bulto',940,895,830,0,8,0),
 -- Herbicidas
 ('00000000-0000-0000-0000-00000000d007','HERB-GLIFO360','Glifosato 360 (tambo 20 L)','Herbicidas','tambo',1450,1380,1250,0,5,0),
 ('00000000-0000-0000-0000-00000000d008','HERB-2-4D','2,4-D Amina (garrafa 5 L)','Herbicidas','garrafa',680,640,580,0,6,0),
 ('00000000-0000-0000-0000-00000000d009','HERB-PARAQ','Paraquat 200 (garrafa 5 L)','Herbicidas','garrafa',920,870,790,0,5,0),
 ('00000000-0000-0000-0000-00000000d00a','HERB-ATRAZ','Atrazina 500 (garrafa 5 L)','Herbicidas','garrafa',740,700,640,0,6,0),
 -- Insecticidas
 ('00000000-0000-0000-0000-00000000d00b','INSE-CLORP480','Clorpirifos 480 (litro)','Insecticidas','litro',210,195,170,0,12,0),
 ('00000000-0000-0000-0000-00000000d00c','INSE-IMIDA','Imidacloprid 350 (litro)','Insecticidas','litro',480,455,410,0,8,0),
 ('00000000-0000-0000-0000-00000000d00d','INSE-CIPER','Cipermetrina 200 (litro)','Insecticidas','litro',260,245,215,0,10,0),
 ('00000000-0000-0000-0000-00000000d00e','INSE-ABAME','Abamectina 1.8 (litro)','Insecticidas','litro',540,510,460,0,8,0),
 -- Fungicidas
 ('00000000-0000-0000-0000-00000000d00f','FUNG-MANCO','Mancozeb 80 (saco 25 kg)','Fungicidas','saco',1150,1090,1000,0,5,0),
 ('00000000-0000-0000-0000-00000000d010','FUNG-AZOXI','Azoxistrobina 250 (litro)','Fungicidas','litro',980,930,850,0,6,0),
 ('00000000-0000-0000-0000-00000000d011','FUNG-OXICLO','Oxicloruro de Cobre (kg)','Fungicidas','kilo',180,170,150,0,10,0),
 -- Semillas
 ('00000000-0000-0000-0000-00000000d012','SEMI-MAIZH','Semilla Maíz Híbrido (saco 60k sem)','Semillas','saco',3200,3050,2800,0,6,0),
 ('00000000-0000-0000-0000-00000000d013','SEMI-SORGO','Semilla Sorgo Forrajero (saco 25 kg)','Semillas','saco',1450,1380,1250,0,6,0),
 ('00000000-0000-0000-0000-00000000d014','SEMI-FRIJOL','Semilla Frijol Pinto (saco 25 kg)','Semillas','saco',1280,1210,1100,0,5,0),
 ('00000000-0000-0000-0000-00000000d015','SEMI-AVENA','Semilla Avena Forrajera (saco 40 kg)','Semillas','saco',720,680,610,0,8,0),
 -- Foliares
 ('00000000-0000-0000-0000-00000000d016','FOLI-NPK','Foliar NPK + Microelementos (litro)','Foliares','litro',180,165,140,0,15,0),
 ('00000000-0000-0000-0000-00000000d017','FOLI-CAB','Foliar Calcio-Boro (litro)','Foliares','litro',210,195,165,0,12,0),
 ('00000000-0000-0000-0000-00000000d018','FOLI-ZNFE','Quelato Zinc-Hierro (litro)','Foliares','litro',290,275,240,0,10,0),
 -- Implementos
 ('00000000-0000-0000-0000-00000000d019','IMPL-ASP20','Aspersora de Mochila 20 L','Implementos','pieza',680,640,560,0,4,0),
 ('00000000-0000-0000-0000-00000000d01a','IMPL-MANG50','Manguera de Riego 50 m','Implementos','pieza',520,490,430,0,5,0),
 ('00000000-0000-0000-0000-00000000d01b','IMPL-GUANT','Guantes de Nitrilo (par)','Implementos','par',75,68,55,0,20,0),
 ('00000000-0000-0000-0000-00000000d01c','IMPL-MASCA','Mascarilla con Filtro Químico','Implementos','pieza',240,225,195,0,8,0);

-- ===== Stock inicial — entradas (el trigger fn_procesar_movimiento_inventario crea lote y suma stock) =====
-- Las cantidades dejan margen para las ventas de abajo y producen alertas de inventario al final.
INSERT INTO movimientos_inventario(producto_id,tipo,cantidad,referencia,descripcion,creado_en) VALUES
 ('00000000-0000-0000-0000-00000000d001','entrada',120,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d002','entrada',60,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d003','entrada',40,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d004','entrada',50,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d005','entrada',90,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d006','entrada',55,'OC-INIT-001','Inventario inicial',now()-interval '58 days'),
 ('00000000-0000-0000-0000-00000000d007','entrada',24,'OC-INIT-002','Inventario inicial',now()-interval '55 days'),
 ('00000000-0000-0000-0000-00000000d008','entrada',30,'OC-INIT-002','Inventario inicial',now()-interval '55 days'),
 ('00000000-0000-0000-0000-00000000d009','entrada',3,'OC-INIT-002','Inventario inicial (lote corto)',now()-interval '55 days'),
 ('00000000-0000-0000-0000-00000000d00a','entrada',22,'OC-INIT-002','Inventario inicial',now()-interval '55 days'),
 ('00000000-0000-0000-0000-00000000d00b','entrada',16,'OC-INIT-003','Inventario inicial',now()-interval '50 days'),
 ('00000000-0000-0000-0000-00000000d00c','entrada',20,'OC-INIT-003','Inventario inicial',now()-interval '50 days'),
 ('00000000-0000-0000-0000-00000000d00d','entrada',6,'OC-INIT-003','Inventario inicial (lote corto)',now()-interval '50 days'),
 ('00000000-0000-0000-0000-00000000d00e','entrada',14,'OC-INIT-003','Inventario inicial',now()-interval '50 days'),
 ('00000000-0000-0000-0000-00000000d00f','entrada',12,'OC-INIT-004','Inventario inicial',now()-interval '48 days'),
 ('00000000-0000-0000-0000-00000000d010','entrada',15,'OC-INIT-004','Inventario inicial',now()-interval '48 days'),
 ('00000000-0000-0000-0000-00000000d011','entrada',40,'OC-INIT-004','Inventario inicial',now()-interval '48 days'),
 ('00000000-0000-0000-0000-00000000d012','entrada',30,'OC-INIT-005','Inventario inicial',now()-interval '45 days'),
 ('00000000-0000-0000-0000-00000000d013','entrada',20,'OC-INIT-005','Inventario inicial',now()-interval '45 days'),
 ('00000000-0000-0000-0000-00000000d014','entrada',2,'OC-INIT-005','Inventario inicial (lote corto)',now()-interval '45 days'),
 ('00000000-0000-0000-0000-00000000d015','entrada',25,'OC-INIT-005','Inventario inicial',now()-interval '45 days'),
 ('00000000-0000-0000-0000-00000000d016','entrada',100,'OC-INIT-006','Inventario inicial',now()-interval '40 days'),
 ('00000000-0000-0000-0000-00000000d017','entrada',60,'OC-INIT-006','Inventario inicial',now()-interval '40 days'),
 ('00000000-0000-0000-0000-00000000d018','entrada',45,'OC-INIT-006','Inventario inicial',now()-interval '40 days'),
 ('00000000-0000-0000-0000-00000000d019','entrada',4,'OC-INIT-007','Inventario inicial (lote corto)',now()-interval '38 days'),
 ('00000000-0000-0000-0000-00000000d01a','entrada',16,'OC-INIT-007','Inventario inicial',now()-interval '38 days'),
 ('00000000-0000-0000-0000-00000000d01b','entrada',60,'OC-INIT-007','Inventario inicial',now()-interval '38 days'),
 ('00000000-0000-0000-0000-00000000d01c','entrada',20,'OC-INIT-007','Inventario inicial',now()-interval '38 days');

-- ===== Ajustes de inventario (salidas) — dejan 2 productos en 0 (alertas de agotado) =====
-- Van DESPUÉS de las entradas (la salida PEPS valida que haya stock) y ANTES de las ventas.
--  d015 (Avena): se caduca todo el lote → queda en 0.
--  d013 (Sorgo): merma del lote; queda 1 y la venta V-0010 lo deja en 0.
INSERT INTO movimientos_inventario(producto_id,tipo,cantidad,referencia,descripcion,motivo,creado_en) VALUES
 ('00000000-0000-0000-0000-00000000d015','salida',25,'AJUSTE-001','Lote caducado dado de baja','caducidad',now()-interval '20 days'),
 ('00000000-0000-0000-0000-00000000d013','salida',19,'AJUSTE-002','Merma por humedad en bodega','merma',now()-interval '18 days');

-- ===== Clientes (8 ranchos del Bajío) — saldo_deudor arranca en 0 y se ajusta con las ventas a crédito =====
-- c0004 será la MOROSA (crédito vencido, plazo 15 días, impago) → bloqueada al evaluar morosos.
-- c0002 queda con saldo deudor ALTO pero al corriente; c0006 queda CERCA de su límite de crédito.
INSERT INTO clientes(id,nombre,rancho,telefono,limite_credito,saldo_deudor,activo_para_credito,dias_credito) VALUES
 ('00000000-0000-0000-0000-0000000c0001','José Ramírez Aguilar','Rancho El Sol','462 111 2233',50000,0,true,30),
 ('00000000-0000-0000-0000-0000000c0002','María González Ponce','La Esperanza','462 222 3344',80000,0,true,45),
 ('00000000-0000-0000-0000-0000000c0003','Pedro Vargas Núñez','Los Encinos','462 333 4455',30000,0,true,30),
 ('00000000-0000-0000-0000-0000000c0004','Lucía Torres Medina','El Mezquite','462 444 5566',20000,0,true,15),
 ('00000000-0000-0000-0000-0000000c0005','Antonio Mendoza Ruiz','San Isidro','462 555 6677',40000,0,true,30),
 ('00000000-0000-0000-0000-0000000c0006','Rosa Hernández Lara','La Purísima','462 666 7788',15000,0,true,30),
 ('00000000-0000-0000-0000-0000000c0007','Francisco Jiménez Díaz','El Capulín','462 777 8899',60000,0,true,45),
 ('00000000-0000-0000-0000-0000000c0008','Guadalupe Salas Vega','Los Pinos','462 888 9900',25000,0,true,30);

-- ===== Catálogo de compra (proveedor_productos) — precio_compra ≈ costo del producto =====
INSERT INTO proveedor_productos(proveedor_id,producto_id,precio_compra) VALUES
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d001',690),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d002',860),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d003',900),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d004',780),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d005',450),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d006',830),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d007',1250),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d008',580),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d009',790),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d00a',640),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d00b',170),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d00c',410),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d00d',215),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d00e',460),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d00f',1000),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000d010',850),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d011',150),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000d012',2800),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000d013',1250),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000d014',1100),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000d015',610),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d016',140),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d017',165),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000d018',240),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d019',560),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d01a',430),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d01b',55),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000d01c',195);

-- =====================================================================================
-- VENTAS HISTÓRICAS (14). Patrón por venta:
--   1) INSERT ventas (fecha explícita; iva=0; total=subtotal).
--   2) INSERT ventas_detalles (trigger PEPS valida stock, descuenta lote, asigna lote_id).
--   3a) CONTADO → INSERT manual movimientos_caja (tipo 'venta', metodo=tipo_pago,
--       categoria 'caja' si efectivo, 'banco' si no).
--   3b) CRÉDITO → UPDATE clientes.saldo_deudor += total. Abonos: INSERT pagos_credito
--       (el trigger baja saldo, salda la venta si corresponde y registra el abono en caja).
-- =====================================================================================

-- V-0001 — Contado EFECTIVO (hoy-52d) — c0001
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0001','V-0001','00000000-0000-0000-0000-0000000c0001','00000000-0000-0000-0000-000000000002','efectivo',2080,0,2080,'cobrada',now()-interval '52 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-00000000d001',2,780,1560),
 ('00000000-0000-0000-0000-0000000e0001','00000000-0000-0000-0000-00000000d005',1,520,520);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',2080,'Venta contado folio V-0001','efectivo','caja','00000000-0000-0000-0000-0000000e0001',now()-interval '52 days');

-- V-0002 — Contado TRANSFERENCIA (hoy-47d) — c0002
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0002','V-0002','00000000-0000-0000-0000-0000000c0002','00000000-0000-0000-0000-000000000002','transferencia',2900,0,2900,'cobrada',now()-interval '47 days',45);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0002','00000000-0000-0000-0000-00000000d007',2,1450,2900);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',2900,'Venta contado folio V-0002','transferencia','banco','00000000-0000-0000-0000-0000000e0002',now()-interval '47 days');

-- V-0003 — CRÉDITO VENCIDO de la MOROSA c0004 (hoy-42d, plazo 15, SIN abono) → moroso al evaluar
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0003','V-0003','00000000-0000-0000-0000-0000000c0004','00000000-0000-0000-0000-000000000002','credito',3200,0,3200,'pendiente',now()-interval '42 days',15);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0003','00000000-0000-0000-0000-00000000d012',1,3200,3200);
UPDATE clientes SET saldo_deudor = saldo_deudor + 3200 WHERE id='00000000-0000-0000-0000-0000000c0004';

-- V-0004 — Contado TARJETA (hoy-38d) — c0003
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0004','V-0004','00000000-0000-0000-0000-0000000c0003','00000000-0000-0000-0000-000000000002','tarjeta',1960,0,1960,'cobrada',now()-interval '38 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0004','00000000-0000-0000-0000-00000000d002',2,980,1960);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',1960,'Venta contado folio V-0004','tarjeta','banco','00000000-0000-0000-0000-0000000e0004',now()-interval '38 days');

-- V-0005 — CRÉDITO con ABONO PARCIAL (hoy-35d, plazo 45 → vigente) — c0002 (saldo deudor ALTO al corriente)
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0005','V-0005','00000000-0000-0000-0000-0000000c0002','00000000-0000-0000-0000-000000000002','credito',16000,0,16000,'pendiente',now()-interval '35 days',45);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0005','00000000-0000-0000-0000-00000000d012',5,3200,16000);
UPDATE clientes SET saldo_deudor = saldo_deudor + 16000 WHERE id='00000000-0000-0000-0000-0000000c0002';
-- Abono parcial de $6,000 (trigger: baja saldo a 10000, mantiene pendiente, registra en caja)
INSERT INTO pagos_credito(venta_id,monto,metodo,folio_pago,fecha) VALUES
 ('00000000-0000-0000-0000-0000000e0005',6000,'transferencia','P-0001',now()-interval '20 days');

-- V-0006 — Contado EFECTIVO (hoy-30d) — c0005
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0006','V-0006','00000000-0000-0000-0000-0000000c0005','00000000-0000-0000-0000-000000000002','efectivo',1340,0,1340,'cobrada',now()-interval '30 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-00000000d00b',4,210,840),
 ('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-00000000d016',2,180,360),
 ('00000000-0000-0000-0000-0000000e0006','00000000-0000-0000-0000-00000000d01b',2,70,140);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',1340,'Venta contado folio V-0006','efectivo','caja','00000000-0000-0000-0000-0000000e0006',now()-interval '30 days');

-- V-0007 — CRÉDITO PENDIENTE sin abono (hoy-25d, plazo 30 → vigente) — c0007
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0007','V-0007','00000000-0000-0000-0000-0000000c0007','00000000-0000-0000-0000-000000000002','credito',5750,0,5750,'pendiente',now()-interval '25 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0007','00000000-0000-0000-0000-00000000d003',3,1020,3060),
 ('00000000-0000-0000-0000-0000000e0007','00000000-0000-0000-0000-00000000d006',2,940,1880),
 ('00000000-0000-0000-0000-0000000e0007','00000000-0000-0000-0000-00000000d011',5,162,810);
UPDATE clientes SET saldo_deudor = saldo_deudor + 5750 WHERE id='00000000-0000-0000-0000-0000000c0007';

-- V-0008 — Contado DÉBITO (hoy-22d) — c0001
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0008','V-0008','00000000-0000-0000-0000-0000000c0001','00000000-0000-0000-0000-000000000002','debito',1480,0,1480,'cobrada',now()-interval '22 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0008','00000000-0000-0000-0000-00000000d008',1,680,680),
 ('00000000-0000-0000-0000-0000000e0008','00000000-0000-0000-0000-00000000d00a',1,740,740),
 ('00000000-0000-0000-0000-0000000e0008','00000000-0000-0000-0000-00000000d011',2,30,60);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',1480,'Venta contado folio V-0008','debito','banco','00000000-0000-0000-0000-0000000e0008',now()-interval '22 days');

-- V-0009 — CRÉDITO SALDADO por abono total (hoy-20d, plazo 30) — c0003 (queda 'cobrada')
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e0009','V-0009','00000000-0000-0000-0000-0000000c0003','00000000-0000-0000-0000-000000000002','credito',1840,0,1840,'pendiente',now()-interval '20 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e0009','00000000-0000-0000-0000-00000000d004',1,890,890),
 ('00000000-0000-0000-0000-0000000e0009','00000000-0000-0000-0000-00000000d018',2,290,580),
 ('00000000-0000-0000-0000-0000000e0009','00000000-0000-0000-0000-00000000d017',1,210,210),
 ('00000000-0000-0000-0000-0000000e0009','00000000-0000-0000-0000-00000000d016',1,160,160);
UPDATE clientes SET saldo_deudor = saldo_deudor + 1840 WHERE id='00000000-0000-0000-0000-0000000c0003';
-- Abono total: salda la venta (trigger la marca 'cobrada') y baja saldo a 0
INSERT INTO pagos_credito(venta_id,monto,metodo,folio_pago,fecha) VALUES
 ('00000000-0000-0000-0000-0000000e0009',1840,'efectivo','P-0002',now()-interval '8 days');

-- V-0010 — Contado EFECTIVO grande (hoy-16d) — c0006
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e000a','V-0010','00000000-0000-0000-0000-0000000c0006','00000000-0000-0000-0000-000000000002','efectivo',2840,0,2840,'cobrada',now()-interval '16 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e000a','00000000-0000-0000-0000-00000000d013',1,1450,1450),
 ('00000000-0000-0000-0000-0000000e000a','00000000-0000-0000-0000-00000000d00f',1,1150,1150),
 ('00000000-0000-0000-0000-0000000e000a','00000000-0000-0000-0000-00000000d01b',4,60,240);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',2840,'Venta contado folio V-0010','efectivo','caja','00000000-0000-0000-0000-0000000e000a',now()-interval '16 days');

-- V-0011 — CRÉDITO cerca del límite (hoy-12d, plazo 30) — c0006 (límite 15000; saldo quedará 12500)
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e000b','V-0011','00000000-0000-0000-0000-0000000c0006','00000000-0000-0000-0000-000000000002','credito',12500,0,12500,'pendiente',now()-interval '12 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e000b','00000000-0000-0000-0000-00000000d012',3,3200,9600),
 ('00000000-0000-0000-0000-0000000e000b','00000000-0000-0000-0000-00000000d007',2,1450,2900);
UPDATE clientes SET saldo_deudor = saldo_deudor + 12500 WHERE id='00000000-0000-0000-0000-0000000c0006';

-- V-0012 — Contado TRANSFERENCIA (hoy-9d) — c0008
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e000c','V-0012','00000000-0000-0000-0000-0000000c0008','00000000-0000-0000-0000-000000000002','transferencia',3700,0,3700,'cobrada',now()-interval '9 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e000c','00000000-0000-0000-0000-00000000d010',2,980,1960),
 ('00000000-0000-0000-0000-0000000e000c','00000000-0000-0000-0000-00000000d00e',2,540,1080),
 ('00000000-0000-0000-0000-0000000e000c','00000000-0000-0000-0000-00000000d00c',1,480,480),
 ('00000000-0000-0000-0000-0000000e000c','00000000-0000-0000-0000-00000000d011',1,180,180);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',3700,'Venta contado folio V-0012','transferencia','banco','00000000-0000-0000-0000-0000000e000c',now()-interval '9 days');

-- V-0013 — Contado EFECTIVO (hoy-4d) — c0005
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e000d','V-0013','00000000-0000-0000-0000-0000000c0005','00000000-0000-0000-0000-000000000002','efectivo',1700,0,1700,'cobrada',now()-interval '4 days',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e000d','00000000-0000-0000-0000-00000000d019',1,680,680),
 ('00000000-0000-0000-0000-0000000e000d','00000000-0000-0000-0000-00000000d01a',1,520,520),
 ('00000000-0000-0000-0000-0000000e000d','00000000-0000-0000-0000-00000000d01c',2,240,480),
 ('00000000-0000-0000-0000-0000000e000d','00000000-0000-0000-0000-00000000d011',1,20,20);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',1700,'Venta contado folio V-0013','efectivo','caja','00000000-0000-0000-0000-0000000e000d',now()-interval '4 days');

-- V-0014 — Contado EFECTIVO de hoy (turno actual) — c0001
INSERT INTO ventas(id,folio,cliente_id,vendedor_id,tipo_pago,subtotal,iva,total,estado,fecha,plazo_dias) VALUES
 ('00000000-0000-0000-0000-0000000e000e','V-0014','00000000-0000-0000-0000-0000000c0001','00000000-0000-0000-0000-000000000002','efectivo',1560,0,1560,'cobrada',now()-interval '1 hours',30);
INSERT INTO ventas_detalles(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES
 ('00000000-0000-0000-0000-0000000e000e','00000000-0000-0000-0000-00000000d001',2,780,1560);
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,venta_id,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','venta',1560,'Venta contado folio V-0014','efectivo','caja','00000000-0000-0000-0000-0000000e000e',now()-interval '1 hours');

-- ===== Apertura de caja de HOY (turno abierto en la pantalla Caja) =====
INSERT INTO movimientos_caja(vendedor_id,tipo,monto,descripcion,metodo,categoria,fecha) VALUES
 ('00000000-0000-0000-0000-000000000002','apertura',2000,'Apertura de turno','efectivo','caja',now()-interval '3 hours');

-- ===== Precios por nivel (columnas G1): crédito ~6% sobre público; subdistribuidor = mayoreo =====
-- (las ventas a crédito y el doble precio del catálogo necesitan precio_credito != 0)
UPDATE productos SET precio_credito = round(precio_publico * 1.06, 2),
                     precio_subdistribuidor = precio_mayoreo
WHERE precio_credito = 0;

-- ===== Continuar las secuencias de folio tras lo sembrado (ventas nuevas → V-0015…, abonos → P-0003…) =====
SELECT setval('seq_folio_venta', 14);
SELECT setval('seq_folio_abono', 2);

-- ===== Evaluar morosos (marca c0004 como bloqueada para crédito) =====
SELECT fn_evaluar_clientes_morosos();
`;
