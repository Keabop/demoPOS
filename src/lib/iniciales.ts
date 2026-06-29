/**
 * Iniciales para el monograma del logo (cuando el negocio no tiene imagen):
 * - una sola palabra ("AGROMAR")        -> dos primeras letras ("AG")
 * - dos o más palabras ("Juan Pérez")   -> inicial de las dos primeras ("JP")
 * - vacío / solo espacios               -> "·"
 */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '·';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}
