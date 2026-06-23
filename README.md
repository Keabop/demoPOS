# Agroservicios El Surco — DEMO portable del POS

Demo **interactiva y sin backend** de un punto de venta agropecuario con crédito. Corre
una base de datos **Postgres real dentro del navegador** (PGlite + WebAssembly, persistida
en IndexedDB) detrás de un *shim* compatible con `@supabase/supabase-js`. No requiere
Supabase, ni servidor, ni variables de entorno: es un sitio 100% estático que se
comparte por link.

## Cómo funciona

- `src/lib/demo/` contiene toda la capa demo:
  - `schema.ts` — el esquema real (14 tablas, 13 funciones plpgsql, 4 triggers de
    PEPS/caja/crédito) adaptado a PGlite.
  - `seed.ts` — datos de ejemplo agro (28 productos, 8 clientes con un moroso, 14
    ventas con abonos, apertura de caja).
  - `postgrest.ts` / `queryBuilder.ts` — traducen `supabase.from().select()…`, `.rpc()`,
    embeds y filtros a SQL de PGlite.
  - `auth.ts` / `storage.ts` / `realtime.ts` / `client.ts` — mocks de auth por rol,
    logo→data-URL, refresco en vivo y ensamblado del objeto `supabase`.
- `src/lib/supabase.ts` re-exporta ese shim, así el resto de la app no cambia.
- La lógica de negocio (descuento PEPS por lotes, movimientos de caja, crédito y
  morosos) **corre de verdad** en la base de datos del navegador.

## Correr localmente

```bash
npm install
npm run dev       # desarrollo
# o
npm run build && npm run preview   # build de producción + vista previa
```

## Acceso (demo)

Botones de **acceso rápido** en el login, o credenciales:

| Rol      | Email             | Contraseña |
|----------|-------------------|------------|
| Admin    | admin@demo.mx     | demo1234   |
| Técnico  | tecnico@demo.mx   | demo1234   |
| Ventas   | ventas@demo.mx    | demo1234   |

El IVA está activado (`configuracion.iva_default = 0.16`) para mostrar la capacidad;
se edita en **Configuración**. El banner superior tiene **"Reiniciar demo"** para
volver a los datos originales (cada visitante tiene su propia copia local).

## Desplegar en Cloudflare Pages

Sin variables de entorno y sin cabeceras especiales (PGlite no necesita COOP/COEP).

- **Por GitHub:** conectar el repo en Cloudflare Pages con
  - Build command: `npm run build`
  - Build output directory: `dist`
  - Variables de entorno: **ninguna**
- **Por CLI (sin GitHub):**

  ```bash
  npm run build
  npx wrangler pages deploy dist --project-name=demo-pos
  ```

`public/_redirects` ya incluye el fallback SPA (`/* /index.html 200`).
