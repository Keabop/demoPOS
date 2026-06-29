// Capa de capacidades de la interfaz, montada SOBRE las 3 capas de seguridad
// reales (admin/vendedor/visitante) que rigen la RLS de la base. Las capacidades
// solo afinan qué se ve/usa en la UI; la base sigue siendo la barrera dura.
export type Capacidad =
  | 'ver_precios' | 'ver_existencia' | 'ver_estados_cuenta' | 'ver_costos'
  | 'vender' | 'manejar_caja' | 'gestionar_inventario' | 'gestionar_clientes'
  | 'gestionar_compras' | 'ver_reportes' | 'gestionar_usuarios' | 'configurar_sistema'
  | 'administrar_cartera' | 'ver_auditoria';

export type Permisos = Record<Capacidad, boolean>;
export type CapaSeguridad = 'admin' | 'vendedor' | 'visitante';

export const CAPACIDADES_META: { cap: Capacidad; grupo: 'Visibilidad' | 'Acciones'; label: string }[] = [
  { cap: 'ver_precios',          grupo: 'Visibilidad', label: 'Ver precios de venta' },
  { cap: 'ver_existencia',       grupo: 'Visibilidad', label: 'Ver existencia / stock' },
  { cap: 'ver_estados_cuenta',   grupo: 'Visibilidad', label: 'Ver estados de cuenta (crédito)' },
  { cap: 'ver_costos',           grupo: 'Visibilidad', label: 'Ver nuestro costo / margen' },
  { cap: 'vender',               grupo: 'Acciones',    label: 'Vender en el POS' },
  { cap: 'manejar_caja',         grupo: 'Acciones',    label: 'Manejar la caja (apertura/corte)' },
  { cap: 'gestionar_inventario', grupo: 'Acciones',    label: 'Gestionar inventario (entradas/salidas)' },
  { cap: 'gestionar_clientes',   grupo: 'Acciones',    label: 'Gestionar clientes y abonos' },
  { cap: 'gestionar_compras',    grupo: 'Acciones',    label: 'Gestionar compras y proveedores' },
  { cap: 'ver_reportes',         grupo: 'Acciones',    label: 'Ver tablero y reportes' },
  { cap: 'gestionar_usuarios',   grupo: 'Acciones',    label: 'Gestionar usuarios' },
  { cap: 'configurar_sistema',   grupo: 'Acciones',    label: 'Configuración del sistema' },
  { cap: 'administrar_cartera',  grupo: 'Acciones',    label: 'Desbloquear morosos y archivar clientes' },
  { cap: 'ver_auditoria',        grupo: 'Acciones',    label: 'Ver bitácora de auditoría' },
];

const TODAS = CAPACIDADES_META.map((c) => c.cap);
function set(caps: Capacidad[]): Permisos {
  return TODAS.reduce((acc, c) => { acc[c] = caps.includes(c); return acc; }, {} as Permisos);
}

// Defaults que REPRODUCEN el comportamiento actual por capa (fallback de compatibilidad
// para usuarios existentes que aún no tengan `permisos`).
export const DEFAULT_PERMISOS: Record<CapaSeguridad, Permisos> = {
  admin: set(TODAS),
  vendedor: set(['ver_precios', 'ver_existencia', 'ver_estados_cuenta', 'ver_costos', 'vender', 'manejar_caja', 'gestionar_clientes', 'gestionar_compras']),
  visitante: set(['ver_precios', 'ver_existencia', 'ver_estados_cuenta']),
};

// Plantillas (presets) que ve el admin al crear/editar un perfil.
export interface Plantilla { id: string; etiqueta: string; rol: CapaSeguridad; permisos: Permisos; }
export const PLANTILLAS: Plantilla[] = [
  { id: 'administrador', etiqueta: 'Administrador', rol: 'admin',     permisos: DEFAULT_PERMISOS.admin },
  { id: 'vendedor',      etiqueta: 'Vendedor',      rol: 'vendedor',  permisos: DEFAULT_PERMISOS.vendedor },
  { id: 'tecnico',       etiqueta: 'Técnico',       rol: 'visitante', permisos: set(['ver_precios', 'ver_existencia', 'ver_estados_cuenta']) },
  { id: 'ventas',        etiqueta: 'Ventas',        rol: 'visitante', permisos: set(['ver_precios', 'ver_existencia', 'ver_estados_cuenta', 'ver_costos']) },
];

export function permisosDePlantilla(id: string): Plantilla | undefined {
  return PLANTILLAS.find((p) => p.id === id);
}

// Completa un permisos parcial (de la BD) con los defaults de su capa.
export function permisosCompletos(parcial: Partial<Permisos> | undefined, rol: CapaSeguridad): Permisos {
  const base = DEFAULT_PERMISOS[rol];
  if (!parcial || Object.keys(parcial).length === 0) return base;
  return TODAS.reduce((acc, c) => { acc[c] = parcial[c] ?? base[c]; return acc; }, {} as Permisos);
}

/** Deriva la capa de seguridad (rol) desde la plantilla o, si es personalizado, desde las capacidades de acción. */
export function derivarRol(perfil: { plantilla: string; permisos: Permisos }): CapaSeguridad {
  const pl = permisosDePlantilla(perfil.plantilla);
  if (pl) return pl.rol;
  if (perfil.permisos.gestionar_usuarios || perfil.permisos.configurar_sistema) return 'admin';
  if (perfil.permisos.vender || perfil.permisos.manejar_caja || perfil.permisos.gestionar_inventario || perfil.permisos.gestionar_compras) return 'vendedor';
  return 'visitante';
}
