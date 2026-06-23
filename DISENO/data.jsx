// Shared data — Mexican agricultural products, realistic peso pricing
const fmtMXN = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMXN0 = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PRODUCTS = [
  { id: 'P001', sku: '7501034501203', name: 'Semilla de Maíz Híbrido',     unit: 'costal 20kg', price: 1850.00, stock: 42,  min: 10, cat: 'Semillas',     img: 'M' },
  { id: 'P002', sku: '7501034502910', name: 'Fertilizante NPK 17-17-17',   unit: 'costal 50kg', price:  890.00, stock: 78,  min: 20, cat: 'Fertilizantes', img: 'F' },
  { id: 'P003', sku: '7501034503112', name: 'Herbicida Glifosato 1L',      unit: 'botella 1L',  price:  245.00, stock: 6,   min: 12, cat: 'Agroquímicos', img: 'H' },
  { id: 'P004', sku: '7501034504339', name: 'Semilla de Frijol Negro',     unit: 'costal 25kg', price:  980.00, stock: 28,  min: 8,  cat: 'Semillas',     img: 'S' },
  { id: 'P005', sku: '7501034505014', name: 'Urea Granular 46%',           unit: 'costal 50kg', price:  720.00, stock: 65,  min: 25, cat: 'Fertilizantes', img: 'U' },
  { id: 'P006', sku: '7501034506447', name: 'Insecticida Cipermetrina 1L', unit: 'botella 1L',  price:  385.00, stock: 18,  min: 10, cat: 'Agroquímicos', img: 'I' },
  { id: 'P007', sku: '7501034507280', name: 'Fertilizante Triple 17',      unit: 'costal 50kg', price:  865.00, stock: 4,   min: 15, cat: 'Fertilizantes', img: 'T' },
  { id: 'P008', sku: '7501034508997', name: 'Semilla de Sorgo Forrajero',  unit: 'costal 20kg', price: 1420.00, stock: 22,  min: 6,  cat: 'Semillas',     img: 'S' },
  { id: 'P009', sku: '7501034509871', name: 'Fungicida Mancozeb 1kg',      unit: 'bolsa 1kg',   price:  295.00, stock: 31,  min: 10, cat: 'Agroquímicos', img: 'F' },
  { id: 'P010', sku: '7501034510772', name: 'Foliar Crecimiento 1L',       unit: 'botella 1L',  price:  185.00, stock: 47,  min: 12, cat: 'Agroquímicos', img: 'C' },
  { id: 'P011', sku: '7501034511113', name: 'Maíz Blanco Grano',           unit: 'costal 50kg', price:  580.00, stock: 92,  min: 30, cat: 'Granos',       img: 'M' },
  { id: 'P012', sku: '7501034512221', name: 'Frijol Pinto Saltillo',       unit: 'costal 25kg', price:  750.00, stock: 35,  min: 12, cat: 'Granos',       img: 'P' },
  { id: 'P013', sku: '7501034513008', name: 'Sulfato de Amonio',           unit: 'costal 50kg', price:  640.00, stock: 51,  min: 20, cat: 'Fertilizantes', img: 'A' },
  { id: 'P014', sku: '7501034514772', name: 'Semilla de Alfalfa',          unit: 'bolsa 5kg',   price:  890.00, stock: 14,  min: 6,  cat: 'Semillas',     img: 'A' },
  { id: 'P015', sku: '7501034515119', name: 'Adherente Agrícola 1L',       unit: 'botella 1L',  price:  120.00, stock: 38,  min: 10, cat: 'Agroquímicos', img: 'A' },
  { id: 'P016', sku: '7501034516023', name: 'Cal Agrícola Dolomita',       unit: 'costal 25kg', price:  185.00, stock: 8,   min: 15, cat: 'Suelos',       img: 'C' },
];

