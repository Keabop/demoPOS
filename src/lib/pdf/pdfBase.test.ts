import { describe, it, expect, vi, afterEach } from 'vitest';
import { entregarPDF } from './pdfBase';

function fakeDoc() {
  return {
    save: vi.fn(),
    output: vi.fn(() => 'blob:fake-url'),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('entregarPDF', () => {
  it("modo 'descargar' llama doc.save con el nombre y no usa output", () => {
    const doc = fakeDoc();
    entregarPDF(doc as never, 'archivo.pdf', 'descargar');
    expect(doc.save).toHaveBeenCalledWith('archivo.pdf');
    expect(doc.output).not.toHaveBeenCalled();
  });

  it('por defecto (sin modo) descarga', () => {
    const doc = fakeDoc();
    entregarPDF(doc as never, 'archivo.pdf');
    expect(doc.save).toHaveBeenCalledWith('archivo.pdf');
  });

  it("modo 'imprimir' genera bloburl y abre una ventana para imprimir", () => {
    const doc = fakeDoc();
    const win = { focus: vi.fn(), print: vi.fn(), addEventListener: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as never);
    entregarPDF(doc as never, 'archivo.pdf', 'imprimir');
    expect(doc.output).toHaveBeenCalledWith('bloburl');
    expect(openSpy).toHaveBeenCalledWith('blob:fake-url', '_blank');
    expect(win.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("modo 'imprimir' con popup bloqueado cae a descargar", () => {
    const doc = fakeDoc();
    vi.spyOn(window, 'open').mockReturnValue(null);
    entregarPDF(doc as never, 'archivo.pdf', 'imprimir');
    expect(doc.save).toHaveBeenCalledWith('archivo.pdf');
  });
});
