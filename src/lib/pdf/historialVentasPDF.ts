import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtMXN } from '../format';
import { getConfig } from '../configNegocio';
import { VERDE, cargarLogo, dibujarLogo, entregarPDF, type ModoEntrega } from './pdfBase';

export interface DatosExportPDF {
  columnas: string[];
  filas: (string | number)[][];
  total: number;
  desde: string;
  hasta: string;
  subtitulo?: string;
}

/** Formatea las columnas monetarias (índices 6,7,8) con fmtMXN; el resto a texto. */
export function formatearBodyPDF(filas: (string | number)[][]): string[][] {
  return filas.map(f => f.map((celda, i) => (i >= 6 ? fmtMXN(Number(celda)) : String(celda))));
}

export async function exportarHistorialPDF(d: DatosExportPDF, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const DATOS_NEGOCIO = getConfig();
  const logo = await cargarLogo();
  const W = doc.internal.pageSize.getWidth();

  // Membrete (mismo lenguaje visual que cotizacionPDF)
  doc.setFillColor(22, 27, 24);
  doc.rect(0, 0, W, 80, 'F');
  doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.rect(W - 170, 0, 170, 80, 'F');
  doc.setTextColor(0.7 * 255, 0.85 * 255, 0.7 * 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(DATOS_NEGOCIO.nombre, 40, 38);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Historial de ventas', 40, 56);
  doc.setFontSize(8.5);
  doc.text(`Periodo: ${d.desde} a ${d.hasta}`, 40, 71);
  if (d.subtitulo) doc.text(d.subtitulo, 300, 71);
  dibujarLogo(doc, logo, W - 160, 12, 70, 56);

  autoTable(doc, {
    startY: 96,
    head: [d.columnas],
    body: formatearBodyPDF(d.filas),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: VERDE, halign: 'left' },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 96;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`TOTAL: ${fmtMXN(d.total)}`, W - 40, finalY + 24, { align: 'right' });

  entregarPDF(doc, `historial-ventas_${d.desde}_${d.hasta}.pdf`, modo);
}
