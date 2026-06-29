import type { Capacidad } from '../lib/capacidades';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  cap: Capacidad;
  grupo: 'operacion' | 'analisis' | 'config';
  counterWarn?: boolean;
}

// Lista ÚNICA de navegación. El Sidebar muestra solo los ítems cuya capacidad
// tiene el perfil. Reemplaza a las antiguas listas NAV_ADMIN/NAV_VENDEDOR/NAV_USUARIO.
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',        label: 'Tablero',               icon: 'home',     cap: 'ver_reportes',         grupo: 'operacion' },
  { id: 'caja',             label: 'Caja',                  icon: 'cash',     cap: 'manejar_caja',         grupo: 'operacion' },
  { id: 'pos',              label: 'Nueva Venta',           icon: 'cart',     cap: 'vender',               grupo: 'operacion' },
  { id: 'inventario',       label: 'Inventario',            icon: 'box',      cap: 'gestionar_inventario', grupo: 'operacion' },
  { id: 'clientes',         label: 'Clientes',              icon: 'users',    cap: 'gestionar_clientes',   grupo: 'operacion' },
  { id: 'credito',          label: 'Notas a Crédito',       icon: 'credit',   cap: 'ver_estados_cuenta',   grupo: 'operacion', counterWarn: true },
  { id: 'proveedores',      label: 'Proveedores',           icon: 'sack',     cap: 'gestionar_compras',    grupo: 'operacion' },
  { id: 'precios',          label: 'Lista de Precios',      icon: 'barcode',  cap: 'ver_precios',          grupo: 'operacion' },
  { id: 'reportes',         label: 'Reportes',              icon: 'report',   cap: 'ver_reportes',         grupo: 'analisis' },
  { id: 'historial-ventas', label: 'Historial de ventas',   icon: 'clock',    cap: 'vender',               grupo: 'analisis' },
  { id: 'historial',        label: 'Historial de Clientes', icon: 'file',     cap: 'ver_estados_cuenta',   grupo: 'analisis' },
  { id: 'usuarios',         label: 'Usuarios',              icon: 'shield',   cap: 'gestionar_usuarios',   grupo: 'analisis' },
  { id: 'auditoria',        label: 'Bitácora',              icon: 'eye',      cap: 'ver_auditoria',        grupo: 'analisis' },
  { id: 'configuracion',    label: 'Configuración',         icon: 'settings', cap: 'configurar_sistema',   grupo: 'config' },
];

/** Primera pantalla a mostrar según las capacidades del perfil. */
export function pantallaInicial(can: (c: Capacidad) => boolean): string {
  const orden = ['dashboard', 'pos', 'precios', 'credito', 'historial'];
  const item = NAV_ITEMS
    .filter((i) => orden.includes(i.id))
    .sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
    .find((i) => can(i.cap));
  return item?.id ?? 'precios';
}

/** Items de navegación visibles para un perfil, en orden de NAV_ITEMS
 *  (coincide con el orden de render del Sidebar). Reutilizado por Sidebar y atajos. */
export function itemsVisibles(can: (c: Capacidad) => boolean): NavItem[] {
  return NAV_ITEMS.filter((i) => can(i.cap));
}
