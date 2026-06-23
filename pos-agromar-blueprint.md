# POS AGROMAR — Blueprint Arquitectónico

> Generado por The Architect el 12 de junio de 2026
> Arquetipo: Internal Tool / Web App (Híbrido)

---

## 0. Actualización de Alcance (15 de junio de 2026)

> Esta sección registra los cambios acordados con el cliente (Karen Aguilar) **durante** el
> desarrollo. Tiene prioridad sobre cualquier mención previa en este documento.

- **Código de barras — RETIRADO del alcance.** El cliente decidió no usar lectura por
  código de barras. El componente de escaneo queda desactivado a propósito. La captura en
  el POS se hace por **búsqueda manual (nombre / SKU)**. Las menciones a "lector de código
  de barras", `Scanner.tsx` y al input oculto en las secciones 1, 5, 6 y 9 quedan **sin efecto**.
- **Correo electrónico (Resend) — RETIRADO; reemplazado por WhatsApp.** Ya no se envían
  comprobantes ni avisos por correo. En su lugar, las notificaciones (comprobante de venta,
  abonos y aviso de crédito) se envían por **WhatsApp**, mediante una automatización con
  **n8n + Evolution API** (orquestación local vía `docker-compose.yml`), con respaldo a
  enlace `wa.me`. Esto sustituye la fila "Email Service / Resend" del stack (sección 2) y el
  "envío por correo" del Módulo 08.
- **Ajuste de inversión:** la cotización se ajustó de **$17,000** a **$16,400 MXN** por los
  cambios anteriores.

---

## 1. Resumen del Proyecto

### Visión
Desarrollar un Sistema de Punto de Venta (POS) progresivo (PWA) y a la medida para **AGROMAR Insumos del Campo** (Irapuato, Gto.), reemplazando su sistema actual (Velneo) con una solución moderna, veloz y sin cargos recurrentes. El sistema automatizará el registro de ventas (tanto de contado como a crédito), el control de existencias en tiempo real de más de 900 productos (semillas, herbicidas, insecticidas, foliares, fungicidas, abono) estructurado bajo inventario PEPS (Primeras Entradas, Primeras Salidas), y el bloqueo automático de créditos a clientes morosos mediante tareas programadas.

### Objetivos (Fase 1: Alcance Vital Reducido)
1. **Catálogo e Inventario PEPS:** Gestión de productos con stock decimal y lotes con fechas de caducidad.
2. **Punto de Venta (POS):** Venta rápida mediante búsqueda manual por nombre/SKU, ventas anónimas y a clientes registrados, así como movimientos de caja. *(Código de barras retirado del alcance — ver §0.)*
3. **Control de Crédito Básico:** Registro de saldo deudor por cliente y bloqueo de crédito automático si hay deudas vencidas.
4. **Autenticación Básica:** Login y roles (Administrador, Vendedor, Visitante).

### Métricas de Éxito
- **Tiempo de cobro:** Registro de una venta en menos de 10 segundos mediante búsqueda rápida por nombre/SKU.
- **Precisión del Inventario:** Cero discrepancias en existencias al descontar de forma automática los lotes más antiguos (PEPS).
- **Control de Riesgo:** Bloqueo del 100% de los clientes morosos de forma automatizada cada medianoche.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Razón del Arquitecto |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite + TypeScript | Compilación ultrarrápida, tipado estricto para evitar bugs en operaciones numéricas y soporte PWA nativo. |
| **Language** | TypeScript | Obligatorio para asegurar contratos de datos estrictos entre el POS y Supabase. |
| **Estilos** | Vanilla CSS (Variables + Flex/Grid) | Se reutiliza el excelente diseño de `DISENO/index.html` (colores OKLCH) asegurando ligereza y control total del diseño. |
| **Database & Auth** | Supabase (PostgreSQL) | Manejo relacional robusto con triggers SQL para PEPS y soporte para `pg_cron` en la nube. |
| **Notificaciones** | WhatsApp (n8n + Evolution API) | Envío de comprobantes de venta, abonos y avisos de crédito por WhatsApp. Orquestado con n8n + Evolution API vía `docker-compose`, con respaldo a enlace `wa.me`. *(Sustituye a Resend/correo — ver §0.)* |
| **Hosting** | Cloudflare Pages | Alojamiento gratuito de la aplicación web con despliegues continuos integrados a GitHub. |
| **Package Manager** | npm | Estándar por defecto del desarrollador, disponible tanto en Windows como macOS. |

---

## 3. Estructura de Directorios (Vite + React + TS)