const CLIENTS = [
  { id: 'C001', name: 'Roberto Hernández Cortés',     rancho: 'Rancho La Esperanza',    phone: '442 318 5520', status: 'al-corriente', credito: 0,        limite: 25000, notas: 12, ultima: '2026-05-08' },
  { id: 'C002', name: 'María de la Luz Vázquez',      rancho: 'Parcela El Sabino',      phone: '442 184 9933', status: 'vencida',      credito: 8650.00,  limite: 15000, notas: 4,  ultima: '2026-04-02' },
  { id: 'C003', name: 'Agropecuaria San Miguel SA',   rancho: 'Galpón San Miguel #4',   phone: '442 220 1147', status: 'al-corriente', credito: 12400.00, limite: 80000, notas: 38, ultima: '2026-05-11' },
  { id: 'C004', name: 'Ignacio Pérez García',          rancho: 'Rancho Los Olivos',     phone: '442 405 7728', status: 'al-corriente', credito: 0,        limite: 20000, notas: 22, ultima: '2026-05-10' },
  { id: 'C005', name: 'Cooperativa Los Robles',       rancho: 'Ej. Los Robles, Lote 8', phone: '442 612 0084', status: 'vencida',      credito: 15280.00, limite: 30000, notas: 9,  ultima: '2026-03-28' },
  { id: 'C006', name: 'Jesús Ramírez Aguilar',        rancho: 'Predio La Joya',         phone: '442 778 2210', status: 'al-corriente', credito: 0,        limite: 18000, notas: 17, ultima: '2026-05-06' },
  { id: 'C007', name: 'Manuela Torres Salas',         rancho: 'Rancho El Vergel',       phone: '442 991 3318', status: 'al-corriente', credito: 3200.00,  limite: 12000, notas: 6,  ultima: '2026-05-09' },
  { id: 'C008', name: 'Eduardo Mendoza Beltrán',      rancho: 'Parcela 27, La Cañada',  phone: '442 552 8841', status: 'pronto-vence', credito: 6840.00,  limite: 22000, notas: 14, ultima: '2026-04-22' },
];

const WEEK_SALES = [
  { d: 'L',  v: 18420 }, { d: 'M', v: 22150 }, { d: 'M', v: 19880 },
  { d: 'J',  v: 27310 }, { d: 'V', v: 31250 }, { d: 'S', v: 38940 }, { d: 'D', v: 14210 },
];

const RECENT_SALES = [
  { folio: 'V-04812', cliente: 'Ignacio Pérez García',     tipo: 'Contado',   total: 2730.00, hora: '14:22' },
  { folio: 'V-04811', cliente: 'Venta Anónima',            tipo: 'Contado',   total:  865.00, hora: '14:08' },
  { folio: 'V-04810', cliente: 'Agropecuaria San Miguel',  tipo: 'Crédito',   total: 6420.00, hora: '13:47' },
  { folio: 'V-04809', cliente: 'Roberto Hernández',        tipo: 'Contado',   total: 1850.00, hora: '13:14' },
  { folio: 'V-04808', cliente: 'Venta Anónima',            tipo: 'Contado',   total:  245.00, hora: '12:55' },
];

const CREDIT_NOTE = {
  folio: 'NC-2026-0184',
  fecha: '2026-04-12',
  vence: '2026-05-12',
  cliente: CLIENTS[1],
  items: [
    { name: 'Semilla de Maíz Híbrido',     qty: 2, unit: 'costal 20kg', price: 1850.00 },
    { name: 'Fertilizante NPK 17-17-17',   qty: 3, unit: 'costal 50kg', price:  890.00 },
    { name: 'Herbicida Glifosato 1L',      qty: 6, unit: 'botella 1L',  price:  245.00 },
  ],
  pagos: [
    { fecha: '2026-04-20', monto: 2000.00, metodo: 'Efectivo', folio: 'P-2189' },
    { fecha: '2026-05-01', monto: 1500.00, metodo: 'Transferencia', folio: 'P-2231' },
  ],
};

const MOVEMENTS = [
  { fecha: 'Hoy 14:08',  tipo: 'salida',  prod: 'Fertilizante NPK 17-17-17', qty: 2, ref: 'V-04811' },
  { fecha: 'Hoy 12:30',  tipo: 'entrada', prod: 'Semilla de Maíz Híbrido',   qty: 20, ref: 'Proveedor Bayer' },
  { fecha: 'Ayer 17:42', tipo: 'salida',  prod: 'Urea Granular 46%',         qty: 5, ref: 'V-04792' },
  { fecha: 'Ayer 09:15', tipo: 'entrada', prod: 'Herbicida Glifosato 1L',    qty: 12, ref: 'Proveedor Syngenta' },
  { fecha: '10 May',     tipo: 'salida',  prod: 'Frijol Pinto Saltillo',     qty: 3, ref: 'V-04778' },
];

Object.assign(window, { fmtMXN, fmtMXN0, PRODUCTS, CLIENTS, WEEK_SALES, RECENT_SALES, CREDIT_NOTE, MOVEMENTS });
