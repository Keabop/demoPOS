# Análisis exhaustivo POS AGROMAR — Cobertura de negocio, benchmark vs InventarioPro, UX, salud técnica y visión de producto

**Fecha:** 2026-06-20 · **Alcance:** solo lectura/diagnóstico (no se modificó código) · **Repo:** `E:/Proyectos Importantes/AGROMAR`
**Método:** 15 agentes lectores en paralelo por 6 dimensiones + una segunda pasada de **verificación adversarial** sobre cada ítem de cobertura y cada hallazgo técnico de severidad Alta/Media (56 agentes, 736 lecturas de archivo). Toda afirmación está anclada a `archivo:línea` reales.

---

## 1. Resumen ejecutivo

AGROMAR es un POS agro **maduro y notablemente completo para su nicho** (agroquímicos a crédito en Irapuato): los 8 requisitos del contrato están casi todos cubiertos y en varias áreas **supera** a un POS/inventario genérico como InventarioPro (gráfica con rangos semana/mes/año, doble precio público/mayoreo, costo real por lote PEPS, control de caja que bloquea ventas, anti doble-cobro, validación de crédito transaccional, export Excel/PDF del historial). La cobertura de requisitos quedó en **~15 Cubierto / 4 Parcial / 2 Faltante**.

Lo Faltante real y accionable es acotado: (a) la **columna FACTURA** del estado de cuenta es un placeholder vacío (`'-'`), y (b) **no existe la opción "imprimir O guardar"** que pide el contrato — todos los PDF solo descargan (`doc.save`). Lo Parcial relevante: la **cotización no agrupa por categorías** (solo columna), la **orden de compra no desglosa Subtotal/IVA** (solo TOTAL), y una **columna "DÍAS DE ATRASO" semánticamente incorrecta** (cuenta días desde la venta, no mora).

En salud técnica, la verificación adversarial **bajó la mayoría de severidades** (varias falsas alarmas de "descuadre de caja" resultaron ser brechas de *reporte*, no pérdida de dinero). Quedan **3 riesgos Altos confirmados**, todos en la misma raíz: la **cobranza a crédito y los cobros no-efectivo (débito/transferencia/tarjeta) no se registran de forma uniforme** en `movimientos_caja`, por lo que `ReporteCaja` subreporta ingresos y la columna de mora va errónea hasta en el PDF que recibe el cliente. Hay además ~14 Medios (RLS del visitante demasiado amplia, `anon` lee `costo`/`stock`, zonas horarias atadas al navegador, sobre-pago de abonos sin tope en servidor) y un buen lote de Bajos.

Para la **visión de producto** (plantilla vendible): el "modelo A" (una instancia Supabase por cliente) está **a un paso** — conexión por `.env` y datos del negocio ya centralizados en `datosNegocio.ts`. Lo que bloquea una productización limpia es el **branding "AGROMAR"/logo escrito directo en JSX**, el **seed de usuarios demo con contraseñas en la migración**, las **categorías/moneda fijas** y, sobre todo, la **ausencia de una tabla + pantalla de Configuración de empresa**. El SaaS multi-tenant compartido sí es reescritura mayor (no hay `tenant_id` en ninguna tabla).

**Recomendación de cabecera:** el sistema está listo para implementar en AGROMAR; antes de la migración Velneo conviene cerrar 2 quick-wins de contrato (botón Imprimir en PDFs + columna factura) y los 3 Altos de cobranza/caja. La productización debería empezar por la capa de Configuración (tabla + UI), que destraba casi todos los bloqueos de la visión.

---

## 2. Inventario de capacidades (resumen)

> Mapa completo: 109 capacidades. Aquí el índice por capa; las rutas son clicables.

**Shell y navegación**
- `src/App.tsx:36` — ruteo por rol (admin→`dashboard`, vendedor→`pos`, visitante→`precios`); bypass a `MobileScanner` por query `scan_session` (`App.tsx:70`).
- `src/components/Sidebar.tsx:40` — menús por rol (`NAV_ADMIN` 10 items, `NAV_VENDEDOR` 6, `NAV_USUARIO/visitante` 2); item **"Configuración" inerte** (`Sidebar.tsx:232`).
- `src/components/Topbar.tsx:11` — badge de estado de caja en tiempo real. `src/components/Icon.tsx:11` — ~40 iconos SVG (ojo: `chevron-up`/`device` no existen y caen al default).

**Punto de venta y caja**
- `src/features/pos/POS.tsx:23` — POS completo; checkout vía RPC `fn_registrar_venta_completa` con guard anti doble-cobro (`POS.tsx:137,403`); cotización PDF; WhatsApp n8n. **Código de barras desactivado** por `SHOW_BARCODE_FEATURES=false` (`POS.tsx:15`).
- `src/features/pos/Caja.tsx:60` — apertura/corte de turno, desglose de efectivo, conteo vs esperado.
- `src/features/pos/CheckoutSuccessModal.tsx:26` — ticket 80mm imprimible (`window.print`). `MobileScanner.tsx:10` — escáner móvil (alcanzable solo por URL).

