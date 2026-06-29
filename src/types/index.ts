import type { Permisos } from '../lib/capacidades';

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'vendedor' | 'visitante'; // capa de seguridad (rige la RLS)
  etiqueta?: string;            // nombre visible del perfil (p.ej. "Técnico", "Ventas")
  plantilla?: string | null;    // preset de origen (administrador/vendedor/tecnico/ventas/personalizado)
  permisos?: Partial<Permisos>; // banderas de capacidades de UI
  activo?: boolean; // false = cuenta desactivada (soft-delete); conserva su historial
  creado_en?: string;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precio_publico: number;           // = "Contado" (precio base)
  precio_mayoreo: number;           // legado, inerte (el POS ya no lo usa)
  precio_credito?: number;          // precio para ventas a crédito / clientes de crédito
  precio_subdistribuidor?: number;  // precio para clientes subdistribuidor
  tasa_iva: number;
  tasa_ieps?: number;               // IEPS como fracción (0.06 = 6%), fijo por producto
  costo: number; // costo de compra de referencia (MXN), para valuación a costo
  stock: number;
  stock_minimo: number;
  activo?: boolean; // false = descontinuado (soft-delete); conserva su historial
  creado_en?: string;
  img?: string; // temporal de maqueta
}

export interface Lote {
  id: string;
  producto_id: string;
  lote_no: string;
  stock_lote: number;
  costo?: number; // costo de compra unitario real de este lote (MXN)
  fecha_caducidad?: string;
  fecha_entrada?: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  rancho?: string;
  telefono?: string;
  lada?: string; // código de país del teléfono (default '52' México)
  limite_credito: number;
  saldo_deudor: number;
  activo_para_credito: boolean;
  dias_credito?: number;
  numero_cliente?: number; // correlativo visible ("Cliente #N"); lo asigna la BD
  nivel_precio?: 'contado' | 'credito' | 'subdistribuidor'; // nivel de precio por defecto del cliente
  creado_en?: string;
  exento_bloqueo?: boolean; // excepción permanente del bloqueo automático por morosidad
  archivado?: boolean; // borrado lógico: fuera de listados/venta, conserva historial
  notas?: number; // temporal de maqueta
  ultima?: string; // temporal de maqueta
}

export interface Venta {
  id: string;
  folio: string;
  cliente_id?: string | null;
  vendedor_id: string;
  tipo_pago: 'efectivo' | 'tarjeta' | 'debito' | 'transferencia' | 'credito';
  subtotal: number;
  iva: number;
  ieps?: number;
  total: number;
  estado: 'cobrada' | 'pendiente' | 'cancelada' | 'devuelta';
  tiene_devolucion_parcial?: boolean;
  plazo_dias?: number;
  nivel_precio?: string;
  fecha?: string;
}

export interface DetalleVenta {
  id: string;
  venta_id: string;
  producto_id: string;
  lote_id?: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  ieps?: number;
}

export interface MovimientoCaja {
  id: string;
  vendedor_id: string;
  tipo: 'apertura' | 'ingreso' | 'egreso' | 'venta' | 'abono';
  monto: number;
  descripcion?: string;
  metodo?: 'efectivo' | 'transferencia' | 'tarjeta' | 'debito' | null; // M1: método de pago del movimiento
  categoria?: 'caja' | 'banco' | null; // M1: 'caja' = efectivo físico · 'banco' = no-efectivo
  venta_id?: string | null; // M1: venta que originó el movimiento (1:1)
  pago_id?: string | null; // M1: abono que originó el movimiento (1:1)
  es_corte?: boolean; // TRUE si el movimiento es un corte/cierre de turno
  fecha?: string;
}

export interface PagoCredito {
  id: string;
  venta_id: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'debito';
  fecha?: string;
  folio_pago: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  rfc?: string;
  local?: boolean;       // proveedor local (Irapuato): compra directa, sin PDF de orden
  activo?: boolean;
  creado_en?: string;
}

export type EstadoOrden = 'borrador' | 'enviada' | 'recibida' | 'cancelada';
export type TipoOrden = 'formal' | 'local';
export type MetodoPagoCompra = 'contado' | 'credito';

