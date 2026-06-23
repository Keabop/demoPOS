import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtMXN } from '../format';
import { getConfig } from '../configNegocio';
import { numeroALetras } from '../numeroEnLetras';
import { cargarLogo, dibujarLogo, entregarPDF, type ModoEntrega } from './pdfBase';

export interface NotaPagarePartida {
  cantidad: number;
  descripcion: string;
  pu: number;
  importe: number;
}

export interface NotaPagareModel {
  folio: string;
  claveCliente: string;
  cliente: { nombre: string; direccion?: string };
  fechaEmision: string;
  fechaLimite: string;
  atendidoPor: string;
  partidas: NotaPagarePartida[];
  totalPiezas: number;
  total: number;
}

export async function exportarNotaPagarePDF(m: NotaPagareModel, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const DATOS_NEGOCIO = getConfig();
  const logo = await cargarLogo();
  const W = doc.internal.pageSize.getWidth();

  // Encabezado: datos fiscales (izq) + logo (der)
  doc.setTextColor(20, 25, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  let y = 44;
  doc.text(`Resp: ${DATOS_NEGOCIO.responsable}`, 40, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  y += 13; doc.text(`RFC: ${DATOS_NEGOCIO.rfc}`, 40, y);
  y += 13; doc.text(`Dir: ${DATOS_NEGOCIO.direccion}`, 40, y, { maxWidth: 360 });
  y += 13; doc.text(`C.P. ${DATOS_NEGOCIO.cp}`, 40, y);
  y += 13; doc.text(`Tel: ${DATOS_NEGOCIO.telPagare}`, 40, y);
  dibujarLogo(doc, logo, W - 150, 30, 110, 56);

  // Título
  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('NOTA DE VENTA A CRÉDITO', 40, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 126);
  doc.text('Documento Original', W - 40, y, { align: 'right' });
  doc.setTextColor(20, 25, 26);

  // Caja de datos de la nota
  y += 12;
  const boxTop = y;
  doc.setDrawColor(180, 185, 180);
  doc.setFontSize(9);
  const fila = (label: string, valor: string, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 50, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(valor || '—', 200, yy);
  };
  y += 18; fila('FOLIO DE VENTA :', m.folio, y);
  y += 15; fila('CLAVE CLIENTE :', m.claveCliente, y);
  y += 15; fila('CLIENTE:', m.cliente.nombre, y);
  y += 15; fila('DIR CLIENTE:', m.cliente.direccion ?? '—', y);
  y += 15; fila('FECHA LÍM. DE PAGO:', m.fechaLimite, y);
  y += 15; fila('FECHA Y HORA:', m.fechaEmision, y);
  y += 15; fila('ATENDIDO POR:', m.atendidoPor, y);
  y += 10;
  doc.rect(40, boxTop, W - 80, y - boxTop);

  // Detalle de la compra
  y += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Detalle de la Compra', W / 2, y, { align: 'center' });
  autoTable(doc, {
    startY: y + 8,
    head: [['CANTIDAD', 'DESCRIPCIÓN DEL ARTÍCULO', 'PU', 'IMPORTE']],
    body: m.partidas.map((p) => [String(p.cantidad), p.descripcion, fmtMXN(p.pu), fmtMXN(p.importe)]),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [240, 240, 240], textColor: [20, 25, 26], halign: 'left' },
    columnStyles: { 0: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  let fy = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  fy += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`TOTAL DE PIEZAS: ${m.totalPiezas}`, 40, fy);
  doc.text(`TOTAL: ${fmtMXN(m.total)}`, W - 40, fy, { align: 'right' });

  // PAGARÉ
  fy += 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PAGARÉ', 40, fy);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('(Documento Original)', 96, fy);
  fy += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${DATOS_NEGOCIO.ciudad}. a ${m.fechaEmision}`, 40, fy);

  fy += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const textoLegal =
    `Debo (emos) y pagaré (mos) incondicionalmente por este pagaré a ${DATOS_NEGOCIO.responsable} en la ciudad de ` +
    `${DATOS_NEGOCIO.ciudad} o en cualquier otra que se me (nos) requiera de pago, en la fecha de: ${m.fechaLimite}. ` +
    `La cantidad de ${fmtMXN(m.total)} (${numeroALetras(m.total)}) correspondiente al importe de mercancías y/o ` +
    `servicios que he recibido de conformidad. Me obligo incondicionalmente a pagar el importe de este pagaré aun ` +
    `cuando sea aceptado en mi nombre y representación por empleados o dependencia de mi negocio. El presente pagaré ` +
    `es sin protesto; en caso de mora el pago se cubrirá más intereses a la tasa de 0% mensual.`;
  doc.text(textoLegal, 40, fy, { maxWidth: W - 80, lineHeightFactor: 1.4 });

  fy += 88;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Nombre y datos del deudor:', 40, fy);
  doc.setFont('helvetica', 'normal');
  fy += 14; doc.text(`Nombre: ${m.cliente.nombre}`, 40, fy);
  fy += 14; doc.text(`Dirección: ${m.cliente.direccion ?? '—'}`, 40, fy, { maxWidth: W - 220 });

  // Firma del deudor
  doc.setDrawColor(20, 25, 26);
  doc.line(W - 240, fy + 6, W - 60, fy + 6);
  doc.setFontSize(8.5);
  doc.text('FIRMA', W - 150, fy + 18, { align: 'center' });

  entregarPDF(doc, `nota-credito-${m.folio}.pdf`, modo);
}
