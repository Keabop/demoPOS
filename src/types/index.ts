export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'vendedor' | 'visitante';
  activo?: boolean; // false = cuenta desactivada (soft-delete); conserva su historial
  creado_en?: string;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precio_publico: number;
  precio_mayoreo: number;
  tasa_iva: number;
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
  creado_en?: string;
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
  total: number;
  estado: 'cobrada' | 'pendiente' | 'cancelada';
  plazo_dias?: number;
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
  activo?: boolean;
  creado_en?: string;
}

export type EstadoOrden = 'borrador' | 'enviada' | 'recibida' | 'cancelada';

export interface OrdenCompra {
  id: string;
  folio: string;
  proveedor_id: string;
  estado: EstadoOrden;
  fecha?: string;
  fecha_recepcion?: string | null;
  tasa_iva: number;
  subtotal: number;
  iva: number;
  total: number;
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
}
