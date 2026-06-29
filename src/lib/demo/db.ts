// src/lib/demo/db.ts
// Singleton de PGlite (Postgres-WASM) persistido en IndexedDB. Garantiza que el
// esquema y la siembra están cargados a la versión vigente; expone helpers para
// fijar el GUC de sesión `demo.uid` (lo lee auth.uid()) y para reiniciar la demo.
import { PGlite } from '@electric-sql/pglite';
import { FULL_SCHEMA_SQL } from './schema_all';
import { DEMO_SEED_SQL, SEED_VERSION } from './seed';

export const IDB_NAME = 'agromar-demo';
const DATA_DIR = `idb://${IDB_NAME}`;

let _db: PGlite | null = null;
let _ready: Promise<PGlite> | null = null;

async function init(): Promise<PGlite> {
  const db = new PGlite(DATA_DIR);
  await db.waitReady;
  // ¿ya sembrado y a la versión vigente?
  let needsSeed: boolean;
  try {
    const r = await db.query<{ v: string }>(
      `select value as v from _demo_meta where key='seed_version' limit 1`);
    needsSeed = r.rows[0]?.v !== SEED_VERSION;
  } catch {
    needsSeed = true; // _demo_meta no existe aún
  }
  if (needsSeed) {
    // Esquema limpio: si había una versión vieja, recreamos desde cero.
    await db.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;`);
    await db.exec(FULL_SCHEMA_SQL);
    await db.exec(`CREATE TABLE IF NOT EXISTS _demo_meta (key text primary key, value text);`);
    await db.exec(DEMO_SEED_SQL);
    await db.exec(`INSERT INTO _demo_meta(key,value) VALUES('seed_version','${SEED_VERSION}')
                   ON CONFLICT (key) DO UPDATE SET value=excluded.value;`);
  }
  _db = db;
  return db;
}

export function getDB(): Promise<PGlite> {
  if (!_ready) _ready = init();
  return _ready;
}

export async function setUid(uid: string | null): Promise<void> {
  const db = await getDB();
  // set_config con literal escapado (uid es un uuid de nuestros propios perfiles).
  await db.exec(`SELECT set_config('demo.uid', '${uid ?? ''}', false);`);
}

export async function resetDemo(): Promise<void> {
  try { _db?.close?.(); } catch { /* noop */ }
  // Borrar la BD de IndexedDB y recargar para reinit + reseed.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(`/pglite/${IDB_NAME}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  location.reload();
}

// Solo para pruebas: inyecta una PGlite ya inicializada.
export function __setTestDB(d: PGlite) { _db = d; _ready = Promise.resolve(d); }