```
pos-agromar/
  ├── .github/workflows/
  │     └── deploy.yml              # Pipeline de Cloudflare Pages
  ├── public/                       # Activos estáticos (logo, manifiesto PWA)
  ├── src/
  │     ├── assets/                 # Estilos CSS globales y variables
  │     │     └── index.css         # Basado en el diseño OKLCH de la demo
  │     ├── components/             # Componentes reutilizables generales
  │     │     ├── Icon.tsx          # Componente de iconos SVG unificado
  │     │     ├── Topbar.tsx        # Barra superior con navegación y estados de caja
  │     │     └── Sidebar.tsx       # Menú lateral dinámico según rol
  │     ├── features/               # Módulos organizados por dominio
  │     │     ├── auth/
  │     │     │     └── Login.tsx
  │     │     ├── pos/
  │     │     │     ├── Cart.tsx    # Carrito de compra, selección de tipo de venta
  │     │     │     ├── ProductGrid.tsx
  │     │     │     └── Scanner.tsx # Lector de código de barras
  │     │     ├── inventario/
  │     │     │     ├── Catalogo.tsx
  │     │     │     └── LotesList.tsx
  │     │     └── clientes/
  │     │           ├── ClientList.tsx
  │     │           └── CreditoDetail.tsx
  │     ├── lib/                    # Configuración de clientes de infraestructura
  │     │     └── supabase.ts       # Inicialización del cliente Supabase
  │     ├── types/                  # Definición de interfaces TypeScript
  │     │     └── index.ts          # Tipados para Producto, Cliente, Lote, Venta, etc.
  │     ├── App.tsx                 # Router principal de pantallas
  │     └── main.tsx                # Inicializador de React
  ├── .gitignore
  ├── mcp_config.json               # Configuración de MCPs de Supabase y Vercel
  ├── package.json
  ├── tsconfig.json
  └── vite.config.ts
```

---

## 4. Modelo de Datos (Esquema PostgreSQL)

### Entidades

**`perfiles`** (Extensión del esquema de auth de Supabase)
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Relacionado a `auth.users(id)` |
| `email` | `VARCHAR` | Correo electrónico |
| `nombre` | `VARCHAR` | Nombre completo del usuario |
| `rol` | `VARCHAR` | `'admin' \| 'vendedor' \| 'visitante'` |

**`productos`**
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `sku` | `VARCHAR` (Unique) | Código de barras o clave del producto |
| `nombre` | `VARCHAR` | Nombre del insumo |
| `categoria` | `VARCHAR` | `'Semillas' \| 'Herbicidas' \| 'Insecticidas' \| 'Foliares' \| 'Fungicidas' \| 'Abono'` |
| `unidad` | `VARCHAR` | Presentación (`costal 20kg`, `botella 1L`, etc.) |
| `precio_publico`| `DECIMAL(10,2)` | Precio de venta general |
| `precio_mayoreo`| `DECIMAL(10,2)` | Precio para clientes frecuentes |
| `tasa_iva` | `DECIMAL(4,2)` | Porcentaje de IVA (`0.00` por defecto para tasa 0% del campo) |
| `stock` | `DECIMAL(10,2)` | Existencia consolidada (calculada mediante Trigger) |
| `stock_minimo` | `DECIMAL(10,2)` | Umbral para alertas de stock bajo |

**`lotes`** (Estructura necesaria para el PEPS)
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `producto_id` | `UUID` (FK) | Relación a `productos` |
| `lote_no` | `VARCHAR` | Identificador del lote del fabricante |
| `stock_lote` | `DECIMAL(10,2)` | Existencia particular de este lote |
| `fecha_caducidad`| `DATE` | Fecha de expiración (opcional para abonos) |
| `fecha_entrada` | `TIMESTAMP` | Fecha de registro en inventario (usada para FIFO) |

**`clientes`**
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `nombre` | `VARCHAR` | Nombre completo |
| `rancho` | `VARCHAR` | Nombre del rancho o predio |
| `telefono` | `VARCHAR` | Teléfono de contacto |
| `limite_credito`| `DECIMAL(10,2)` | Crédito máximo disponible |
| `saldo_deudor`  | `DECIMAL(10,2)` | Total acumulado de notas pendientes |
| `activo_para_credito` | `BOOLEAN` | `TRUE` por defecto. Cambia a `FALSE` si tiene deudas vencidas |

**`ventas`**
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `folio` | `VARCHAR` (Unique)| Consecutivo incremental (ej. `V-04813`) |
| `cliente_id` | `UUID` (FK, Null) | Relación a `clientes`. Nulo para Venta Anónima |
| `vendedor_id` | `UUID` (FK) | Relación a `perfiles(id)` |
| `tipo_pago` | `VARCHAR` | `'efectivo' \| 'tarjeta' \| 'credito'` |
| `subtotal` | `DECIMAL(10,2)` | Suma de importes sin impuestos |
| `iva` | `DECIMAL(10,2)` | Impuesto calculado |
| `total` | `DECIMAL(10,2)` | Subtotal + IVA |
| `estado` | `VARCHAR` | `'cobrada' \| 'pendiente' (créditos) \| 'cancelada'` |
| `fecha` | `TIMESTAMP` | Fecha y hora de transacción |

