import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtMXN } from '../format';
import { getConfig } from '../configNegocio';
import { VERDE, cargarLogo, dibujarLogo, entregarPDF, type ModoEntrega } from './pdfBase';

export interface OrdenCompraPDFPartida {
  descripcion: string;
  cantidad: number;
  presentacion: string;
  precioUnitario: number;
  total: number;
}

export interface OrdenCompraPDFModel {
  folio: string;
  fecha: string;
  proveedor: { nombre: string; direccion?: string; contacto?: string; telefono?: string };
  partidas: OrdenCompraPDFPartida[];
  subtotal: number;
  iva: number;
  tasaIva: number;
  total: number;
  instrucciones?: string;
}

export async function exportarOrdenCompraPDF(m: OrdenCompraPDFModel, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const DATOS_NEGOCIO = getConfig();
  const logo = await cargarLogo();
  const W = doc.internal.pageSize.getWidth();

  // Encabezado
  dibujarLogo(doc, logo, 40, 30, 90, 50);
  doc.setTextColor(20, 25, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(DATOS_NEGOCIO.nombre, 140, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 126);
  doc.text(DATOS_NEGOCIO.descripcion, 140, 62);
  doc.text(`${DATOS_NEGOCIO.direccion}`, 140, 74, { maxWidth: 300 });

  doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ORDEN DE COMPRA', W - 40, 44, { align: 'right' });
  doc.setTextColor(20, 25, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`No. ${m.folio}`, W - 40, 62, { align: 'right' });
  doc.text(`Fecha: ${m.fecha}`, W - 40, 76, { align: 'right' });

  // Proveedor / Dirección de entrega
  let y = 110;
  doc.setDrawColor(231, 227, 216);
  doc.line(40, y, W - 40, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PROVEEDOR', 40, y);
  doc.text('DIRECCIÓN DE ENTREGA', W / 2 + 10, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  y += 14;
  doc.text(m.proveedor.nombre, 40, y, { maxWidth: W / 2 - 60 });
  doc.text(DATOS_NEGOCIO.nombre, W / 2 + 10, y);
  y += 12;
  if (m.proveedor.direccion) { doc.text(m.proveedor.direccion, 40, y, { maxWidth: W / 2 - 60 }); }
  doc.text(DATOS_NEGOCIO.direccion, W / 2 + 10, y, { maxWidth: W / 2 - 50 });
  y += 12;
  const contactoProv = [m.proveedor.contacto, m.proveedor.telefono].filter(Boolean).join(' · ');
  if (contactoProv) doc.text(contactoProv, 40, y, { maxWidth: W / 2 - 60 });
  doc.text(`Tel: ${DATOS_NEGOCIO.telefono}`, W / 2 + 10, y + 12);

  autoTable(doc, {
    startY: y + 28,
    head: [['Descripción', 'Cantidad', 'Presentación', 'Precio unitario', 'TOTALES']],
    body: m.partidas.map((p) => [p.descripcion, String(p.cantidad), p.presentacion, fmtMXN(p.precioUnitario), fmtMXN(p.total)]),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: VERDE, halign: 'left' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  let fy = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60;
  fy += 20;
  // Sin IVA: el subtotal coincide con el total, así que mostramos solo el TOTAL.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`TOTAL: ${fmtMXN(m.total)}`, W - 40, fy, { align: 'right' });

  if (m.instrucciones) {
    fy += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Instrucciones:', 40, fy);
    doc.setFont('helvetica', 'normal');
    doc.text(m.instrucciones, 40, fy + 12, { maxWidth: W - 80 });
  }

  // Firma de autorización
  const sy = Math.max(fy + 70, doc.internal.pageSize.getHeight() - 90);
  doc.setDrawColor(20, 25, 26);
  doc.line(W / 2 - 120, sy, W / 2 + 120, sy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Autorizado por: ${DATOS_NEGOCIO.responsable}`, W / 2, sy + 14, { align: 'center' });

  entregarPDF(doc, `orden-compra-${m.folio}.pdf`, modo);
}
