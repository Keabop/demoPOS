import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtMXN } from '../format';
import { getConfig } from '../configNegocio';
import { numeroALetras } from '../numeroEnLetras';
import { cargarLogo, dibujarLogo, entregarPDF, type ModoEntrega } from './pdfBase';
import { TASA_MORA_MENSUAL } from '../interes';

export interface NotaPagarePartida {
  cantidad: number;
  unidad: string;   // unidad de medida (p.ej. "Litro", "costal 20kg")
  descripcion: string;
  ivaPct: number;   // % por línea (0, 16, …)
  iepsPct: number;  // % por línea (0, 6, 7, 9)
  pu: number;
  importe: number;
}

export interface NotaPagareModel {
  folio: string;
  claveCliente: string;
  cliente: { nombre: string; direccion?: string };
  fechaEmision: string;
  fechaLimite: string;
  partidas: NotaPagarePartida[];
  totalPiezas: number;
  subtotal: number;
  iva: number;
  ieps: number;
  total: number;
}

// Paleta sobria (mismos tonos que el resto de documentos).
const TINTA: [number, number, number] = [20, 25, 26];
const GRIS: [number, number, number] = [120, 130, 126];
const LINEA: [number, number, number] = [175, 182, 176];

/**
 * Construye el PDF de la Nota de Venta a Crédito + Pagaré con el diseño tipo "remisión":
 * encabezado con caja de folio, caja de datos del cliente, tabla de detalle (con Unidad),
 * importe con letra + observaciones, caja de totales, y el bloque del pagaré.
 * Se separa del entregarPDF para poder renderizarlo/probarlo de forma aislada.
 */