**`ventas_detalles`**
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `venta_id` | `UUID` (FK) | Relación a `ventas` |
| `producto_id` | `UUID` (FK) | Relación a `productos` |
| `lote_id` | `UUID` (FK) | Relación a `lotes`. Registra de qué lote se extrajo |
| `cantidad` | `DECIMAL(10,2)` | Cantidad vendida (soporta decimales) |
| `precio_unitario`| `DECIMAL(10,2)`| Precio al momento de la venta |
| `subtotal` | `DECIMAL(10,2)` | Cantidad * precio_unitario |

**`movimientos_caja`**
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `vendedor_id` | `UUID` (FK) | Relación a `perfiles(id)` |
| `tipo` | `VARCHAR` | `'apertura' \| 'ingreso' \| 'egreso' \| 'venta'` |
| `monto` | `DECIMAL(10,2)` | Cantidad de dinero |
| `descripcion` | `VARCHAR` | Justificación (ej: "Fondo inicial", "Pago de luz") |
| `fecha` | `TIMESTAMP` | Fecha y hora del movimiento |

**`pagos_credito`** (Historial de abonos)
| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado automáticamente |
| `venta_id` | `UUID` (FK) | Relación a `ventas` de tipo de pago crédito |
| `monto` | `DECIMAL(10,2)` | Cantidad abonada |
| `metodo` | `VARCHAR` | `'efectivo' \| 'transferencia'` |
| `fecha` | `TIMESTAMP` | Fecha y hora del abono |
| `folio_pago` | `VARCHAR` | Consecutivo incremental (ej. `P-2231`) |

---

### Script de Base de Datos (DDL)

```sql
-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Perfiles
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  nombre VARCHAR NOT NULL,
  rol VARCHAR CHECK (rol IN ('admin', 'vendedor', 'visitante')) DEFAULT 'vendedor',
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de Productos
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR UNIQUE NOT NULL,
  nombre VARCHAR NOT NULL,
  categoria VARCHAR NOT NULL,
  unidad VARCHAR NOT NULL,
  precio_publico DECIMAL(10,2) NOT NULL CHECK (precio_publico >= 0),
  precio_mayoreo DECIMAL(10,2) NOT NULL CHECK (precio_mayoreo >= 0),
  tasa_iva DECIMAL(4,2) DEFAULT 0.00 CHECK (tasa_iva >= 0),
  stock DECIMAL(10,2) DEFAULT 0.00 CHECK (stock >= 0),
  stock_minimo DECIMAL(10,2) DEFAULT 5.00 CHECK (stock_minimo >= 0),
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Lotes (PEPS/FIFO)
CREATE TABLE lotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  lote_no VARCHAR NOT NULL,
  stock_lote DECIMAL(10,2) NOT NULL CHECK (stock_lote >= 0),
  fecha_caducidad DATE,
  fecha_entrada TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla de Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR NOT NULL,
  rancho VARCHAR,
  telefono VARCHAR,
  limite_credito DECIMAL(10,2) DEFAULT 0.00 CHECK (limite_credito >= 0),
  saldo_deudor DECIMAL(10,2) DEFAULT 0.00 CHECK (saldo_deudor >= 0),
  activo_para_credito BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla de Ventas
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio VARCHAR UNIQUE NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT,
  tipo_pago VARCHAR CHECK (tipo_pago IN ('efectivo', 'tarjeta', 'credito')) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  iva DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  estado VARCHAR CHECK (estado IN ('cobrada', 'pendiente', 'cancelada')) DEFAULT 'cobrada',
  fecha TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla Detalles de Venta
CREATE TABLE ventas_detalles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE RESTRICT,
  lote_id UUID REFERENCES lotes(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL
);

-- 7. Tabla Movimientos de Caja
CREATE TABLE movimientos_caja (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendedor_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT,
  tipo VARCHAR CHECK (tipo IN ('apertura', 'ingreso', 'egreso', 'venta')) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  descripcion VARCHAR,
  fecha TIMESTAMP DEFAULT NOW()
);

-- 8. Tabla Pagos de Créditos (Abonos)
CREATE TABLE pagos_credito (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  metodo VARCHAR CHECK (metodo IN ('efectivo', 'transferencia')) NOT NULL,
  fecha TIMESTAMP DEFAULT NOW(),
  folio_pago VARCHAR UNIQUE NOT NULL
);

-- RLS (Row Level Security) - Habilitar por defecto para producción
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_credito ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS Básicas (Autenticados pueden leer todo, escribir Admins y Vendedores)
CREATE POLICY "Permitir lectura general a autenticados" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura general a autenticados" ON clientes FOR SELECT TO authenticated USING (true);
```