**Inventario / precios**
- `src/features/inventario/Catalogo.tsx:24` — gestión de inventario, alta de producto, movimientos entrada/salida.
- `src/features/inventario/Precios.tsx:8` — lista de precios solo-lectura (pantalla por defecto del visitante).

**Clientes y crédito**
- `src/features/clientes/Clientes.tsx:47`, `EstadoCuenta.tsx:27`, `HistorialClientes.tsx:15` (vista visitante), `PerfilClienteModal.tsx:15`, `NuevoClienteModal.tsx:11`, `RegistrarPagoModal.tsx:14`.
- `src/features/credito/CreditosList.tsx:17` — cartera de crédito, registro/cancelación de abonos, PDF Nota/Pagaré.

**Ventas, reportes, compras, admin**
- `src/features/ventas/HistorialVentas.tsx:39` + `historialModel.ts` — historial/auditoría con export Excel/PDF.
- `src/features/reportes/{Reportes,ReporteVentas,ReporteCobranza,ReporteInventario,ReporteCaja}.tsx` — reportes con lazy load.
- `src/features/compras/{Compras,OrdenesTab,ProveedoresTab,NuevaOrdenModal,OrdenDetalleModal,...}.tsx` — órdenes de compra y proveedores.
- `src/features/admin/{Usuarios,UsuariosList,CrearUsuarioModal,EditarUsuarioModal}.tsx` — gestión de usuarios vía Edge Functions.

**Backend (Supabase)**
- 11 tablas: `perfiles, productos, lotes, clientes, ventas, ventas_detalles, movimientos_caja, pagos_credito, movimientos_inventario, proveedores, ordenes_compra(+_detalles), proveedor_productos`.
- RPCs: `fn_registrar_venta_completa` (`20260616000005:10`, SECURITY DEFINER, valida `es_operador`, crédito, PEPS), `fn_recibir_orden_compra` (`20260616000007:47`), `fn_evaluar_clientes_morosos` (`20260616000004:13`, **versión vigente usa `plazo_dias` por venta**).
- Triggers: PEPS `trg_descontar_lotes_peps`, `trg_procesar_movimiento_inventario`, `trg_procesar_abono_credito` (mantiene `saldo_deudor`), `handle_new_user` (auth→perfiles).
- Cron de morosos diario (`20260616000000`, 00:00 hora MX). Edge Functions: `crear-usuario`, `eliminar-usuario`.

**Stack:** Vite + React 19 + TS, `jspdf`/`jspdf-autotable` (PDF), `xlsx` (Excel), `html5-qrcode` (escáner), Vitest. Sin Tailwind (CSS propio OKLCH).

---

## 3. Matriz de cobertura de requisitos del negocio (Material A) — verificada

> Estado tras verificación adversarial. ✅ Cubierto · 🟡 Parcial · ❌ Faltante