export interface OrdenCompra {
  id: string;
  folio: string;
  proveedor_id: string;
  estado: EstadoOrden;
  tipo?: TipoOrden;                  // 'formal' (OC con PDF) | 'local' (compra directa)
  folio_proveedor?: string | null;   // folio del documento del comercio (remisión/pagaré)
  metodo_pago?: MetodoPagoCompra | null; // null en formales
  fecha?: string;
  fecha_recepcion?: string | null;
  fecha_vencimiento?: string | null; // si la compra local es a crédito
  tasa_iva: number;
  subtotal: number;
  iva: number;
  ieps?: number;                     // IEPS total de la compra (locales)
  total: number;
  saldo_proveedor?: number;          // lo que le debemos al proveedor (cuentas por pagar)
  instrucciones?: string;
  creado_por?: string | null;
  creado_en?: string;
}

export interface OrdenCompraDetalle {
  id: string;
  orden_id: string;
  producto_id: string;
  descripcion?: string;
  presentacion?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tasa_ieps?: number;                // IEPS de la línea (fracción, 0.06 = 6%)
  ieps?: number;                     // monto de IEPS de la línea
}

export interface PagoProveedor {
  id: string;
  orden_id: string;
  monto: number;
  metodo: string;
  folio: string;
  fecha?: string;
  creado_en?: string;
}

// ── Reportes (datos ya agregados en el servidor vía RPC) ──────────────
export interface ReporteVentasKpis {
  total: number; count: number; ticket: number; productos: number; credito: number; clientes: number;
}
export interface ReporteVentasSerie {
  label: string; total: number; count: number; productos: number; credito: number; clientes: number;
}
export interface ReporteVentasData {
  kpis: ReporteVentasKpis;
  kpis_prev: ReporteVentasKpis;
  serie: ReporteVentasSerie[];
  metodos_pago: { id: string; total: number }[];
  top_productos: { nombre: string; total: number }[];
  por_categoria: { cat: string; total: number }[];
  por_vendedor: { vendedor_id: string | null; nombre: string; count: number; total: number }[];
}

export interface ReporteCobranzaDeudor {
  id: string; nombre: string; saldo: number; vencido: number; maxAtraso: number; hasOverdue: boolean;
}
export interface ReporteCobranzaData {
  kpis: { carteraTotal: number; vencido: number; porVencer30: number; facturasPorVencer: number;
          recuperacion: number; totalAbonado: number; morosos: number; cuentasActivas: number };
  kpis_prev: { carteraTotal: number; vencido: number; morosos: number };
  spark: { cartera: number[]; vencido: number[]; recup: number[]; morosos: number[] };
  evolucion: { label: string; value: number }[];
  aging: { corriente: number; r1_30: number; r31_60: number; r60p: number };
  top_deudores: ReporteCobranzaDeudor[];
  tabla_clientes: (ReporteCobranzaDeudor & { badge: 'red' | 'amber' | 'green' })[];
}

export interface ReporteInventarioData {
  kpis: { valuation: number; estimados: number; expiringCount: number; expiringValue: number; lowStock: number; skus: number };
  por_categoria: { cat: string; total: number }[];
  expiry: { mes: number; anio: number; count: number; value: number }[];
  rotacion: { cat: string; ratio: number; vendido: number }[];
  criticos: { id: string; nombre: string; categoria: string; stock: number; minimo: number;
              caducidad: string | null; estado: 'critico' | 'bajo' | 'caducar' }[];
}

export interface ReporteCajaShift {
  id: string; vendedorName: string; vendedorId: string | null;
  aperturaFecha: string; cierreFecha: string | null;
  openingCash: number; countedCash: number; expectedCash: number; discrepancy: number;
  manualIngresos: number; manualEgresos: number; salesTotal: number; abonosTotal: number;
  efectivoSistema: number; durationMs: number | null; isClosed: boolean;
}
export interface ReporteCajaData {
  stats: { fondos: number; ventas: number; abonos: number; ingresosManual: number; egresos: number;
           enCaja: number; ingresosTotales: number; netDiscrepancy: number; ventaCount: number };
  shifts: ReporteCajaShift[];
  hourly: { hour: number; total: number }[];
  table_shift: { vendedorName: string; isActive: boolean } | null;
  table_movimientos: { id: string; tipo: string; fecha: string; monto: number;
                       descripcion: string | null; es_corte: boolean; categoria: string | null }[];
}