### Disparadores y Funciones Avanzadas en Postgres

#### A. Actualización y Descuento Automático PEPS
Este disparador se activa cuando se intenta vender un producto. Descuenta la cantidad vendida recorriendo los lotes disponibles del producto del más viejo al más nuevo (FIFO/PEPS).

```sql
CREATE OR REPLACE FUNCTION fn_descontar_lotes_peps()
RETURNS TRIGGER AS $$
DECLARE
  cantidad_restante DECIMAL(10,2) := NEW.cantidad;
  lote_record RECORD;
  cantidad_descontar DECIMAL(10,2);
BEGIN
  -- Verificar existencia total
  IF (SELECT stock FROM productos WHERE id = NEW.producto_id) < NEW.cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado.';
  END IF;

  -- Bucle para recorrer lotes ordenados por fecha de entrada (PEPS)
  FOR lote_record IN 
    SELECT id, stock_lote 
    FROM lotes 
    WHERE producto_id = NEW.producto_id AND stock_lote > 0 
    ORDER BY fecha_entrada ASC 
  LOOP
    EXIT WHEN cantidad_restante <= 0;

    IF lote_record.stock_lote >= cantidad_restante THEN
      -- El lote actual cubre toda la cantidad restante
      UPDATE lotes 
      SET stock_lote = stock_lote - cantidad_restante 
      WHERE id = lote_record.id;
      
      -- Asignar el lote_id en el detalle de venta
      NEW.lote_id := lote_record.id;
      cantidad_restante := 0;
    ELSE
      -- El lote actual solo cubre una parte
      UPDATE lotes 
      SET stock_lote = 0 
      WHERE id = lote_record.id;

      cantidad_restante := cantidad_restante - lote_record.stock_lote;
    END IF;
  END LOOP;

  -- Si después de recorrer no se pudo cubrir (caso extremo/error concurrencia)
  IF cantidad_restante > 0 THEN
    RAISE EXCEPTION 'Error al procesar el inventario PEPS. Inconsistencia de stock.';
  END IF;

  -- Actualizar stock consolidado del producto
  UPDATE productos
  SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_descontar_lotes_peps
BEFORE INSERT ON ventas_detalles
FOR EACH ROW
EXECUTE FUNCTION fn_descontar_lotes_peps();
```

#### B. Bloqueo de Clientes Morosos ( pg_cron )
Script de automatización diario que inhabilita clientes con cuentas pendientes vencidas.

```sql
CREATE OR REPLACE FUNCTION fn_evaluar_clientes_morosos()
RETURNS VOID AS $$
BEGIN
  -- Buscar clientes que tengan ventas de tipo 'credito' no liquidadas
  -- con una antigüedad mayor a 30 días naturales.
  UPDATE clientes
  SET activo_para_credito = FALSE
  WHERE id IN (
    SELECT DISTINCT v.cliente_id 
    FROM ventas v
    LEFT JOIN (
      SELECT venta_id, SUM(monto) as total_pagado 
      FROM pagos_credito 
      GROUP BY venta_id
    ) p ON p.venta_id = v.id
    WHERE v.tipo_pago = 'credito' 
      AND v.estado = 'pendiente'
      AND (v.total - COALESCE(p.total_pagado, 0)) > 0
      -- Nota vencida (más de 30 días)
      AND v.fecha < (NOW() - INTERVAL '30 days')
  );
END;
$$ LANGUAGE plpgsql;

-- Para configurar en pg_cron (se ejecuta cada medianoche a las 00:05):
-- SELECT cron.schedule('0 5 * * *', 'SELECT fn_evaluar_clientes_morosos();');
```

---

## 5. API Design (Supabase Auto-Generated REST)

El frontend interactuará directamente con la API REST autogenerada de Supabase usando el SDK JS.

### Rutas Clave de Escritura y Reglas de Validación

#### 1. Crear Venta (`/rest/v1/ventas`)
- **Método:** `POST`
- **Auth:** Requerido (Vendedor o Admin)
- **Body de Entrada:**
  ```json
  {
    "cliente_id": "c004-uuid-...", // O null si es venta anónima
    "tipo_pago": "credito", // 'efectivo' | 'tarjeta' | 'credito'
    "subtotal": 1850.00,
    "iva": 0.00,
    "total": 1850.00,
    "estado": "pendiente" // 'pendiente' para crédito, 'cobrada' para el resto
  }
  ```
- **Regla de Negocio:** Si `tipo_pago == 'credito'`, el frontend validará previamente que `clientes.activo_para_credito == true` y que `total <= (limite_credito - saldo_deudor)`.

#### 2. Registrar Detalles de Venta (`/rest/v1/ventas_detalles`)
- **Método:** `POST` (Envío en lote - Batch)
- **Auth:** Requerido
- **Body de Entrada:**
  ```json
  [
    { "venta_id": "v-uuid", "producto_id": "p-uuid", "cantidad": 2, "precio_unitario": 925.00, "subtotal": 1850.00 }
  ]
  ```