| # | Requisito | Estado | Evidencia (archivo:línea) | Nota |
|---|-----------|:------:|---------------------------|------|
| 1 | **Rol visitante**: solo Lista de Precios + Historial del cliente, sin escritura | ✅ | `App.tsx:58-60,85,111-114`; `Sidebar.tsx:35-38`; `Precios.tsx:17-23`; `HistorialClientes.tsx:54-62`; `permitir_consulta_visitante.sql:7-30` | Defensa en profundidad: UI + RLS + RPCs (`es_operador`) bloquean toda escritura. (Ver riesgo T-RLS-1 sobre alcance de *lectura*.) |
| 2 | **Cambiar día de crédito por cliente** y aplicarlo al vender | ✅ | `clientes.dias_credito`/`ventas.plazo_dias` (`add_credit_days.sql:2-3`); edición en `EstadoCuenta.tsx:53-73,608-664`; POS `POS.tsx:113-119,449-459`; RPC `update_registrar_venta_rpc.sql:13,51-53` | End-to-end. Override por venta sin alterar el default del cliente. |
| 3 | **Categorías del giro** (Semillas, Herbicidas, Insecticidas, Foliares, Fungicidas, Abono) | ✅ | `Catalogo.tsx:742-747` (coincidencia exacta), `:40,:131` | ⚠️ No hay `CHECK`/enum en BD ni constante central; otras vistas derivan categorías dinámicamente de los datos. |
| 4 | **Estado de cuenta por cliente** (13 campos) | 🟡 | ver desglose abajo | 9 cubiertos, 2 parciales, 1 faltante, +1 mal etiquetado |
| 5a | Cotización imprimible (PDF) | ✅ | `cotizacionPDF.ts:24,105`; `POS.tsx:379-399,1148-1157` | Descargable; encabezado de marca, cliente, partidas, total. |
| 5b | Cotización **agrupada por categorías** | 🟡 | `cotizacionPDF.ts:88-97` | Hay **columna** "CATEGORÍA" por renglón, pero **no** secciones ni subtotales por categoría. |
| 6 | **Nota de venta a crédito + PAGARÉ PDF** (datos fiscales Mauricio Aguilar Razo, folio, cliente, detalle, total, fecha límite, texto legal) | ✅ | `notaCreditoPagarePDF.ts:37-43,50,68,70-72,83-96,102-120,137`; `datosNegocio.ts:9-13`; `numeroEnLetras.ts:50`; `CreditosList.tsx:228,691` | **Todos** los campos requeridos presentes y correctos (monto en letra incluido). Único matiz: solo se descarga (ver req. 8). |
| 7 | **Órdenes de compra** (folio, proveedor, dir. entrega, partidas cantidad/presentación/precio, **subtotal/IVA/total**, autorizado por) | 🟡 | `ordenCompraPDF.ts:51,52,61,62,78-79,90,104-107`; `OrdenDetalleModal.tsx`; `proveedores_compras.sql:20,38` | Casi todo presente; **falta** desglose de **Subtotal e IVA** en el PDF (imprime solo TOTAL; `ordenCompraPDF.ts:87,90`). IVA fijo 0 en alta (`NuevaOrdenModal.tsx:38`). |
| 8 | **Opción imprimir O guardar** las notas de crédito | ❌ | `notaCreditoPagarePDF.ts:137`; `ordenCompraPDF.ts:109`; `cotizacionPDF.ts:105`; `CreditosList.tsx:691` | Todos los PDF usan **solo** `doc.save` (descarga). No hay ruta de impresión (`autoPrint`/`.output`/`window.open`) para ningún PDF. El único `window.print` imprime el **ticket** (`CheckoutSuccessModal.tsx:339`), no el pagaré. |

### Desglose req. 4 — Estado de cuenta (campo por campo)

| Campo | Estado | Evidencia | Nota |
|-------|:------:|-----------|------|
| Días de atraso | 🟡 | `EstadoCuenta.tsx:171,714,743` | **Cuenta días desde la fecha de VENTA, no mora** (e incluso con signo invertido). El badge de status sí usa el cálculo correcto → la columna contradice al badge. Va al PDF/Excel (`:219`). Ver T-FECHA-2 (Alto). |
| Fecha | ✅ | `EstadoCuenta.tsx:716,749`; `estadoCuentaExport.ts:91` | DD/MM/YYYY, inmune a TZ vía `getLocalDate`. |
| Fecha de vencimiento | ✅ | `EstadoCuenta.tsx:168,717,752`; export `:96` | `fechaVencimiento(fecha, plazo_dias||dias_credito)`. |
| Nota | ✅ | `EstadoCuenta.tsx:715,745` | "Nota" = nota a crédito (remisión/folio). Listada completa por documento. |
| Factura | ❌ | `EstadoCuenta.tsx:718,754-756,804-806` | **Columna placeholder: siempre renderiza `'-'`**. No hay campo de folio fiscal en `Venta` ni en BD; no se exporta. |
| Saldo | ✅ | `EstadoCuenta.tsx:163-164,719,757`; export `:97` | `max(0, total - Σabonos)`, con total en tfoot. |
| Vencido | ✅ | `EstadoCuenta.tsx:176,194,761`; `clienteEstatus.ts:19` | Status VENCIDA + `totalVencido`. |
| Abonos | ✅ | `EstadoCuenta.tsx:721,815-820,855-857` | En UI completos; ⚠️ no se renderizan en PDF/Excel (sí están en el modelo). |
| Fecha de abono | ✅ | `EstadoCuenta.tsx:722,823,859` | En UI; no en PDF/Excel. |
| Observaciones | 🟡 | `EstadoCuenta.tsx:723,825-827` | La columna **muestra el método de pago**, no texto libre. No existe campo de observaciones en `pagos_credito`. |
| Status (VENCIDA/PAGADA) | ✅ | `EstadoCuenta.tsx:173-180,761`; export `:98` | PAGADA / VENCIDA / AL CORRIENTE (tercer estado, no resta). |
| Total vencido | ✅ | `EstadoCuenta.tsx:194,683`; export `:84` | KPI + banner. |
| Total por cobrar | ✅ | `EstadoCuenta.tsx:193,197,689`; export `:108` | KPI + tfoot + caja final. |

---

## 4. Benchmark vs InventarioPro (Material B) — feature por feature

> Veredicto AGROMAR vs InventarioPro: **Igual / Mejor / Peor / Falta / No aplica**. "¿Adoptar?" = vale la pena traer la idea del benchmark.
> Nota MX: RUT/boletas chilenas **No aplican**; el equivalente es RFC/notas, que **ya existe** (`Proveedor.rfc`, `datosNegocio.rfc`).

