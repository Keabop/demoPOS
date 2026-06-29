import type jsPDF from 'jspdf';
import { getConfig } from '../configNegocio';
import { imprimirDocumentoPDF } from '../printing/qz';

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
    // 1) Si hay impresora de documentos configurada y QZ Tray disponible, imprime
    //    directo a ESA impresora (sin diálogo). 2) Si no, abre el PDF y lanza el
    //    diálogo del navegador. 3) Si el popup se bloquea, descarga.
    void (async () => {
      try {
        const base64 = (doc.output('datauristring') as string).split(',')[1] ?? '';
        if (base64 && (await imprimirDocumentoPDF(base64))) return;
      } catch {
        /* cae al respaldo del navegador */
      }
      const url = doc.output('bloburl') as unknown as string;
      const win = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', () => {
          win.focus();
          win.print();
        });
        return;
      }
      doc.save(nombre); // popup bloqueado
    })();
    return;
  }
  doc.save(nombre);
}

/** Carga el logo configurado como dataURL; devuelve null si no hay logo o no está disponible. */
export async function cargarLogo(): Promise<string | null> {
  const url = getConfig().logoUrl;
  if (!url) return null;
  try {
    const resp = await fetch(url);
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
 * Dibuja el logo (o, si no está disponible, el nombre del negocio en texto) alineado a la
 * derecha dentro del rectángulo (x, y, w, h).
 */
export function dibujarLogo(doc: jsPDF, logo: string | null, x: number, y: number, w = 120, h = 48): void {
  if (logo) {
    try {
      // Escala conservando la proporción NATURAL del logo dentro de la caja (x,y,w,h)
      // para que no salga estirado/alargado. Se ancla a la derecha de la caja.
      const props = doc.getImageProperties(logo);
      const ratio = props.width && props.height ? props.width / props.height : w / h;
      let dw = w;
      let dh = w / ratio;
      if (dh > h) { dh = h; dw = h * ratio; }
      const dx = x + (w - dw); // alineado a la derecha de la caja
      const dy = y + (h - dh) / 2; // centrado vertical
      doc.addImage(logo, 'PNG', dx, dy, dw, dh);
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