export async function construirNotaPagarePDF(m: NotaPagareModel): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const cfg = getConfig();
  const logo = await cargarLogo();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;             // margen
  const right = W - M;      // borde derecho útil

  // ===================== ENCABEZADO =====================
  // Logo (o nombre del negocio) arriba a la izquierda.
  dibujarLogo(doc, logo, M, 28, 78, 46);

  // Datos del negocio, a la derecha del logo.
  const bx = M + 92;
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(cfg.responsable, bx, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`RFC: ${cfg.rfc}`, bx, 52);
  doc.text(cfg.direccion, bx, 63, { maxWidth: 250 });
  doc.text(`C.P. ${cfg.cp} · ${cfg.ciudad}`, bx, 84);
  doc.text(`Tel: ${cfg.telPagare}`, bx, 95);

  // Caja de folio (arriba a la derecha), estilo "REMISIÓN".
  const rbW = 150, rbX = right - rbW, rbY = 28;
  doc.setFillColor(...TINTA);
  doc.rect(rbX, rbY, rbW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('NOTA DE CRÉDITO', rbX + rbW / 2, rbY + 12.5, { align: 'center' });
  doc.setDrawColor(...TINTA);
  doc.rect(rbX, rbY + 18, rbW, 42);
  doc.setTextColor(...TINTA);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold'); doc.text('FOLIO:', rbX + 8, rbY + 35);
  doc.setFont('helvetica', 'normal'); doc.text(String(m.folio), rbX + rbW - 8, rbY + 35, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.text('FECHA:', rbX + 8, rbY + 52);
  doc.setFont('helvetica', 'normal'); doc.text(m.fechaEmision, rbX + rbW - 8, rbY + 52, { align: 'right' });

  // ===================== CAJA DATOS DEL CLIENTE =====================
  let y = 116;
  const boxTop = y;
  doc.setDrawColor(...LINEA);
  doc.setFontSize(9);
  const fila = (label: string, valor: string, yy: number) => {
    doc.setTextColor(...GRIS); doc.setFont('helvetica', 'bold'); doc.text(label, M + 10, yy);
    doc.setTextColor(...TINTA); doc.setFont('helvetica', 'normal');
    doc.text(valor || '—', M + 128, yy, { maxWidth: W - 2 * M - 138 });
  };
  y += 18; fila('CLIENTE:', m.cliente.nombre, y);
  y += 15; fila('CLAVE CLIENTE:', m.claveCliente, y);
  y += 15; fila('DOMICILIO:', m.cliente.direccion ?? '—', y);
  y += 15; fila('FECHA LÍM. DE PAGO:', m.fechaLimite, y);
  y += 10;
  doc.rect(M, boxTop, W - 2 * M, y - boxTop);

  // ===================== TABLA DE DETALLE =====================
  y += 18;
  autoTable(doc, {
    startY: y,
    head: [['CANT.', 'UNIDAD', 'CONCEPTO / DESCRIPCIÓN', 'IVA %', 'IEPS %', 'P. UNIT.', 'IMPORTE']],
    body: m.partidas.map((p) => [
      p.cantidad.toFixed(2), p.unidad, p.descripcion,
      `${p.ivaPct}%`, `${p.iepsPct}%`, fmtMXN(p.pu), fmtMXN(p.importe),
    ]),
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: LINEA, lineWidth: 0.5, textColor: TINTA },
    headStyles: { fillColor: [238, 240, 238], textColor: TINTA, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'right', cellWidth: 40 },
      1: { halign: 'center', cellWidth: 56 },
      2: { halign: 'left' },
      3: { halign: 'right', cellWidth: 40 },
      4: { halign: 'right', cellWidth: 44 },
      5: { halign: 'right', cellWidth: 62 },
      6: { halign: 'right', cellWidth: 70 },
    },
    margin: { left: M, right: M },
    theme: 'grid',
  });
  let fy = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;

  // ===================== IMPORTE CON LETRA / OBSERVACIONES (izq) + TOTALES (der) =====================
  fy += 12;
  const totW = 175;
  const leftW = W - 2 * M - totW - 12;

  // Importe con letra
  doc.setDrawColor(...LINEA);
  doc.rect(M, fy, leftW, 32);
  doc.setTextColor(...GRIS); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('IMPORTE CON LETRA', M + 6, fy + 11);
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(numeroALetras(m.total), M + 6, fy + 23, { maxWidth: leftW - 12 });

  // Observaciones
  doc.rect(M, fy + 32, leftW, 28);
  doc.setTextColor(...GRIS); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('OBSERVACIONES', M + 6, fy + 43);
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('No se aceptan devoluciones ni cambios de mercancía.', M + 6, fy + 54, { maxWidth: leftW - 12 });

  // Caja de totales
  const tx = W - M - totW;
  doc.rect(tx, fy, totW, 60);
  const totRow = (label: string, valor: string, yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...TINTA);
    doc.text(label, tx + 8, yy);
    doc.text(valor, W - M - 8, yy, { align: 'right' });
  };
  doc.setFontSize(9);
  totRow('SUBTOTAL:', fmtMXN(m.subtotal), fy + 14);
  totRow('I.E.P.S.:', fmtMXN(m.ieps), fy + 28);
  totRow('I.V.A.:', fmtMXN(m.iva), fy + 42);
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.8);
  doc.line(tx, fy + 47, tx + totW, fy + 47);
  doc.setLineWidth(0.2);
  doc.setFontSize(11);
  totRow('TOTAL:', fmtMXN(m.total), fy + 57, true);

  // Total de piezas (debajo de la caja izquierda)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TINTA);
  doc.text(`TOTAL DE PIEZAS: ${m.totalPiezas}`, M, fy + 74);

  // ===================== PAGARÉ =====================
  let py = fy + 96;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TINTA);
  doc.text('PAGARÉ', M, py);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('(Documento Original)', M + 58, py);

  // No. y Bueno por (derecha)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`No. ${m.folio}`, right - 250, py);
  doc.rect(right - 165, py - 13, 165, 18);
  doc.text('BUENO POR $', right - 160, py);
  doc.setFont('helvetica', 'normal');
  doc.text(fmtMXN(m.total), right - 8, py, { align: 'right' });

  py += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`${cfg.ciudad}, a ${m.fechaEmision}`, M, py);

  py += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const textoLegal =
    `Debo(emos) y pagaré(mos) incondicionalmente por este pagaré a ${cfg.responsable} en la ciudad de ${cfg.ciudad} o en ` +
    `cualquier otra que se me (nos) requiera de pago, en la fecha de: ${m.fechaLimite}. La cantidad de ${fmtMXN(m.total)} ` +
    `(${numeroALetras(m.total)}) correspondiente al importe de mercancías y/o servicios que he recibido de conformidad con ` +
    `el artículo 11 y demás relativos. Me obligo incondicionalmente a pagar el importe de este pagaré aun cuando sea ` +
    `aceptado en mi nombre y representación por empleados o dependencia de mi negocio. El presente pagaré es sin protesto, ` +
    `en caso de mora el pago se cubrirá más intereses a la tasa de ${TASA_MORA_MENSUAL * 100}% mensual.`;
  doc.text(textoLegal, M, py, { maxWidth: W - 2 * M, lineHeightFactor: 1.45 });

  py += 86;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Nombre y datos del deudor:', M, py);
  doc.setFont('helvetica', 'normal');
  py += 16; doc.text(`Nombre: ${m.cliente.nombre}`, M, py);
  py += 14; doc.text(`Dirección: ${m.cliente.direccion ?? '—'}`, M, py, { maxWidth: W - 2 * M - 210 });

  // Línea para nombre y firma del deudor (derecha)
  doc.setDrawColor(...TINTA);
  doc.line(right - 210, py + 4, right - 20, py + 4);
  doc.setFontSize(8.5);
  doc.text('Nombre y firma', right - 115, py + 16, { align: 'center' });

  // Pie
  doc.setTextColor(...GRIS); doc.setFontSize(8);
  doc.text('Hoja 1', right, H - 28, { align: 'right' });

  return doc;
}

export async function exportarNotaPagarePDF(m: NotaPagareModel, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = await construirNotaPagarePDF(m);
  entregarPDF(doc, `nota-credito-${m.folio}.pdf`, modo);
}
