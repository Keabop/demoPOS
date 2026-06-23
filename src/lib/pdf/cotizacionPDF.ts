import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtMXN } from '../format';
import { VERDE, cargarLogo, dibujarLogo, entregarPDF, type ModoEntrega } from './pdfBase';
import { getConfig } from '../configNegocio';

export interface CotizacionPartida {
  numero: number;
  unidad: string;
  cantidad: number;
  descripcion: string;
  categoria: string;
  valorUnitario: number;
  total: number;
}

export interface CotizacionModel {
  folio: string;
  fecha: string;
  cliente: { nombre: string; direccion?: string; telefono?: string; contacto?: string; email?: string };
  partidas: CotizacionPartida[];
}

export async function exportarCotizacionPDF(m: CotizacionModel, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const DATOS_NEGOCIO = getConfig();
  const logo = await cargarLogo();
  const W = doc.internal.pageSize.getWidth();

  // Banda de encabezado oscura
  doc.setFillColor(22, 27, 24);
  doc.rect(0, 0, W, 104, 'F');
  // Panel verde a la derecha
  doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.rect(W - 170, 0, 170, 104, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('COTIZACIÓN', 40, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0.7 * 255, 0.85 * 255, 0.7 * 255);
  doc.text(DATOS_NEGOCIO.nombre, 40, 56);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(DATOS_NEGOCIO.descripcion, 40, 72);
  doc.text(`Teléfono: ${DATOS_NEGOCIO.telefono}`, 40, 86);
  doc.text(`e-mail: ${DATOS_NEGOCIO.email}`, 40, 98);

  // Logo (sobre el panel verde) o texto de respaldo
  dibujarLogo(doc, logo, W - 160, 14, 70, 60);

  // Datos de la cotización (panel verde)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('N.º de cotización', W - 84, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(m.folio, W - 84, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Fecha de cotización', W - 84, 72);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(m.fecha, W - 84, 86);

  // Bloque del cliente
  doc.setTextColor(0, 0, 0);
  let y = 132;
  doc.setFontSize(9);
  const filaCliente = (label: string, valor: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 130, 126);
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 25, 26);
    doc.text(valor || '—', x + 70, yy);
  };
  filaCliente('Cliente', m.cliente.nombre, 40, y);
  filaCliente('Teléfono', m.cliente.telefono ?? '', 320, y);
  y += 16;
  filaCliente('Dirección', m.cliente.direccion ?? '', 40, y);
  filaCliente('Contacto', m.cliente.contacto ?? '', 320, y);
  y += 16;
  filaCliente('Correo', m.cliente.email ?? '', 40, y);

  autoTable(doc, {
    startY: y + 18,
    head: [['NÚMERO', 'UNIDAD', 'CANTIDAD', 'DESCRIPCIÓN', 'CATEGORÍA', 'VALOR UNITARIO', 'TOTAL']],
    body: m.partidas.map((p) => [
      String(p.numero), p.unidad, String(p.cantidad), p.descripcion, p.categoria, fmtMXN(p.valorUnitario), fmtMXN(p.total),
    ]),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: VERDE, halign: 'left' },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  const totalGeneral = m.partidas.reduce((s, p) => s + p.total, 0);
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`TOTAL: ${fmtMXN(totalGeneral)}`, W - 40, finalY + 28, { align: 'right' });

  entregarPDF(doc, `cotizacion-${m.folio}.pdf`, modo);
}