### Dashboard
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| KPI ventas hoy | Igual | No | `Dashboard.tsx:63-81,413` |
| KPI ventas mes | Falta | Parcial | Existe en la gráfica (toggle Mes), no como tarjeta (`Dashboard.tsx:281-331`) |
| KPI compras mes | Falta | **Sí** | El módulo de compras existe pero el dashboard no lo suma (`Dashboard.tsx:411-448`) |
| KPI stock bajo | Igual | No | `Dashboard.tsx:83-115,421` |
| Gráfica ventas | **Mejor** | No | AGROMAR añade rangos semana/mes/año (`Dashboard.tsx:240-381`) |
| Panel acciones rápidas | Peor | **Sí** | Dispersas, no como panel único de 4 (`Dashboard.tsx:464-711`) |
| Lista últimas ventas | Igual | No | `Dashboard.tsx:155-184,636` |
| Productos stock bajo | **Mejor** | No | Barras + criticidad; bonus panel créditos vencidos (`Dashboard.tsx:596-712`) |

### POS / Caja
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| Búsqueda de producto | Igual | No | `POS.tsx:616-645` |
| Búsqueda de cliente | Peor | Parcial | Es `<select>` nativo, no autocompletado (`POS.tsx:746-769`) |
| Selector de documento | Peor | Parcial | No hay control único de tipo de documento (`POS.tsx:886-926`) |
| Método de pago | **Mejor** | No | 4 métodos + crédito a plazo con validación (`POS.tsx:984-1073`) |
| Subtotal/**descuento(%)**/total | Peor | **Sí** | El carrito solo muestra Total; **no existe descuento** (`POS.tsx:370-376,877-883`) |
| Monto recibido + **VUELTO** | Falta | **Sí** | No hay cálculo de cambio en efectivo (`POS.tsx:984-1146`) |
| Botones de montos rápidos | Falta | Parcial | Solo junto con vuelto |
| Nota/observación en venta | Falta | Parcial | La RPC no recibe nota (`POS.tsx:449-459`) |
| **Atajos de teclado** (F2/F3/F4) | Falta | **Sí** | Único listener F2 está inactivo por flag (`POS.tsx:15,199-211`) |
| Tema claro/oscuro | Falta | No | Un solo tema (`index.css`) |
| *Bonus:* bloqueo de venta si caja cerrada | **Mejor** | — | `POS.tsx:33-92,1075-1118` |
| *Bonus:* anti doble-cobro + validación crédito | **Mejor** | — | `POS.tsx:137,402-461` |

