import { describe, it, expect, vi } from 'vitest';
import { imprimirTicket, imprimirDocumentoPDF, qzDisponible } from './qz';

// Sin impresoras configuradas (config por defecto: cadenas vacías) y sin QZ corriendo,
// las funciones deben caer al respaldo sin tocar qz-tray.
describe('qz (respaldo sin configuración)', () => {
  it('qzDisponible es false antes de conectar', () => {
    expect(qzDisponible()).toBe(false);
  });

  it('imprimirTicket ejecuta el respaldo si no hay impresora de tickets', async () => {
    const respaldo = vi.fn();
    await imprimirTicket('<div>ticket</div>', 58, respaldo);
    expect(respaldo).toHaveBeenCalledTimes(1);
  });

  it('imprimirDocumentoPDF devuelve false si no hay impresora de documentos', async () => {
    expect(await imprimirDocumentoPDF('YmFzZTY0')).toBe(false);
  });
});
