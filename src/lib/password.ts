// Política de contraseña compartida por la UI. Debe coincidir con la validación de
// las Edge Functions (crear-usuario, cambiar-password) y con la política de Supabase Auth.

export const REGLAS_PASSWORD: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'Mínimo 8 caracteres', test: (pw) => pw.length >= 8 },
  { label: 'Una letra mayúscula (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Una letra minúscula (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Un número (0-9)', test: (pw) => /[0-9]/.test(pw) },
];

export const passwordCumple = (pw: string): boolean =>
  REGLAS_PASSWORD.every((r) => r.test(pw));

// Entero aleatorio en [0, max). Usa WebCrypto cuando está disponible (navegador y
// jsdom moderno); cae a Math.random como último recurso para no romper en entornos
// sin crypto. Es una contraseña temporal que el usuario cambiará, así que basta.
function aleatorio(max: number): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

// Genera una contraseña que SIEMPRE cumple la política: garantiza al menos una
// mayúscula, una minúscula y un dígito, rellena el resto y baraja. Se omiten
// caracteres ambiguos (O/0, I/l/1) para que sea fácil de dictar.
export function generarPassword(longitud = 14): string {
  const MAY = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MIN = 'abcdefghijkmnpqrstuvwxyz';
  const NUM = '23456789';
  const TODOS = MAY + MIN + NUM;
  const pick = (set: string) => set[aleatorio(set.length)];

  const chars: string[] = [pick(MAY), pick(MIN), pick(NUM)];
  while (chars.length < longitud) chars.push(pick(TODOS));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