- **Nota:** Al insertar este registro, el trigger `trg_descontar_lotes_peps` se encarga del FIFO en segundo plano de manera atómica.

---

## 6. Arquitectura Frontend

### Rutas y Pantallas
1. `/login` -> Vista de acceso para el personal.
2. `/pos` -> Punto de Venta. Con lector de códigos de barras enfocado, categorías y selección de cliente.
3. `/clientes` -> Tarjetas resumidas de clientes, balance de deuda y accesos a sus estados de cuenta.
4. `/inventario` -> Vista de productos, existencias críticas y listado de lotes ingresados.

### Jerarquía de Componentes del POS

```
App (Router del Estado de Pantalla)
  ├── Sidebar (Navegación e info del usuario autenticado)
  └── Main (Contenedor de Pantalla Activa)
        └── POS (Nueva Venta)
              ├── Topbar (Folio dinámico, botón Suspender/Cancelar)
              ├── Grid (Contenedor izquierdo)
              │     ├── Scanner (Input del F2 oculto para códigos de barra)
              │     ├── SearchBar (Buscador manual)
              │     ├── CategoryPills (Filtros por categoría)
              │     └── ProductGrid (Tarjetas con stock e indicador de stock crítico)
              └── Cart (Panel lateral derecho)
                    ├── CustomerSelector (Elección de cliente o venta anónima)
                    ├── CartItemsList (Productos agregados con modificadores de cantidad)
                    ├── TotalsSummary (Subtotal, IVA 0% o 16%, Total Neto)
                    ├── CreditToggle (Switch de Nota a Crédito a 30 días, si aplica)
                    └── CheckoutButton (Acción de cobro / creación de Nota a Crédito)
```

---

## 7. Sistema de Diseño (Variables CSS)

Utilizamos el sistema de diseño visual responsivo y premium ya establecido en el prototipo con colores OKLCH que evocan un entorno agrícola y limpio:

```css
:root {
  --bg: #f6f3ec;             /* Fondo arena claro */
  --surface: #ffffff;        /* Superficies de tarjetas */
  --surface-2: #fbf9f4;      /* Fondos secundarios */
  --ink: #14191a;            /* Texto principal */
  --ink-2: #3a4140;          /* Texto secundario */
  --muted: #7a827e;          /* Bordes y elementos deshabilitados */
  --muted-2: #a5aaa4;
  --line: #e7e3d8;           /* Línea de división clara */
  --line-2: #efece3;

  /* Identidad Verde Agromar */
  --green: oklch(0.58 0.13 145);      /* #399166 */
  --green-2: oklch(0.52 0.13 145);
  --green-soft: oklch(0.95 0.04 145);
  --green-line: oklch(0.86 0.06 145);

  /* Estados */
  --amber: oklch(0.72 0.14 75);       /* Créditos por vencer */
  --amber-soft: oklch(0.96 0.05 80);
  --red: oklch(0.58 0.16 25);         /* Deudas vencidas y stock crítico */
  --red-soft: oklch(0.96 0.04 25);

  --radius: 12px;
  --radius-sm: 8px;
}
```

---

## 8. Autenticación y Autorización

### Flujo de Acceso
El usuario inicia sesión ingresando su correo y contraseña. Supabase Auth valida las credenciales y devuelve una sesión segura de tipo JWT. Seguido de esto, el sistema consulta la tabla `perfiles` usando el UUID del usuario para obtener su `rol`.

### Permisos por Rol
- **Administrador:** Acceso completo. Edición de productos, modificación de inventario, consulta de balances totales, anulación de deudas y registro de ventas.
- **Vendedor:** Registro de ventas, consulta de catálogo y clientes. Registro de abonos/pagos de crédito y apertura/corte de caja. No puede alterar los precios de catálogo ni editar inventario de forma manual.
- **Visitante (Tía Karen en consulta externa):** Acceso en modo de lectura al Catálogo de productos y estados de cuenta de clientes. POS bloqueado para ventas.

---

## 9. Orden de Construcción (Build Order)

Este es el plan de ejecución secuencial que se debe seguir de forma estricta para lograr una entrega funcional lo antes posible.

### Paso 1: Configuración del Repositorio de Trabajo
* **Acciones:**
  1. Inicializar un nuevo proyecto de React + TypeScript + Vite dentro del directorio de trabajo en la unidad externa: `E:\Proyectos Importantes\AGROMAR\`.
  2. Configurar Git y conectar con el repositorio remoto privado: `https://github.com/Keabop/POS_AGROMAR.git`.
  3. Estructurar el archivo `.gitignore` para omitir carpetas `node_modules`, `dist` y archivos `.env`.
