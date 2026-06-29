import { getConfig } from '../configNegocio';

/**
 * Puente de impresión con QZ Tray (R12). Permite imprimir SIN el diálogo del
 * navegador y eligiendo la impresora por nombre (config en Ajustes):
 * tickets → impresora térmica, documentos → impresora de hojas.
 *
 * QZ Tray es una app local (websocket en localhost) que el negocio instala una vez.
 * Si no está corriendo/instalada, todo cae a un respaldo (window.print / descarga),
 * así que la app nunca se rompe. El paquete `qz-tray` se carga de forma perezosa.
 */

interface QzTray {
  websocket: {
    connect: () => Promise<void>;
    isActive?: () => boolean;
  };
  printers: { find: () => Promise<string | string[]> };
  configs: { create: (printer: string, opts?: Record<string, unknown>) => unknown };
  print: (config: unknown, data: unknown[]) => Promise<void>;
  security?: {
    setCertificatePromise?: (fn: unknown) => void;
    setSignaturePromise?: (fn: unknown) => void;
  };
}

let qzPromise: Promise<QzTray | null> | null = null;
let conectado = false;

async function cargarQz(): Promise<QzTray | null> {
  if (!qzPromise) {
    qzPromise = import('qz-tray')
      .then((m) => ((m as { default?: unknown }).default ?? m) as unknown as QzTray)
      .catch(() => null);
  }
  return qzPromise;
}

/** Conecta el websocket de QZ si hace falta. Devuelve false (sin lanzar) si QZ no está. */
export async function conectarQz(): Promise<boolean> {
  const qz = await cargarQz();
  if (!qz) return false;
  try {
    if (qz.websocket.isActive && qz.websocket.isActive()) {
      conectado = true;
      return true;
    }
  } catch {
    /* continúa a conectar */
  }
  // Modo sin firma: resolver las promesas de seguridad de forma permisiva.
  try {
    qz.security?.setCertificatePromise?.((resolve: (v: unknown) => void) => resolve(undefined));
    qz.security?.setSignaturePromise?.(() => (resolve: (v: unknown) => void) => resolve(undefined));
  } catch {
    /* algunas versiones no lo requieren */
  }
  try {
    await qz.websocket.connect();
    conectado = true;
    return true;
  } catch {
    conectado = false;
    return false;
  }
}

export function qzDisponible(): boolean {
  return conectado;
}

/** Lista las impresoras instaladas (para los selectores de Ajustes). [] si QZ no está. */
export async function listarImpresoras(): Promise<string[]> {
  const qz = await cargarQz();
  if (!qz || !(await conectarQz())) return [];
  try {
    const res = await qz.printers.find();
    return Array.isArray(res) ? res : [res];
  } catch {
    return [];
  }
}

async function imprimirHTMLqz(impresora: string, html: string, anchoMm: number): Promise<void> {
  const qz = await cargarQz();
  if (!qz) throw new Error('QZ Tray no disponible');
  const cfg = qz.configs.create(impresora, {
    margins: 0,
    units: 'mm',
    size: { width: anchoMm, height: null },
  });
  await qz.print(cfg, [{ type: 'html', format: 'plain', data: html }]);
}

async function imprimirPDFqz(impresora: string, base64: string): Promise<void> {
  const qz = await cargarQz();
  if (!qz) throw new Error('QZ Tray no disponible');
  const cfg = qz.configs.create(impresora);
  await qz.print(cfg, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: base64 }]);
}

/**
 * Imprime un ticket: si hay impresora de tickets configurada y QZ disponible, va
 * directo a la térmica; si no, ejecuta `onRespaldo` (típicamente window.print()).
 */
export async function imprimirTicket(html: string, anchoMm: number, onRespaldo: () => void): Promise<void> {
  const printer = getConfig().impresoraTickets;
  if (printer) {
    try {
      if (await conectarQz()) {
        await imprimirHTMLqz(printer, html, anchoMm);
        return;
      }
    } catch {
      /* cae al respaldo */
    }
  }
  onRespaldo();
}

/**
 * Imprime un documento PDF (base64) a la impresora de documentos vía QZ.
 * Devuelve true si lo mandó por QZ; false si debe usarse el respaldo del navegador.
 */
export async function imprimirDocumentoPDF(base64: string): Promise<boolean> {
  const printer = getConfig().impresoraDocumentos;
  if (!printer) return false;
  try {
    if (await conectarQz()) {
      await imprimirPDFqz(printer, base64);
      return true;
    }
  } catch {
    /* cae al respaldo */
  }
  return false;
}
