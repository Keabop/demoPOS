import { getConfig } from '../../lib/configNegocio';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';

export interface TicketLinea {
  cantidad: number;
  nombre: string;
  precioUnitario: number;
  importe: number;
}

export interface TicketData {
  negocio: string;
  rfc: string;
  direccion: string;
  telefono: string;
  logoUrl: string;
  folio: string;
  fecha: string;
  clienteNombre: string | null;
  clienteClave: string | null;
  vendedor: string | null;
  lineas: TicketLinea[];
  subtotal: number;
  ieps: number;
  total: number;
  metodoPago: string;
  efectivoRecibido: number | null;
  cambio: number | null;
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'EFECTIVO',
  tarjeta: 'TARJETA DE CRÉDITO',
  debito: 'TARJETA DE DÉBITO',
  transferencia: 'TRANSFERENCIA',
  credito: 'CRÉDITO',
};

function infoNegocio() {
  const c = getConfig();
  return { negocio: c.nombre, rfc: c.rfc, direccion: c.direccion, telefono: c.telefono, logoUrl: c.logoUrl };
}

export interface VentaNuevaTicket {
  folio: string;
  clientName: string | null;
  clientNumero: number | null;
  cartItems: { qty: number; nombre: string; precioVendido: number }[];
  subtotal: number;
  ieps: number;
  total: number;
  metodoPago: string;
  efectivoRecibido: number | null;
  cambio: number | null;
}

export function ticketDesdeVentaNueva(v: VentaNuevaTicket, vendedor: string, fecha: string): TicketData {
  return {
    ...infoNegocio(),
    folio: v.folio,
    fecha,
    clienteNombre: v.clientName,
    clienteClave: v.clientNumero != null ? String(v.clientNumero) : null,
    vendedor,
    lineas: v.cartItems.map((it) => ({
      cantidad: it.qty,
      nombre: it.nombre,
      precioUnitario: it.precioVendido,
      importe: round2(it.precioVendido * it.qty),
    })),
    subtotal: v.subtotal,
    ieps: v.ieps,
    total: v.total,
    metodoPago: v.metodoPago,
    efectivoRecibido: v.efectivoRecibido,
    cambio: v.cambio,
  };
}

export interface VentaGuardadaTicket {
  folio: string;
  fecha: string;
  tipo_pago: string;
  subtotal: number;
  ieps: number;
  total: number;
}
export interface DetalleTicket {
  cantidad: number;
  nombre: string;
  precio_unitario: number;
  importe: number;
}

export function ticketDesdeVentaGuardada(
  v: VentaGuardadaTicket,
  detalles: DetalleTicket[],
  clienteNombre: string | null,
  clienteClave: string | null,
  vendedor: string | null,
): TicketData {
  return {
    ...infoNegocio(),
    folio: v.folio,
    fecha: v.fecha,
    clienteNombre,
    clienteClave,
    vendedor,
    lineas: detalles.map((d) => ({
      cantidad: d.cantidad,
      nombre: d.nombre,
      precioUnitario: d.precio_unitario,
      importe: d.importe,
    })),
    subtotal: v.subtotal,
    ieps: v.ieps,
    total: v.total,
    metodoPago: v.tipo_pago,
    efectivoRecibido: null,
    cambio: null,
  };
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML autocontenido del ticket (réplica del ticket del negocio). Lo usan QZ y el portal de respaldo. */
export function ticketHTML(d: TicketData, anchoMm: number): string {
  const sep = '<div style="border-top:1px dashed #000;margin:4px 0;"></div>';
  const filas = d.lineas
    .map(
      (l) => `<tr>
        <td style="vertical-align:top;padding:1px 2px 1px 0;">${l.cantidad}</td>
        <td style="vertical-align:top;padding:1px 2px;">${esc(l.nombre)}<br><span style="font-size:9px;">${fmtMXN(l.precioUnitario)} c/u</span></td>
        <td style="text-align:right;vertical-align:top;padding:1px 0 1px 2px;white-space:nowrap;">${fmtMXN(l.importe)}</td>
      </tr>`,
    )
    .join('');

  const fila = (k: string, v: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;${bold ? 'font-weight:bold;font-size:13px;' : ''}"><span>${k}</span><span>${v}</span></div>`;

  const logo = d.logoUrl
    ? `<img src="${d.logoUrl}" style="max-width:60%;max-height:60px;object-fit:contain;margin:0 auto 4px;display:block;" />`
    : '';

  const piezas = d.lineas.reduce((s, l) => s + l.cantidad, 0);

  return `<div style="width:${anchoMm}mm;max-width:${anchoMm}mm;box-sizing:border-box;padding:2mm;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.3;color:#000;background:#fff;">
    <div style="text-align:center;">
      ${logo}
      <div style="font-size:15px;font-weight:bold;">${esc(d.negocio)}</div>
      <div style="font-weight:bold;">NOTA DE VENTA</div>
      ${d.rfc ? `<div style="font-size:9px;">RFC: ${esc(d.rfc)}</div>` : ''}
      ${d.direccion ? `<div style="font-size:9px;">${esc(d.direccion)}</div>` : ''}
      ${d.telefono ? `<div style="font-size:9px;">Tel: ${esc(d.telefono)}</div>` : ''}
    </div>
    ${sep}
    ${fila('Folio:', esc(d.folio))}
    ${fila('Fecha:', esc(d.fecha))}
    ${fila('Cliente:', esc(d.clienteNombre || 'Público en general'))}
    ${d.clienteClave ? fila('Clave:', '#' + esc(d.clienteClave)) : ''}
    ${d.vendedor ? fila('Atendió:', esc(d.vendedor)) : ''}
    ${sep}
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="border-bottom:1px solid #000;">
        <th style="text-align:left;">CANT</th>
        <th style="text-align:left;">DESCRIPCIÓN</th>
        <th style="text-align:right;">IMPORTE</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${sep}
    ${d.ieps > 0 ? fila('SUBTOTAL:', fmtMXN(d.subtotal)) : ''}
    ${d.ieps > 0 ? fila('I.E.P.S.:', fmtMXN(d.ieps)) : ''}
    ${fila('TOTAL:', fmtMXN(d.total), true)}
    ${fila('Forma de pago:', METODO_LABEL[d.metodoPago] || d.metodoPago.toUpperCase())}
    ${d.efectivoRecibido != null ? fila('Recibido:', fmtMXN(d.efectivoRecibido)) : ''}
    ${d.cambio != null ? fila('Cambio:', fmtMXN(d.cambio)) : ''}
    ${fila('Piezas:', String(piezas))}
    ${sep}
    <div style="text-align:center;margin-top:4px;font-weight:bold;">¡GRACIAS POR SU COMPRA!</div>
    <div style="text-align:center;font-size:9px;margin-top:2px;">DOCUMENTO NO FISCAL</div>
  </div>`;
}