* **Comandos:**
  ```bash
  cd "E:\Proyectos Importantes\AGROMAR"
  npm create vite@latest ./ -- --template react-ts
  git init
  git remote add origin https://github.com/Keabop/POS_AGROMAR.git
  ```

### Paso 2: Diseño de Interfaces Base y Variables CSS
* **Acciones:**
  1. Trasladar las variables CSS y estilos tipográficos de la demo `DISENO/index.html` hacia el archivo `src/assets/index.css`.
  2. Implementar los componentes estructurales globales: `Sidebar.tsx`, `Topbar.tsx` y el archivo de iconos SVG compartidos `Icon.tsx` (basados en los mockups de `DISENO/shell.jsx` e `icons.jsx`).

### Paso 3: Configuración de Base de Datos en Supabase
* **Acciones:**
  1. Conectar con el proyecto creado en Supabase (`POS_Agromar`).
  2. Ejecutar el script DDL (Sección 4 de este documento) en el editor SQL de Supabase para estructurar las tablas y sus relaciones.
  3. Crear el disparador `trg_descontar_lotes_peps` y su función asociada.
  4. Generar políticas de seguridad RLS básicas.

### Paso 4: Catálogo de Productos y Vista de Inventario
* **Acciones:**
  1. Crear la interfaz del Catálogo de Productos y Alertas de Existencias (`Catalogo.tsx`).
  2. Implementar un buscador que filtre por nombre y SKU.
  3. Mostrar detalles del producto e indicador visual si el stock consolidado se encuentra por debajo del stock mínimo.

### Paso 5: Pantalla Nueva Venta — POS (Contado)
* **Acciones:**
  1. Crear la pantalla del POS (`pos.tsx` migrado a TypeScript).
  2. ~~Integrar el lector de código de barras físico.~~ **Retirado del alcance (ver §0).** La captura se realiza por búsqueda manual de nombre/SKU; el producto encontrado se agrega al carrito.
  3. Permitir la manipulación manual de productos en el carrito (añadir, restar cantidad, eliminar).
  4. Implementar el cobro de la venta registrando la venta en la tabla `ventas` con tipo de pago `'efectivo'` o `'tarjeta'` y sus respectivos registros en `ventas_detalles`. El disparador PEPS descontará el inventario en automático.

### Paso 6: Clientes y Venta a Crédito
* **Acciones:**
  1. Crear la vista de clientes y sus perfiles de saldo (`ClientList.tsx`).
  2. Conectar el POS con el selector de clientes registrados.
  3. Habilitar la opción "Nota a Crédito" en el POS para clientes registrados. Si se activa, valida que el saldo no exceda el límite del cliente y crea la venta con estado `'pendiente'`.

### Paso 7: Autenticación de Usuarios y Roles
* **Acciones:**
  1. Conectar `src/lib/supabase.ts` con las credenciales del proyecto Supabase.
  2. Diseñar la pantalla de `/login` para autenticar al usuario.
  3. Implementar la validación de roles (`admin`, `vendedor`, `visitante`) para controlar los accesos y pantallas visibles de la aplicación.

---

## 10. Configuración del Entorno

### Requisitos Previos
- Node.js (v18 o superior)
- npm (v9 o superior)
- Git

### Variables de Entorno (`.env.local`)
Debes crear el archivo en la raíz del proyecto para conectar de manera segura con Supabase:
```env
VITE_SUPABASE_URL=https://your-supabase-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

---

## 11. Dependencias Requeridas

### Producción (Core)
- `@supabase/supabase-js` — Cliente oficial para interactuar con base de datos y autenticación de Supabase.

### Desarrollo (Dev)
- `typescript` — Soporte del lenguaje tipado.
- `@types/react` y `@types/react-dom` — Tipados de React para TypeScript.

---

## 12. CLAUDE.md para el Proyecto Destino

Copia y pega este archivo tal cual en la raíz del repositorio `POS_AGROMAR` para que cualquier instancia de asistente de IA pueda construir y mantener el proyecto sin perder contexto:

```markdown
# POS AGROMAR

Punto de Venta responsivo y optimizado con inventario PEPS (FIFO) y control de crédito para AGROMAR.

## Commands

- `npm run dev` — Inicia el servidor de desarrollo local
- `npm run build` — Genera la compilación para producción (Cloudflare Pages)
- `npm run lint` — Ejecuta el formateador y análisis estático

## Tech Stack

Vite + React 18 + TypeScript + Vanilla CSS + Supabase (Postgres)

## Architecture

### Directory Structure
- `src/assets/` — Hojas de estilos globales y variables CSS de diseño (OKLCH).
- `src/components/` — Sidebar, Topbar, Icon y layouts globales.
- `src/features/` — Módulos de la aplicación: `auth`, `pos`, `inventario`, `clientes`.
- `src/lib/` — Inicialización y cliente de Supabase (`supabase.ts`).
- `src/types/` — Definición de interfaces estrictas de TypeScript (`index.ts`).

