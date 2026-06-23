// src/lib/demo/auth.ts
// Mock de `supabase.auth` por rol (sin red). La sesión vive en localStorage y al
// iniciar/cerrar sesión se fija el GUC `demo.uid` que lee auth.uid() en la BD.
import { setUid } from './db';

export interface DemoUser { id: string; email: string; rol: string; nombre: string; pass: string; }

// IMPORTANTE: estos UUID deben ser EXACTAMENTE los de `perfiles` en seed.ts.
export const DEMO_USERS: DemoUser[] = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'admin@demo.mx',   pass: 'demo1234', rol: 'admin',     nombre: 'Karen (Administradora)' },
  { id: '00000000-0000-0000-0000-000000000002', email: 'tecnico@demo.mx', pass: 'demo1234', rol: 'vendedor',  nombre: 'Juan (Técnico/Mostrador)' },
  { id: '00000000-0000-0000-0000-000000000003', email: 'ventas@demo.mx',  pass: 'demo1234', rol: 'visitante', nombre: 'Consulta (Ventas)' },
];

const LS_KEY = 'agromar-demo-session';
// user se tipa laxo (any) para ser asignable al tipo `User` de @supabase/supabase-js
// que usa AuthContext, sin reproducir toda su forma.
type Session = { user: any } | null;
type AuthCb = (event: string, session: Session) => void;
const listeners = new Set<AuthCb>();

function loadSession(): Session {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveSession(s: unknown) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

export const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const u = DEMO_USERS.find((x) => x.email === email.trim().toLowerCase() && x.pass === password);
    if (!u) return { data: { user: null, session: null }, error: { message: 'Credenciales incorrectas (demo).' } };
    const session = { user: { id: u.id, email: u.email } };
    saveSession(session);
    await setUid(u.id);
    listeners.forEach((cb) => cb('SIGNED_IN', session));
    return { data: { user: session.user, session }, error: null };
  },
  async signOut() {
    localStorage.removeItem(LS_KEY);
    await setUid(null);
    listeners.forEach((cb) => cb('SIGNED_OUT', null));
    return { error: null };
  },
  onAuthStateChange(cb: AuthCb) {
    listeners.add(cb);
    // Emite INITIAL_SESSION (como supabase-js) tras fijar el GUC.
    const s = loadSession();
    setUid(s ? s.user.id : null).then(() => cb('INITIAL_SESSION', s));
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  async getSession() { return { data: { session: loadSession() }, error: null }; },
  async getUser() { const s = loadSession(); return { data: { user: s ? s.user : null }, error: null }; },
};
