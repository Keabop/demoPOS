// Exportación del Estado de Cuenta de un cliente a PDF y Excel (en el navegador).
// Recibe un modelo ya calculado por el componente; no consulta la BD ni calcula nada.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { fmtMXN } from './format';
import { cargarLogo, dibujarLogo, VERDE, entregarPDF, type ModoEntrega } from './pdf/pdfBase';
import { getConfig } from './configNegocio';

export type StatusNota = 'VENCIDA' | 'AL CORRIENTE' | 'PAGADA';

export interface AbonoExport {
  fecha: string;
  metodo: string;
  monto: number;
}

export interface NotaExport {
  remision: string;
  fecha: string;
  fecVen: string;
  total: number;
  saldo: number;
  diasAtraso: number;
  status: StatusNota;
  abonos: AbonoExport[];
}

export interface EstadoCuentaModel {
  cliente: { id: string; nombre: string; rancho?: string; telefono?: string };
  kpis: { diasCredito: number; totalVencido: number; totalNotas: number; saldoPorCobrar: number };
  notas: NotaExport[];
  /** Fecha legible de generación, pasada desde el componente (evita Date en módulos puros). */
  generadoEn: string;
}

function nombreArchivo(m: EstadoCuentaModel, ext: string): string {
  const slug = m.cliente.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `estado-cuenta-${slug || m.cliente.id}.${ext}`;
}

export async function exportarEstadoCuentaPDF(m: EstadoCuentaModel, modo: ModoEntrega = 'descargar'): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const DATOS_NEGOCIO = getConfig();
  const logo = await cargarLogo();

  // Encabezado con logo + identidad de marca (consistente con los demás documentos).
  dibujarLogo(doc, logo, 40, 28, 92, 46);
  doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(DATOS_NEGOCIO.nombre, 144, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 130, 126);
  doc.text(DATOS_NEGOCIO.descripcion, 144, 60, { maxWidth: 380 });
  doc.text(DATOS_NEGOCIO.direccion, 144, 72, { maxWidth: 380 });

  doc.setTextColor(20, 25, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ESTADO DE CUENTA — CUENTAS POR COBRAR', 40, 100);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Cliente: ${m.cliente.nombre}`, 40, 122);
  let y = 122;
  if (m.cliente.rancho) {
    y += 14;
    doc.text(`Rancho: ${m.cliente.rancho}`, 40, y);
  }
  if (m.cliente.telefono) {
    y += 14;
    doc.text(`Teléfono: ${m.cliente.telefono}`, 40, y);
  }
  y += 14;
  doc.text(`Generado: ${m.generadoEn}`, 40, y);
  y += 16;
  doc.text(
    `Días de crédito: ${m.kpis.diasCredito}    Total vencido: ${fmtMXN(m.kpis.totalVencido)}    Total notas: ${fmtMXN(m.kpis.totalNotas)}`,
    40,
    y,
  );

  autoTable(doc, {
    startY: y + 14,
    head: [['DÍAS ATRASO', 'REMISIÓN', 'FECHA', 'FEC. VEN.', 'SALDO', 'STATUS']],
    body: m.notas.map((n) => [
      String(n.diasAtraso),
      n.remision,
      n.fecha,
      n.fecVen,
      fmtMXN(n.saldo),
      n.status,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [57, 145, 102], halign: 'left' },
    columnStyles: { 4: { halign: 'right' } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`SALDO POR COBRAR: ${fmtMXN(m.kpis.saldoPorCobrar)}`, 40, finalY + 26);

  entregarPDF(doc, nombreArchivo(m, 'pdf'), modo);
}

export function exportarEstadoCuentaExcel(m: EstadoCuentaModel): void {
  const filas = m.notas.map((n) => ({
    'Días atraso': n.diasAtraso,
    Remisión: n.remision,
    Fecha: n.fecha,
    'Fec. Ven.': n.fecVen,
    Total: n.total,
    Saldo: n.saldo,
    Status: n.status,
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      [],
      ['Cliente', m.cliente.nombre],
      ['Días de crédito', m.kpis.diasCredito],
      ['Total vencido', m.kpis.totalVencido],
      ['Total notas', m.kpis.totalNotas],
      ['Saldo por cobrar', m.kpis.saldoPorCobrar],
      ['Generado', m.generadoEn],
    ],
    { origin: -1 },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');
  XLSX.writeFile(wb, nombreArchivo(m, 'xlsx'));
}
