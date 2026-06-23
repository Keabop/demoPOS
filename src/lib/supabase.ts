// src/lib/supabase.ts
// DEMO portable: la app NO se conecta a Supabase. Este módulo re-exporta el shim
// local (PGlite + mocks de auth/storage/realtime) que implementa el subconjunto de
// la API de @supabase/supabase-js que usa AGROMAR. Sin red, sin variables de entorno.
export { supabase } from './demo/client';
