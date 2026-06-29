import { useAuth } from './AuthContext';
import { permisosCompletos, type Capacidad } from '../../lib/capacidades';
import type { Perfil } from '../../types';

/** Versión pura: útil fuera de render (p.ej. en App.tsx durante el cálculo de pantalla). */
export function can(perfil: Perfil | null, cap: Capacidad): boolean {
  if (!perfil) return false;
  return permisosCompletos(perfil.permisos, perfil.rol)[cap];
}

/** Hook: devuelve un predicado `can(cap)` para el perfil autenticado. */
export function useCan(): (cap: Capacidad) => boolean {
  const { profile } = useAuth();
  return (cap: Capacidad) => can(profile, cap);
}
