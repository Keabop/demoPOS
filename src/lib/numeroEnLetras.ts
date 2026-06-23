// Convierte un monto MXN a letra para el pagaré.
// Ej: 2622 -> "DOS MIL SEISCIENTOS VEINTIDÓS PESOS 00/100 M.N."

const MENORES_30 = [
  'CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorMil(n: number): string {
  if (n === 100) return 'CIEN';
  let out = '';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) out += CENTENAS[c];
  if (resto > 0) {
    if (out) out += ' ';
    if (resto < 30) {
      out += MENORES_30[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      out += DECENAS[d] + (u > 0 ? ' Y ' + MENORES_30[u] : '');
    }
  }
  return out;
}

function enteroALetras(n: number): string {
  if (n === 0) return 'CERO';
  let out = '';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones > 0) out += millones === 1 ? 'UN MILLÓN' : menorMil(millones) + ' MILLONES';
  if (miles > 0) out += (out ? ' ' : '') + (miles === 1 ? 'MIL' : menorMil(miles) + ' MIL');
  if (resto > 0) out += (out ? ' ' : '') + menorMil(resto);
  return out;
}

// Apócope de "uno" → "un" / "veintiuno" → "veintiún" antes de un sustantivo o de
// "mil"/"millón" (regla del español: "un peso", "veintiún mil", "treinta y un").
function apocopar(s: string): string {
  return s.replace(/\bVEINTIUNO\b/g, 'VEINTIÚN').replace(/\bUNO\b/g, 'UN');
}

export function numeroALetras(monto: number): string {
  const abs = Math.abs(Number(monto) || 0);
  const entero = Math.floor(abs);
  const centavos = Math.round((abs - entero) * 100);
  const letras = apocopar(enteroALetras(entero));
  const pesos = entero === 1 ? 'PESO' : 'PESOS';
  return `${letras} ${pesos} ${String(centavos).padStart(2, '0')}/100 M.N.`;
}