### Data Flow
- **POS / Ventas:** Cliente React -> Supabase SDK -> Tabla `ventas` y `ventas_detalles`.
- **PEPS:** Trigger `trg_descontar_lotes_peps` en base de datos descuenta los lotes ordenados por fecha de entrada.
- **Crédito:** Función programada medianoche evalúa atrasos (>30 días) e inactiva clientes de forma automática.

## Code Organization Rules

1. **Un componente por archivo:** Máximo 300 líneas de código. Si crece, divide en subcomponentes.
2. **TypeScript Estricto:** Evita el uso de `any`. Define interfaces en `src/types/index.ts`.
3. **Estilos puros:** No uses Tailwind ni librerías adicionales. Emplea las variables CSS definidas en `src/assets/index.css`.
4. **Validaciones en POS:** Valida el límite de crédito disponible del cliente y su bandera de activación antes de generar una Nota a Crédito.

## Design System

### Colors (OKLCH)
- Fondo: `--bg` = `#f6f3ec`
- Tarjeta/Superficie: `--surface` = `#ffffff`
- Insumos/Verde: `--green` = `oklch(0.58 0.13 145)`
- Alertas/Rojo: `--red` = `oklch(0.58 0.16 25)`
- Alertas/Ámbar: `--amber` = `oklch(0.72 0.14 75)`

## Environment Variables

