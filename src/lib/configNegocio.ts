// Configuración de empresa en runtime (capa de productización, "modelo A").
// Se carga de la tabla `configuracion` de Supabase; si falla o no existe, usa
// DATOS_NEGOCIO como valores por defecto (la app nunca se rompe).
import { DATOS_NEGOCIO } from './datosNegocio';

export interface ConfigNegocio {
  nombre: string;        // razon_social
  descripcion: string;
  responsable: string;
  rfc: string;
  direccion: string;
  cp: string;
  ciudad: string;
  telefono: string;
  telPagare: string;     // tel_pagare
  email: string;
  logoUrl: string;
  monedaSimbolo: string;
  monedaIso: string;
  locale: string;
  ivaDefault: number;
}

export const CONFIG_DEFAULT: ConfigNegocio = {
  nombre: DATOS_NEGOCIO.nombre,
  descripcion: DATOS_NEGOCIO.descripcion,
  responsable: DATOS_NEGOCIO.responsable,
  rfc: DATOS_NEGOCIO.rfc,
  direccion: DATOS_NEGOCIO.direccion,
  cp: DATOS_NEGOCIO.cp,
  ciudad: DATOS_NEGOCIO.ciudad,
  telefono: DATOS_NEGOCIO.telefono,
  telPagare: DATOS_NEGOCIO.telPagare,
  email: DATOS_NEGOCIO.email,
  logoUrl: '/logo-demo.svg',
  monedaSimbolo: '$',
  monedaIso: 'MXN',
  locale: 'es-MX',
  ivaDefault: 0,
};

/** Forma de la fila de la tabla `configuracion`. */
export interface ConfiguracionRow {
  razon_social?: string | null;
  descripcion?: string | null;
  responsable?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  cp?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  tel_pagare?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda_simbolo?: string | null;
  moneda_iso?: string | null;
  locale?: string | null;
  iva_default?: number | string | null;
}

export function configDesdeRow(row: ConfiguracionRow | null | undefined): ConfigNegocio {
  if (!row) return CONFIG_DEFAULT;
  return {
    nombre: row.razon_social || CONFIG_DEFAULT.nombre,
    descripcion: row.descripcion || CONFIG_DEFAULT.descripcion,
    responsable: row.responsable || CONFIG_DEFAULT.responsable,
    rfc: row.rfc || CONFIG_DEFAULT.rfc,
    direccion: row.direccion || CONFIG_DEFAULT.direccion,
    cp: row.cp || CONFIG_DEFAULT.cp,
    ciudad: row.ciudad || CONFIG_DEFAULT.ciudad,
    telefono: row.telefono || CONFIG_DEFAULT.telefono,
    telPagare: row.tel_pagare || CONFIG_DEFAULT.telPagare,
    email: row.email || CONFIG_DEFAULT.email,
    logoUrl: row.logo_url || CONFIG_DEFAULT.logoUrl,
    monedaSimbolo: row.moneda_simbolo || CONFIG_DEFAULT.monedaSimbolo,
    monedaIso: row.moneda_iso || CONFIG_DEFAULT.monedaIso,
    locale: row.locale || CONFIG_DEFAULT.locale,
    ivaDefault: row.iva_default != null ? Number(row.iva_default) : CONFIG_DEFAULT.ivaDefault,
  };
}

// Store de módulo: permite que funciones puras (generadores PDF) lean la config
// cargada sin pasar por React. Lo actualiza el ConfigProvider al cargar la fila.
let configActual: ConfigNegocio = CONFIG_DEFAULT;
export function getConfig(): ConfigNegocio {
  return configActual;
}
export function setConfigActual(c: ConfigNegocio): void {
  configActual = c;
}
