import type jsPDF from 'jspdf';
import { getConfig } from '../configNegocio';

export const VERDE: [number, number, number] = [57, 145, 102];

export type ModoEntrega = 'descargar' | 'imprimir';

/**
 * Entrega un PDF ya construido: lo descarga o lo abre para imprimir.
 * - 'descargar' (default): dispara la descarga del archivo (doc.save).
 * - 'imprimir': abre el PDF en una pestaña nueva y lanza el diálogo de impresión.
 *   Si el navegador bloquea el popup, degrada a descarga para no perder el documento.
 */
export function entregarPDF(doc: jsPDF, nombre: string, modo: ModoEntrega = 'descargar'): void {
  if (modo === 'imprimir') {
    const url = doc.output('bloburl') as unknown as string;
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.focus();
        win.print();
      });
      return;
    }
    // Popup bloqueado: degradar a descarga.
  }
  doc.save(nombre);
}

/** Carga el logo de public/ como dataURL; devuelve null si no está disponible. */
export async function cargarLogo(): Promise<string | null> {
  try {
    const resp = await fetch(getConfig().logoUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Dibuja el logo (o, si no está disponible, el texto "AGROMAR") alineado a la derecha
 * dentro del rectángulo (x, y, w, h).
 */
export function dibujarLogo(doc: jsPDF, logo: string | null, x: number, y: number, w = 120, h = 48): void {
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', x, y, w, h);
      return;
    } catch {
      /* fallback al texto */
    }
  }
  doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(getConfig().nombre, x + w, y + 28, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}