| Variable | Description |
| :--- | :--- |
| `VITE_SUPABASE_URL` | URL de la base de datos Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anónima de Supabase |
```

---

## 13. Reglas No Negociables del Desarrollo

1. **No Hardcodear el IVA:** Toda tasa de IVA debe leerse de la base de datos (`productos.tasa_iva`). Los insumos de campo agrícola que tienen tasa 0% deben estar explícitos en su campo correspondiente con valor `0.00`.
2. **Cómputo Transaccional en Base de Datos para PEPS:** El descuento de inventario bajo lógica PEPS **debe realizarse del lado de la base de datos (Trigger de Postgres)** de manera atómica para evitar colisiones de stock cuando varios dispositivos realicen ventas simultáneas.
3. **Seguridad en Crédito:** El POS debe rechazar tajantemente el cobro mediante crédito a clientes con `activo_para_credito = FALSE` o que excedan su límite de crédito disponible.
4. **Tipados Estrictos para Cantidades:** El tipo de dato para cantidades de inventario y ventas debe ser de punto flotante en TypeScript (`number`) y `DECIMAL` en base de datos para asegurar el soporte de compras fraccionadas (ej. `1.5` costales).

---

## 14. Plantillas y Formatos de Documentos (Definidos por Fotos de Referencia)

A partir de las plantillas y formatos reales de AGROMAR (provistos en las fotos de referencia), el sistema debe generar e imprimir los siguientes documentos en tamaño carta (PDF/Impresión):

### A. Cotización al Cliente (`Agromar_pdf_cotizacion_cliente.png`)
* **Encabezado:**
  * Logo de AGROMAR en la izquierda.
  * Texto descriptivo: *"Insecticidas, Herbicidas, Fertilizantes y Semillas."*
  * Teléfono: `(462) 107-8185`
  * E-mail: `agromar_irapuato@hotmail.com`
  * Panel verde derecho:
    * `N.º de cotización` (Folio incremental automático, ej: `C-00024`).
    * `Fecha de cotización` (Fecha de generación seleccionable/actual).
* **Sección de Datos del Cliente:**
  * Campos: `Cliente` (Nombre), `Dirección`, `Teléfono`, `Contacto`, `Correo electrónico` y `Factura para`.
* **Tabla de Partidas:**
  * Columnas: `NUMERO` (Consecutivo), `UNIDAD` (Litro, Garrafa 20LTS, etc.), `CANTIDAD`, `DESCRIPCIÓN` (Nombre del producto), `CATEGORIA`, `VALOR UNITARIO` (Precio público o mayoreo aplicable), y `TOTAL` (Cantidad × Valor Unitario).
* **Flexibilidad:** Permite cambiar dinámicamente los **Días de Crédito** para mostrar como propuesta comercial.

### B. Estado de Cuenta de Crédito de Clientes (`Estados_de_cuenta_credito_clientes.png`)
* **Encabezado:**
  * Logo de AGROMAR a la derecha y título *"AGROMAR - CUENTAS POR COBRAR - ESTADO DE CUENTA"*.
  * Fecha de generación.
  * Selector dinámico de **Días de Crédito** (ej: `30` días por defecto) que recalcula las fechas límite y días de atraso en tiempo real.
* **Resumen de Cuenta (Box Superior Izquierdo):**
  * `DIAS DE CREDITO` (Término configurado).
  * `TOTAL VENCIDO` (Suma de los saldos de notas que ya pasaron su fecha de vencimiento).
  * `TOTAL NOTAS` (Suma de los saldos de todas las notas activas, vencidas o al corriente).
* **Datos del Cliente:** `CLIENTE` (ID + Nombre, ej: `53 - ANA SERVIN`) y `DIRECCION`.
* **Tabla de Documentos:**
  * `DIAS DE ATRASO`: Se calcula restando la fecha de generación menos la **fecha original de la venta (FECHA)**. Se expresa como valor negativo (ej: `-85` días de atraso) para indicar antigüedad desde la compra, o positivo para días restantes.
  * `REMISION` (Folio de la nota de venta, ej: `7966`).
  * `FECHA` (Fecha original de compra).
  * `FEC. VEN.` (Fecha de vencimiento original = Fecha + Días de Crédito).
  * `FACTURA` (Folio de factura del SAT si aplica).
  * `SALDO` (Monto insoluto / pendiente de pago de la nota).
  * `STATUS`: Columna de estado dinámico que muestra `"VENCIDA"` (en color rojo) si la nota tiene saldo pendiente y ya venció, `"PAGADA"` (en color rojo) si ya se liquidó, o `"AL CORRIENTE"` si está pendiente pero no vencida.
  * `ABONOS`: Historial de pagos parciales aplicados a esta nota.
  * `FECHA`: Fecha en que se realizó cada abono.
  * `OBSERVACIONES`: Método de pago de los abonos (ej: `TRANSFERENCIA`, `EFECTIVO`).
* **Pie de Página:** Fila de saldo total con la etiqueta `"SALDO POR COBRAR"` y el total acumulado.

### C. Orden de Compra al Proveedor (`Agronar_pdf_ordendecompra_proveedor.png` / `Agromar_pdf_continuacion_ordendecompra_proveedor.png`)
* **Encabezado:**
  * Logo de AGROMAR y dirección completa de la sucursal emisora.
  * Título destacado: *"ORDEN DE COMPRA"*.
  * `Fecha` y `No.` (Folio incremental único, ej: `0000121`).
* **Sección de Datos:**
  * **Proveedor:** Nombre de la empresa proveedora (ej: `VERSA`), dirección completa y contacto.
  * **Dirección de Entrega:** Dirección de la sucursal de AGROMAR, incluyendo los números de contacto y nombres del personal encargado (ej: `[4621078185] Areli Aguilar`, `[4621958499] Juan Castañeda`).
* **Tabla de Productos:**
  * Columnas: `Descripcion` (Insumo solicitado, ej: `SORGO RS 550`), `Cantidad`, `Presentación` (ej: `20 KG`), `Precio unitario` y `TOTALES` (Cantidad × Precio unitario).
* **Pie de Página:**
  * Caja de texto para `Instrucciones` especiales de entrega.
  * Desglose numérico: `Sub-total`, `Iva` (Tasa correspondiente del proveedor) y `TOTAL`.
  * Línea de firma obligatoria: *"Autorizado por: MAURICIO AGUILAR RAZO"*.

### D. Nota de Venta a Crédito con Pagaré (`documento_pdf_pagare_notadeventacredito.png`)
* **Encabezado de Emisión:**
  * Nombre del Responsable: `MAURICIO AGUILAR RAZO`.
  * RFC: `AURM-640315-V77`.
  * Dirección fiscal y de sucursal: `AV. SAN JOSÉ DE JORGE LÓPEZ, NO. 1691...`.
  * Teléfono: `01-(462)-62-2-00-39`.
  * Logo de AGROMAR a la derecha.
* **Datos de la Nota:**
  * Folio de Venta, Clave de Cliente, Nombre del Cliente, Dirección del Cliente, Fecha Límite de Pago, Hora y Fecha de Emisión, y Vendedor que atendió.
* **Detalle de la Compra:**
  * Columnas: `CANTIDAD` (decimal), `DESCRIPCIÓN DEL ARTICULO`, `PU` (Precio Unitario), e `IMPORTE`.
  * Fila de resumen: `TOTAL DE PIEZAS` y `TOTAL` en pesos.
* **Sección Legal (Pagaré):**
  * Título: *"PAGARE (Documento Original)"*.
  * Texto legal estandarizado que compromete incondicionalmente al deudor (cliente) a pagar a Mauricio Aguilar Razo en la ciudad de Irapuato, Gto., en la fecha límite acordada, la cantidad total (representada en número y letra: *"Pesos 00/100 M.N."*) con interés moratorio pactado (por defecto 0% o configurable).
  * Datos explícitos del Deudor: Nombre y Dirección.
  * Línea de firma obligatoria para el deudor en el momento de la entrega de la mercancía.
  * Opción de guardar o imprimir notas de crédito.