### Ventas (historial)
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| Buscador folio/cliente | Igual | No | `historialModel.ts:58,65-67` |
| Rango de fechas desde/hasta | **Mejor** | No | Presets + rango libre (`HistorialVentas.tsx:180-191`) |
| Filtro por estado | **Mejor** | No | +tipo de pago y vendedor (`HistorialVentas.tsx:208-219`) |
| KPIs (incl. descuentos) | Peor | No | No hay descuentos; aporta ticket prom. y contado/crédito |
| Tabla con descuento/acciones | Peor | Parcial | Faltan columnas descuento y acciones por fila |
| Detalle con pago/monto/**vuelto** | Peor | **Sí** | Detalle sin bloque de pago ni totales (`HistorialVentas.tsx:275-306`) |
| Botón **Anular** venta | Falta | **Sí** | No hay RPC de reversa de stock/saldo (`HistorialVentas.tsx:208-213`) |
| Botón Imprimir por venta | Peor | Parcial | Hay export de la lista, no reimpresión individual |
| Botón Nueva venta | Falta | No | Separación intencional (POS) |
| *Bonus:* export Excel/PDF de la lista | **Mejor** | No | `historialModel.ts:120-144` |

### Productos
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| CRUD nombre (editar/borrar) | Peor | **Sí** | Solo alta + ajuste de stock; no hay update/delete (`Catalogo.tsx:71-146`) |
| SKU / unidad / categoría | Igual | No | `Catalogo.tsx:712-749` |
| Descripción | Falta | Parcial | No existe columna ni campo |
| Marca | Falta | Parcial | No existe; relevante en agro (Bayer, Syngenta...) |
| Precio venta | **Mejor** | No | Público + mayoreo (`Catalogo.tsx:776-792`) |
| Precio compra (costo) | **Mejor** | No | Costo real por lote PEPS (`agregar_costo_inventario.sql:12-19`) |
| **Margen / ganancia** calculados | Falta | **Sí** | Datos base existen, no se calcula ni muestra (`Catalogo.tsx:776-805`) |
| Stock / stock mínimo | Mejor/Igual | No | Niveles con barra (`Catalogo.tsx:437-465`) |
| Imagen | Falta | No | `img` es "temporal de maqueta" (`types/index.ts:23`) |
| Estado activo/inactivo | Falta | Parcial | No se pueden descontinuar productos sin borrarlos |
| Modal ajuste de stock (**tipo "ajuste"** + motivo) | Peor | **Sí** | Solo entrada/salida; el `CHECK` no admite "ajuste" (`movimientos_inventario.sql:5`) |
| *Bonus:* movimientos recientes | **Mejor** | No | `Catalogo.tsx:619-674` |

### Catálogos
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| Categorías como entidad (tarjetas+conteo) | Peor | Parcial | Categoría = string; dropdown hardcodeado de 6 (`Catalogo.tsx:742`) |
| Marcas como entidad | Falta | No | No existe; bastaría columna `marca` + filtro |
| Proveedores (CRUD) | Igual | No | Completo, con soft-delete (`ProveedoresTab.tsx`) |
| Clientes (CRUD) | **Mejor** | No | Integra crédito/cobranza (`features/clientes/*`) |

### Configuración
| Feature | Veredicto | ¿Adoptar? | Evidencia / nota |
|---|:--:|:--:|---|
| **Pantalla de Configuración** | Falta | **Sí** | Item del Sidebar es stub muerto (`Sidebar.tsx:232`); no hay case en `App.tsx:87` |
| Datos de empresa (razón social, RFC, tel, dir, email, logo) | Peor | **Sí** | Existen pero **hardcodeados** en `datosNegocio.ts`; no editables (falta logo) |
| Moneda e impuestos (símbolo, ISO, IVA%) | Peor | Parcial | MXN/`$`/`es-MX` fijos; IVA por producto pero sin default global |
| Alertas de inventario (stock mínimo global) | Peor | Parcial | Existe por producto, no global |
| Backup SQL | Falta | Parcial | No copiar dump SQL; mejor export CSV/XLSX |
| Info del sistema (versión/entorno) | Falta | **Sí** | Trivial; mejora soporte en campo |

---

## 5. Mejoras priorizadas (impacto vs esfuerzo)

### ⚡ Quick wins (≤ medio día)

| # | Mejora | Impacto | Evidencia / dónde |
|---|--------|:------:|-------------------|
| Q1 | **Botón "Imprimir" en los PDF** (pagaré/nota, cotización, orden) además de descargar — cierra el req. 8 del contrato | Alto | `notaCreditoPagarePDF.ts:137`, etc. (usar `.output('dataurlnewwindow')`/`autoPrint`) |
| Q2 | **Arreglar columna "DÍAS DE ATRASO"** → usar `max(0, diasDeAtraso(fecVen, today))` (ya existe `fecVen`) | Alto | `EstadoCuenta.tsx:171` |
| Q3 | **Quitar/llenar la columna FACTURA** vacía del estado de cuenta (o renombrar a remisión) | Medio | `EstadoCuenta.tsx:718,754` |
| Q4 | **Atajos de teclado** en POS (Enter=cobrar, `/`=buscar, Esc=cerrar) — clase `kbd` ya existe | Alto | `POS.tsx:15,198` |
| Q5 | **Margen/utilidad** en alta y lista de producto (con `costo` y `precio_publico` ya capturados) | Alto | `Catalogo.tsx:466,776-805` |
| Q6 | **Acciones rápidas** reales en el Tablero (abrir caja, abono, nuevo producto/cliente) vía `onNav` | Medio | `Dashboard.tsx:459-472` |
| Q7 | **Motivo tipificado** en salidas de inventario (merma/caducidad/robo/ajuste) | Medio | `Catalogo.tsx:193,602` |
| Q8 | **Crédito disponible en vivo** al activar nota a crédito (saldo proyectado + barra) | Medio | `POS.tsx:770`; patrón en `Clientes.tsx:336` |
| Q9 | **Filtro por categoría/estado de stock** en Catálogo (reusar pills del POS) | Medio | `Catalogo.tsx:247`; `POS.tsx:629` |
| Q10 | **Estado vacío** en tabla de Catálogo + validación de SKU duplicado / margen inverso inline | Bajo-Medio | `Catalogo.tsx:71,392` |
| Q11 | **Info del sistema** (versión/entorno) y eliminar campos "temporal de maqueta" de `types` | Bajo | `types/index.ts:23,47-48` |

### 🏗️ Iniciativas mayores

| # | Iniciativa | Impacto | Esfuerzo | Nota |
|---|-----------|:------:|:------:|------|
| M1 | **Unificar la fuente de verdad de caja/cobranza**: registrar abonos y cobros no-efectivo (débito/transferencia/tarjeta) en `movimientos_caja` con categoría efectivo/banco, y construir `ReporteCaja` de forma consistente | Alto | Medio-Alto | Cierra los 3 Altos (T-CAJA-1/2/3) |
| M2 | **Vuelto/cambio en efectivo** + montos rápidos en POS, reflejado en ticket | Alto | Medio | `POS.tsx`, `CheckoutSuccessModal.tsx` |
| M3 | **Edición/baja (soft-delete) de productos** + estado activo/inactivo + (opcional) marca | Alto | Medio | falta `update/delete` + columna `activo` |
| M4 | **RPC `fn_cancelar_venta`** transaccional (repone stock por lote, resta `saldo_deudor`) + botón Anular | Medio | Medio | habilita estado `cancelada` real |
| M5 | **Capa de Configuración** (tabla `empresa`/`configuracion` + UI de Ajustes solo-admin): datos fiscales, logo, moneda, IVA default, categorías | Alto (productización) | Alto | destraba la visión de producto |
| M6 | **Normalizar zonas horarias** a `America/Mexico_City` en `lib/dates.ts` y rangos de reportes + tests con `TZ≠MX` | Medio | Medio | T-FECHA-1/3 |
| M7 | **Cotización por secciones de categoría** + **desglose Subtotal/IVA en orden de compra** | Medio | Medio | cierra reqs. 5b y 7 |
| M8 | **Endurecer RLS/roles**: revocar `EXECUTE`/`SELECT` de `anon`/visitante a columnas sensibles; trigger anti último-admin; `handle_new_user` forzar rol seguro | Medio | Medio | T-RLS-1..4 |

---

## 6. Riesgos técnicos (verificados adversarialmente)

> Severidad final tras refutación. Muchos "descuadres de caja" iniciales se confirmaron como brechas de **reporte/conciliación**, no pérdida de efectivo físico (el arqueo de billetes cuadra). Citas `archivo:línea` reales.

### 🔴 Altos (3)

| ID | Riesgo | Evidencia | Detalle / recomendación |
|----|--------|-----------|-------------------------|
| T-CAJA-1 | **Los abonos a crédito no entran a `movimientos_caja`** → `ReporteCaja` omite toda la cobranza; abonos por tarjeta/débito no se contabilizan en ningún total | `RegistrarPagoModal.tsx:56-65`; `20260616000003:32-50`; `Caja.tsx:492-498`; `ReporteCaja.tsx:151-156,183-185` | En un negocio intensivo en crédito, la cobranza es entrada primaria de efectivo y el reporte histórico la ignora. Registrar el abono también en `movimientos_caja` (efectivo/banco) y manejar los 4 métodos. |
| T-CAJA-2 | **El corte ignora abonos pagados con tarjeta/débito** (mal etiquetados como "transferencia" en el timeline) | `Caja.tsx:40,493,552-561`; `RegistrarPagoModal.tsx:335-338` | El tipo `PagoCreditoCajaDB.metodo` miente (solo efectivo/transferencia). Cobros reales desaparecen de la conciliación. Añadir buckets tarjeta/débito. |
| T-FECHA-2 | **Columna "DÍAS DE ATRASO" cuenta días desde la VENTA, no mora** (ignora `plazo_dias`); contradice el badge y **viaja al PDF/Excel del cliente** | `EstadoCuenta.tsx:170-171,714,743,219` | Una nota a 45 días emitida hace 10 muestra "10 días de atraso" con badge AL CORRIENTE. Quick win Q2. |

### 🟡 Medios (14)

| ID | Riesgo | Evidencia | Nota |
|----|--------|-----------|------|
| T-RLS-1 | **Visitante puede leer toda la cartera** (clientes, saldos, ventas, pagos) vía API | `permitir_consulta_visitante.sql:16-30` | Excede "solo precios"; intencional pero indocumentado y contradice la matriz de roles (`politicas_rls_por_rol.sql:122`). Restringir columnas sensibles. |
| T-RLS-2 | **`anon` lee toda la tabla `productos`** incluyendo `costo`, `stock`, `precio_mayoreo` | `politicas_rls_por_rol.sql:100-101` | La anon key viaja al navegador → fuga de margen/existencias. El scanner solo necesita `nombre` (`MobileScanner.tsx:137`). Usar vista/RPC con columnas públicas. |
| T-RLS-3 | **`handle_new_user` toma el rol de `user_metadata` sin validar** → auto-escalada a admin **si** el signup público de Auth está habilitado | `configurar_supabase_auth.sql:20` | No verificable en repo (no hay `config.toml`). Forzar rol seguro por defecto + deshabilitar signup. |
| T-CAJA-3 | **Ventas de contado con débito/transferencia no entran a `movimientos_caja`** | `20260616000005:84`; `POS.tsx:1009,1026` | `ReporteCaja` (que lee solo `movimientos_caja`) las omite. `Caja.tsx` sí las carga de `ventas` pero las clasifica mal. No afecta el efectivo esperado. |
| T-CAJA-4 | **`Caja.tsx` no contempla débito/transferencia en el desglose del turno** | `Caja.tsx:30,484-490,542` | El total del turno las suma pero no aparecen en categorías → descuadre visual. |
| T-IVA-1 | **Ticket y WhatsApp no muestran línea de IVA** y recalculan importes sin `round2` | `CheckoutSuccessModal.tsx:31,389`; `POS.tsx:506` | Si `iva>0`, el cliente ve SUBTOTAL≠TOTAL sin explicación. Usar `subtotalLinea`. |
| T-FECHA-1 | **`parseLocalDate` interpreta el `timestamptz` en la TZ del navegador**, no `America/Mexico_City` → off-by-one en vencimientos si el equipo no está en UTC-6 | `dates.ts:14-19` | Latente para un solo local en Irapuato; real para acceso remoto/SSR. Anclar a TZ de la tienda. |
| T-FECHA-3 | **`rangoDeFechas` arma los límites en hora local del navegador** y los envía como UTC | `historialModel.ts:23-46`; `HistorialVentas.tsx:64-65` | Ventas de los bordes (madrugada/fin de día) caen en el día equivocado fuera de UTC-6. Mismo patrón en Dashboard/Reportes. |
| T-COB-1 | **Sobre-pago de abono sin tope en servidor**: el exceso se oculta (`GREATEST(0,...)`) y la venta se marca cobrada | `RegistrarPagoModal.tsx:48`; `20260616000003:36` | Única validación es client-side con prop desactualizada. Mover a RPC con `FOR UPDATE`. |
| T-VEN-1 | **Estado `cancelada` sin flujo de cancelación**: no revierte stock ni saldo; `CreditosList` lo cuenta como **PAGADA** | `inicializar_esquema_pos.sql:60`; `CreditosList.tsx:158-160` | Latente (ningún path lo genera hoy). Implementar RPC o quitar el estado. |
| T-COB-2 | **Validación de límite de crédito sin row-lock** (TOCTOU): 2 ventas concurrentes del mismo cliente pueden exceder el límite | `20260616000005:42,55,79` | Poco frecuente en mostrador único. `SELECT ... FOR UPDATE` del cliente. |
| T-ERR-1 | **Errores de Supabase silenciados** (solo `console.error`): el POS/Catálogo muestran "sin datos" indistinguible de un fallo de red/RLS | `POS.tsx:183,69-71`; `Catalogo.tsx:174-176` | Patrón de banner ya existe en `EstadoCuenta`/`Caja`. |
| T-RPC-1 | (Defensa en profundidad, bajado a relevancia menor) `fn_registrar_venta_completa` **no revoca `EXECUTE` a `anon`** y el comentario que lo afirma es falso | `20260616000005:4` | Mitigado por el guard interno `es_operador()`. Revocar explícitamente. |
| T-IVA-2 | **Modelos de IVA contradictorios** (venta calcula por partida; compra/cotización lo niegan; `ordenes_compra.tasa_iva` default 0.16) | `NuevaOrdenModal.tsx:38`; `proveedores_compras.sql:27` | Sin riesgo por flujo normal (ningún UI pone `tasa_iva>0`). Definir política única. |

### ⚪ Bajos (15, resumen)
Políticas de desarrollo abiertas históricas ya droppeadas pero frágiles (`ajustar_politicas_rls_desarrollo.sql:28`); sin salvaguarda contra dejar el sistema **sin admin** (`politicas_rls_por_rol.sql:86`); `calcularTotalesOrden` redondea IVA distinto que la venta (`compras.ts:28`); cobertura de tests de IVA mixto y de caja ausente (`money.test.ts:38`); riesgo teórico de **overflow `DECIMAL(10,2)`** en `saldo_deudor`/totales (`inicializar_esquema_pos.sql:45`); `ReporteCobranza` recalcula fechas por su cuenta (`ReporteCobranza.tsx:174`); sin tests bajo `TZ≠MX` (`dates.test.ts`); doble apertura de caja sin guarda (`Caja.tsx:354`); **lógica duplicada** de fechas/saldo entre `EstadoCuenta` y `CreditosList` (`EstadoCuenta.tsx:78` / `CreditosList.tsx:42`); **folio de abono de baja entropía** sin reintento ante colisión `UNIQUE` (`RegistrarPagoModal.tsx:55`); sin validación de teléfono/montos en alta de cliente (`NuevoClienteModal.tsx:40`); alta de producto no transaccional + SKU sin verificación previa (`Catalogo.tsx:71,101`).

---

## 7. Encaje con la visión de producto (plantilla vendible)

> Objetivo: "modelo A" (instancia Supabase por cliente) primero, SaaS después.

**✅ Acelera**
- **Datos del negocio centralizados** en `src/lib/datosNegocio.ts:4-15` (razón social, RFC, dirección, CP, teléfonos), consumidos por todos los PDF. El propio archivo declara la intención de reúso. → convertir a tabla de config.
- **Conexión Supabase por `.env`** (`supabase.ts:3-15`, `.env.example`): cada cliente = su proyecto + su `.env`. Encaja perfecto con el modelo A sin cambios.

**⛔ Bloquea (modelo A limpio)**
- **Branding "AGROMAR"/logo escrito directo en JSX**, sin leer `datosNegocio`: `Sidebar.tsx:125-176`, `Login.tsx:46-140`, `App.tsx:29`, `MobileScanner.tsx:236`, `index.html:5-7`; logo como asset físico `/logo-agromar.png` (también en `pdfBase.ts:9`).
- **Ticket con dirección/teléfono hardcodeados** y **divergentes** de `datosNegocio` (tel `107-8185` vs `622-0039`): `CheckoutSuccessModal.tsx:361-364`. Doble fuente de verdad.
- **Seed de usuarios demo con contraseñas en la migración** (`configurar_supabase_auth.sql:32-68`): `admin@agromar.com/adminAgromar`, etc. **No debe** ir en el pipeline de otro cliente.
- **Mensajes/webhooks n8n con marca y paths fijos** `agromar-ventas`/`agromar-abonos` (`POS.tsx:520,537`; `RegistrarPagoModal.tsx:82,93`). La URL sí es configurable por env, el texto y el path default no.
- **Categorías de producto fijas** en el alta (`Catalogo.tsx:742-747`); otro giro no podría capturar sus categorías sin tocar código.
- **Moneda MXN/locale es-MX fijos** (`format.ts:1-5`; `numeroEnLetras.ts:55` "PESOS .../100 M.N." en el pagaré).
- **No existe tabla ni UI de configuración de empresa/tenant** (`grep empresa|config|tenant` = 0 tablas): hoy "configurar un negocio nuevo" = editar `datosNegocio.ts` + reemplazar logo + tocar JSX + recompilar.

**🟦 Neutral / específico de nicho**
- **Sin multi-tenancy en BD** (ninguna tabla tiene `tenant_id`): **sirve tal cual** para el modelo A (aislamiento por proyecto); para SaaS compartido es **reescritura mayor** (tenant_id + reescribir todas las RLS + claim de tenant).
- **IVA por producto en BD** (flexible, reutilizable) pero **tasa 0 fija en compras** (`NuevaOrdenModal.tsx:37-38`).
- **Localización MX** (timezone, lada 52, plantilla legal del pagaré): no estorba dentro de MX; parametrizable para multi-país.
- **Reglas de crédito**: el plazo **sí** es configurable por cliente/venta; el cron de mora vigente ya respeta `plazo_dias` por venta (`fix_evaluar_morosos.sql`).

**Conclusión visión:** la inversión de mayor retorno para productizar es **M5 (capa de Configuración)** + auditar y eliminar el branding hardcodeado + separar el seed demo de las migraciones estructurales. Con eso, el modelo A pasa de "editar código y recompilar por cliente" a "alta de instancia por configuración".

---

## 8. Plan por fases sugerido

**Fase 0 — Pre-implementación AGROMAR (antes de Velneo) · 2-4 días**
Cierre de contrato y de los Altos: Q1 (imprimir PDFs), Q2 (días de atraso), Q3 (factura), M7-parcial (desglose IVA en orden de compra) y **M1** (unificar caja/cobranza, T-CAJA-1/2/3). Validar la política de IVA contra los 905 productos a migrar.

**Fase 1 — Robustez operativa · 1 semana**
M2 (vuelto + montos rápidos), M6 (zonas horarias + tests `TZ≠MX`), T-COB-1 (sobre-pago en RPC), T-ERR-1 (banners de error), M8 (endurecer RLS: visitante, `anon`, `handle_new_user`, anti último-admin).

**Fase 2 — Paridad y UX de inventario/ventas · 1-2 semanas**
M3 (editar/baja de productos + activo/inactivo + marca), M4 (anular venta con reversa), Q5-Q10 (margen, acciones rápidas, motivo de ajuste, crédito en vivo, filtros, validaciones), reemplazar `alert()` por toasts.

**Fase 3 — Productización (plantilla vendible) · 2-3 semanas**
**M5** (tabla `configuracion` + UI de Ajustes solo-admin), migrar branding/logo/moneda/IVA/categorías a runtime, separar seed demo de migraciones, info del sistema. Resultado: alta de instancia "modelo A" por configuración, sin recompilar.

**Fase 4 (futuro) — SaaS multi-tenant**
Solo si el negocio lo justifica: `tenant_id` en todas las tablas, reescritura de RLS por tenant, claim de tenant en Auth, logo por Storage. Reescritura mayor; abordar tras validar tracción comercial del modelo A.

---

*Informe generado por análisis multi-agente sobre el código real del repo (sin modificarlo). Cada estado de cobertura y cada hallazgo Alto/Medio pasó por una segunda verificación adversarial independiente.*
