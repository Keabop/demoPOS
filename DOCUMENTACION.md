# Documentación Técnica de Referencia — POS AGROMAR

Este documento contiene la especificación técnica, la estructura de la base de datos y la arquitectura del frontend del **Punto de Venta AGROMAR**. Registra únicamente las implementaciones activas y funcionales del sistema, además de consideraciones de diseño futuro.

---

## 🔄 Cambios de Alcance (15 de junio de 2026)

Ajustes acordados con el cliente **durante** el desarrollo (cotización ajustada de $17,000 a **$16,400 MXN**):

* **Código de barras: retirado.** No se usa lectura por código de barras; el escaneo queda desactivado a propósito. La captura en el POS es por **búsqueda manual (nombre / SKU)**.
* **Correo electrónico: retirado, reemplazado por WhatsApp.** Las notificaciones (comprobante de venta, abonos y avisos de crédito) se envían por **WhatsApp** mediante **n8n + Evolution API** (`docker-compose.yml`), con respaldo a enlace `wa.me`. No hay integración de correo (Resend).
  * 📄 **Guía completa de montaje y configuración** (n8n, Evolution API, ngrok y variables de Cloudflare): ver **[`docs/CONFIGURACION-WHATSAPP.md`](docs/CONFIGURACION-WHATSAPP.md)**.

---

## 🛠️ Stack Tecnológico
* **Frontend:** React 19 + Vite + TypeScript
* **Estilos:** Vanilla CSS (CSS puro con sistema de diseño basado en variables de colores OKLCH)
* **Base de Datos y Autenticación:** Supabase (Postgres)
* **Hosting:** Cloudflare Pages (Configurado con despliegue continuo)

---

## 🔑 Sistema de Autenticación y Perfiles

El sistema de autenticación está integrado directamente con **Supabase Auth**. La sesión se persiste localmente en el navegador y el acceso se restringe automáticamente según el rol del perfil del usuario.

### 1. Sincronización Automática (Trigger en Postgres)
Existe una función y un disparador (`trigger`) en la base de datos que escucha la creación de usuarios en el esquema de autenticación interno de Supabase (`auth.users`) y crea automáticamente su perfil público en `public.perfiles` con su nombre y rol correspondientes.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'vendedor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2. Estructura del Contexto de React (`AuthContext.tsx`)
El estado global de autenticación se gestiona a través de un Context Provider en `src/features/auth/AuthContext.tsx`. Expone los siguientes valores y funciones mediante el hook `useAuth()`:

* `user`: Objeto de usuario autenticado de Supabase Auth.
* `profile`: Objeto de tipo `Perfil` obtenido de `public.perfiles`.
* `loading`: Booleano que indica si la verificación de la sesión inicial está en curso.
* `login(email, password)`: Función asíncrona para iniciar sesión.
* `logout()`: Función asíncrona para cerrar sesión.

### 3. Credenciales de Desarrollo y Demostración
Los siguientes usuarios de prueba están creados y sincronizados en la base de datos de Supabase con contraseñas seguras inicializadas mediante encriptación Blowfish:

| Rol | Correo / Usuario | Contraseña | Pantalla Inicial | Estatus de la Pantalla |
| :--- | :--- | :--- | :--- | :--- |
| **Administrador** | `admin@agromar.com` | `adminAgromar` | Tablero (`dashboard`) | **Activa y Funcional** |
| **Vendedor** | `vendedor@agromar.com` | `vendedorAgromar` | Nueva Venta (`pos`) | **Activa y Funcional** |
| **Usuario / Consulta** | `visitante@agromar.com` | `visitanteAgromar` | Lista de Precios (`precios`) | *En Desarrollo (Placeholder)* |

---

## 🗄️ Modelo de Datos (Base de Datos)

El esquema relacional cuenta con las siguientes tablas clave en el esquema `public`:

### Tabla: `perfiles`
* **`id`**: `UUID` (PK, referenciado a `auth.users(id)` con eliminación en cascada)
* **`email`**: `VARCHAR` (Correo electrónico de acceso)
* **`nombre`**: `VARCHAR` (Nombre completo del usuario)
* **`rol`**: `VARCHAR` (`'admin' | 'vendedor' | 'visitante'`)

### Tabla: `productos`
* **`id`**: `UUID` (PK)
* **`sku`**: `VARCHAR` (Unique, código de barras)
* **`nombre`**: `VARCHAR` (Nombre del producto/insumo)
* **`categoria`**: `VARCHAR` (Semillas, Herbicidas, etc.)
* **`unidad`**: `VARCHAR` (Presentación: costal, litro, botella)
* **`precio_publico`**: `DECIMAL(10,2)`
* **`precio_mayoreo`**: `DECIMAL(10,2)`
* **`tasa_iva`**: `DECIMAL(4,2)` (Tasa porcentual, e.g. `0.00`)
* **`stock`**: `DECIMAL(10,2)` (Existencia consolidada automática)
* **`stock_minimo`**: `DECIMAL(10,2)` (Umbral de alertas de stock bajo)

### Tabla: `lotes`
Estructura para el soporte del inventario **PEPS** (Primeras Entradas, Primeras Salidas / FIFO).
* **`id`**: `UUID` (PK)
* **`producto_id`**: `UUID` (FK -> `productos.id`)
* **`lote_no`**: `VARCHAR` (Código de lote del fabricante)
* **`stock_lote`**: `DECIMAL(10,2)` (Existencia restante en este lote específico)
* **`fecha_caducidad`**: `DATE` (Expiración del lote)
* **`fecha_entrada`**: `TIMESTAMP` (Fecha de ingreso, usada para ordenar el FIFO)

### Tabla: `clientes`
* **`id`**: `UUID` (PK)
* **`nombre`**: `VARCHAR`
* **`rancho`**: `VARCHAR` (Ubicación/predio del productor)
* **`telefono`**: `VARCHAR`
* **`limite_credito`**: `DECIMAL(10,2)`
* **`saldo_deudor`**: `DECIMAL(10,2)` (Deuda acumulada por cobrar)
* **`activo_para_credito`**: `BOOLEAN` (Bandera para bloqueo automático por morosidad)

### Tabla: `ventas`
Cabecera de las transacciones del punto de venta.
* **`id`**: `UUID` (PK)
* **`folio`**: `VARCHAR` (Folio único de venta, e.g. `V-123456`)
* **`cliente_id`**: `UUID` (FK -> `clientes.id`, nullable si es venta al público general)
* **`vendedor_id`**: `UUID` (FK -> `perfiles.id`, nullable)
* **`tipo_pago`**: `VARCHAR` (`'efectivo' | 'tarjeta' | 'credito'`)
* **`subtotal`**: `DECIMAL(10,2)`
* **`iva`**: `DECIMAL(10,2)`
* **`total`**: `DECIMAL(10,2)`
* **`estado`**: `VARCHAR` (`'pendiente' | 'cobrada' | 'cancelada'`)
* **`fecha`**: `TIMESTAMPTZ` (Fecha y hora de registro en UTC, convertida a local en cliente)

### Tabla: `ventas_detalles`
Partidas desglosadas de cada venta, enlazadas al lote PEPS asignado.
* **`id`**: `UUID` (PK)
* **`venta_id`**: `UUID` (FK -> `ventas.id` con eliminación en cascada)
* **`producto_id`**: `UUID` (FK -> `productos.id`)
* **`lote_id`**: `UUID` (FK -> `lotes.id`, asignado por el disparador FIFO)
* **`cantidad`**: `DECIMAL(10,2)`
* **`precio_unitario`**: `DECIMAL(10,2)`
* **`subtotal`**: `DECIMAL(10,2)`

### Tabla: `pagos_credito`
* **`id`**: `UUID` (PK)
* **`venta_id`**: `UUID` (FK -> `ventas.id` con eliminación en cascada)
* **`monto`**: `DECIMAL(10,2)` (Monto abonado)
* **`metodo`**: `VARCHAR` (`'efectivo' | 'transferencia'`)
* **`fecha`**: `TIMESTAMPTZ` (Fecha del abono)
* **`folio_pago`**: `VARCHAR` (Folio generado para el recibo de pago, e.g. `P-123456`)

### Tabla: `movimientos_caja`
Historial de flujos y arqueos de dinero en efectivo/tarjeta.
* **`id`**: `UUID` (PK)
* **`vendedor_id`**: `UUID` (FK -> `perfiles.id`, nullable)
* **`tipo`**: `VARCHAR` (`'venta' | 'abono' | 'entrada' | 'salida'`)
* **`monto`**: `DECIMAL(10,2)`
* **`descripcion`**: `VARCHAR` (Detalle o motivo del movimiento)
* **`fecha`**: `TIMESTAMPTZ`

### Tabla: `movimientos_inventario`
Historial de entradas y salidas de stock del almacén.
* **`id`**: `UUID` (PK)
* **`producto_id`**: `UUID` (FK -> `productos.id`)
* **`lote_id`**: `UUID` (FK -> `lotes.id`)
* **`tipo`**: `VARCHAR` (`'entrada' | 'salida' | 'ajuste'`)
* **`cantidad`**: `DECIMAL(10,2)`
* **`referencia`**: `VARCHAR` (E.g. folio de venta o factura)
* **`descripcion`**: `VARCHAR`
* **`creado_en`**: `TIMESTAMPTZ`

---

## ⚡ Lógica de Negocio y Triggers en Base de Datos

### 1. Inventario PEPS (FIFO) Automatizado
El descuento de stock bajo la lógica de PEPS se realiza **del lado de la base de datos** para asegurar consistencia atómica y evitar colisiones cuando varios vendedores cobran al mismo tiempo.

Cuando se inserta una fila en `ventas_detalles`, el trigger `trg_descontar_lotes_peps` ejecuta la función `fn_descontar_lotes_peps()`, la cual:
1. Valida si hay suficiente stock consolidado.
2. Recorre los lotes con `stock_lote > 0` del producto, ordenados por `fecha_entrada ASC`.
3. Descuenta la cantidad del lote más antiguo. Si no es suficiente, consume del siguiente lote.
4. Asigna el `lote_id` utilizado en la partida de la venta.
5. Descuenta el `stock` consolidado en la tabla `productos`.

### 2. Transacción del Cobro (`fn_registrar_venta_completa`)
Para garantizar transaccionalidad total, el cobro se realiza mediante una función RPC en Postgres. Si algo falla durante el cobro, toda la operación se revierte (Rollback). La función:
1. Valida los límites de crédito y estatus activo del cliente (si es venta a crédito).
2. Registra la cabecera de la venta en `ventas`.
3. Inserta los productos detallados en `ventas_detalles` (disparando el trigger PEPS).
4. Actualiza el `saldo_deudor` en `clientes` (si aplica).
5. Crea un movimiento de caja tipo `'venta'` (si es pago al contado en efectivo o tarjeta).

### 3. Control de Crédito y Abonos Automatizados
Cada vez que se registra o elimina un abono de crédito en la tabla `pagos_credito`, el trigger `trg_procesar_abono_credito` ejecuta la función `fn_procesar_abono_credito()` para automatizar la contabilidad atómica:
1. **Al registrar un pago (INSERT):**
   * Descuenta automáticamente el monto del abono del `saldo_deudor` del cliente en la tabla `clientes`.
   * Calcula el total acumulado de pagos para esa venta. Si el total abonado cubre o excede el total de la venta (`venta.total`), cambia el estado de la venta (`ventas.estado`) a `'cobrada'`.
2. **Al cancelar/eliminar un pago (DELETE):**
   * Reestablece el monto del abono sumándolo de nuevo al `saldo_deudor` del cliente.
   * Regresa el estado de la venta a `'pendiente'`.

```sql
CREATE OR REPLACE FUNCTION public.fn_procesar_abono_credito()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_id UUID;
  v_venta_total NUMERIC(10,2);
  v_total_abonado NUMERIC(10,2);
BEGIN
  -- Obtener el cliente_id y el total de la venta
  SELECT cliente_id, total INTO v_cliente_id, v_venta_total
  FROM public.ventas
  WHERE id = COALESCE(NEW.venta_id, OLD.venta_id);

  IF TG_OP = 'INSERT' THEN
    -- A. Descontar saldo deudor del cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = GREATEST(0.00, saldo_deudor - NEW.monto)
      WHERE id = v_cliente_id;
    END IF;

    -- B. Calcular el acumulado de pagos para esta venta
    SELECT COALESCE(SUM(monto), 0.00) INTO v_total_abonado
    FROM public.pagos_credito
    WHERE venta_id = NEW.venta_id;

    -- C. Si ya se cubrió el total, marcar la venta como cobrada
    IF v_total_abonado >= v_venta_total THEN
      UPDATE public.ventas
      SET estado = 'cobrada'
      WHERE id = NEW.venta_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    -- A. Regresar el saldo deudor al cliente
    IF v_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET saldo_deudor = saldo_deudor + OLD.monto
      WHERE id = v_cliente_id;
    END IF;

    -- B. Regresar el estado de la venta a pendiente
    UPDATE public.ventas
    SET estado = 'pendiente'
    WHERE id = OLD.venta_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4. Evaluación de Morosidad Automatizada (`fn_evaluar_clientes_morosos`)
Función lista para integrarse con un programador de tareas (e.g. pg_cron) para suspender de forma automática el crédito a los clientes con deudas vencidas mayores a 30 días.
```sql
CREATE OR REPLACE FUNCTION public.fn_evaluar_clientes_morosos()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
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
      AND v.fecha < (NOW() - INTERVAL '30 days')
  );
END;
$function$
```

---

## 📱 Pantallas y Flujos de Navegación

El frontend se divide según el estado del enrutador central en `App.tsx`:

1. **`/login`:** Formulario de acceso estéticamente premium. Valida credenciales e inicia la subscripción de sesión.
2. **`/dashboard`:** Tablero de control exclusivo de administradores. Muestra métricas del día (ventas reales, deudas pendientes, alertas de inventario) con gráficos semanales interactivos.
3. **`/pos`:** Terminal de ventas rápida. Permite buscar productos por nombre o SKU en la lista, agregarlos al carrito y realizar cobros (en efectivo, tarjeta de débito, tarjeta de crédito, transferencia bancaria, o crédito a clientes seleccionados).
   * Valida estrictamente que el turno de caja esté activo antes de realizar cualquier cobro; de lo contrario, bloquea el checkout y muestra un banner preventivo con redirección directa al módulo de caja.
   * Al concretar la venta, permite enviar el comprobante de compra por WhatsApp (integrado con webhook de n8n o enlace alternativo `wa.me`) e imprimir un ticket térmico de 80mm optimizado. El ticket impreso muestra de manera explícita la forma de pago (efectivo, débito, crédito, transferencia o tarjeta de crédito) y se ha simplificado omitiendo el nombre del vendedor.
4. **`/inventario`:** Catálogo completo de productos, visualización de lotes, registro de stock y alertas visuales si están por debajo del límite mínimo.
5. **`/clientes` (Control de Crédito y Cuentas por Cobrar):** Panel central de clientes y cartera vencida.
   * **Listado de Clientes:** Tabla interactiva que muestra nombre, rancho, teléfono, límite de crédito, saldo deudor actual (resaltado en rojo si es mayor a cero), y un indicador de estado del crédito (`Apto` / `Suspendido`). Incluye buscador rápido por nombre y rancho.
   * **NuevoClienteModal:** Formulario modal para registrar clientes. Valida que el nombre no esté vacío e inicializa las cuentas por cobrar con un saldo deudor de `0.00`.
   * **Estado de Cuenta (`EstadoCuenta.tsx`):** Vista estilo hoja de cálculo Excel conforme a las plantillas contables de la empresa:
     * Calcula en tiempo real los días de atraso (`DIAS DE ATRASO`), fecha de vencimiento (`FEC. VEN.`) y el estatus visual del saldo (`VENCIDA` en rojo, `AL CORRIENTE` en verde, `PAGADA` con tachado).
     * Panel de KPI superior dinámico: Muestra el plazo de crédito activo, el Total Notas (suma de todos los cargos), Total Vencido (cargos cuya fecha actual supera la de vencimiento) y el Saldo por Cobrar.
     * Selector de plazo interactivo: Permite cambiar el plazo de crédito (30, 45, 60 días o personalizado) recalculando al instante las fechas de vencimiento y el saldo vencido.
     * Lista desglosada de abonos en subfilas anidadas bajo cada nota de venta, registrando monto, fecha y observaciones (método de pago).
   * **RegistrarPagoModal:** Modal para registrar abonos parciales o liquidar la venta completa. Permite registrar pagos mediante efectivo, transferencia, tarjeta de crédito y tarjeta de débito. Valida que el monto ingresado no sea mayor al saldo restante de la remisión seleccionada y genera folios de pago con prefijo `P-`.
6. **`/credito` (Notas a Crédito y Cartera General):** Control general de la cartera de crédito de la empresa.
   * **Métricas KPI Dinámicas:** Panel superior que calcula en tiempo real el **Total en Cartera** (saldo pendiente general), el **Total Vencido** (créditos con antigüedad mayor a 30 días) y la cantidad de **Clientes Deudores** únicos.
   * **Buscador y Filtros:** Permite filtrar las notas por nombre de cliente, rancho o folio de remisión, y clasificar por estatus: todos, pendientes, al corriente, vencidas y pagadas.
   * **Historial de Abonos Integrado (Desglose):** Cada nota de crédito se puede expandir (acordeón) para mostrar la lista detallada de los abonos recibidos en `pagos_credito` (folio, fecha, método de pago y monto).
   * **Cancelación Segura de Pagos (Delete):** Permite eliminar un abono específico. La base de datos, a través del trigger `trg_procesar_abono_credito`, reestablece de forma atómica y segura el saldo deudor del cliente y actualiza el estado de la venta a `'pendiente'`.
   * **Cobros Directos:** Permite abrir el modal `RegistrarPagoModal` directamente para abonar o liquidar el saldo de una remisión sin salir del listado general.
7. **`/caja` (Flujo de Caja y Arqueo):** Panel de control y auditoría de la caja registradora.
   * **Apertura de Turno:** Permite establecer el Fondo Inicial de efectivo en el cajón para el inicio de operaciones.
   * **Cálculo de Efectivo Estimado:** Fórmula atómica dinámica que calcula el efectivo esperado en el cajón a partir de `Apertura + Ventas Efectivo + Abonos Efectivo + Ingresos Manuales - Egresos Manuales`.
   * **Movimientos Manuales:** Opción para registrar de forma auditada entradas (ingresos) y salidas/retiros (egresos) de efectivo.
   * **Línea de Tiempo Unificada:** Historial cronológico consolidado de toda la actividad del turno (ventas al contado por efectivo o tarjeta, abonos de créditos y movimientos manuales).
   * **Desglose Detallado de Conceptos (Botones de Ojo):** Cada renglón del resumen de efectivo (fondo inicial, ventas en efectivo, abonos, ingresos y egresos manuales, ventas con tarjeta, abonos por transferencia, y el total estimado neto) cuenta con un botón interactivo (icono de ojo). Al activarlo, despliega un panel de desglose anidado con cada transacción individual (folio, hora, cliente y monto) y una suma de comprobación explícita (cuadre) para verificar matemáticamente la coincidencia del saldo.
   * **Corte de Caja (Cierre):** Registro del conteo físico del efectivo en caja, cálculo automático de diferencias (sobrante o faltante) y cierre formal del turno.
   * **Sincronización en Topbar:** Badge dinámico en el encabezado (`Topbar.tsx`) que refleja en tiempo real el estatus de la caja ("Caja abierta" con detalle de fecha/hora de inicio de turno, o "Caja cerrada") sincronizado mediante suscripción Supabase Realtime. Adicionalmente, cuenta con detección inteligente de turnos antiguos: si el turno se abrió en un día anterior o lleva más de 16 horas activo, el badge se torna de color ámbar con la leyenda "Turno previo" para alertar al cajero que debe realizar un corte de caja.
   * **Historial de Turnos Anteriores:** Panel plegable que recopila los cortes y aperturas previas realizadas, emparejando aperturas con su respectivo corte final para auditar el desempeño de los cajeros en turnos pasados.
8. **`/reportes` (Reportes Detallados y Estadísticas):** Tablero para análisis comercial y de inventarios.
   * **KPIs de Ventas:** Resumen interactivo de métricas clave (Total de ventas brutas, promedio por ticket, número de transacciones totales).
   * **Distribución de Métodos de Pago:** Gráfico de dona que refleja la proporción de ventas correspondiente a cada uno de los 5 métodos (efectivo, débito, tarjeta de crédito, transferencia y crédito).
   * **Valoración de Inventario por Categoría:** Gráfico de barras SVG nativo e interactivo que calcula el valor total consolidado por categoría de producto basado en el `precio_publico` (en perfecta coincidencia con los KPIs del catálogo consolidado). Cuenta con tooltips SVG inline interactivos al posicionar el cursor sobre cada barra.
   * **Línea de Tiempo de Caducidades:** Proyección mensual interactiva de lotes de productos próximos a expirar, con tooltips detallados de fecha y stock para control proactivo.
   * **Diseño e Integridad:** Acabados pulidos bajo la paleta cromática OKLCH y diseño libre de banners innecesarios (metodología simplificada).

9. **`/precios` (Lista de Precios y Consulta):** Catálogo de precios de consulta rápida diseñado para el rol de **Visitante**.
   * **Buscador y Categorías:** Caja de búsqueda instantánea por nombre o SKU y suscripción reactiva en tiempo real a cambios en la tabla de `productos`. Píldoras de filtrado por categoría de insumo.
   * **Desglose de Precios:** Muestra de forma destacada el Precio al Público y el Precio de Mayoreo de cada producto.
   * **Control de Stock:** Barra de progreso porcentual e indicador de nivel (`Normal`, `Bajo`, `Crítico`, `Agotado`) calculado dinámicamente con respecto al umbral mínimo del insumo.
   * **Modo Consulta Estricto:** Carece de cualquier botón o modal para crear productos, modificar precios o registrar entradas/salidas de almacén.

---

## 📄 Consideraciones para Futuras Implementaciones

### Generación de PDFs
La generación de PDFs para comprobantes de remisiones, recibos de abono y cotizaciones no es de lo más vital en esta etapa, pero se ha tomado en cuenta en la arquitectura para facilitar su futura integración:
* **Remisiones y Cotizaciones (POS):** Se prevé el desarrollo de un servicio cliente que utilice librerías de generación de PDF (como `@react-pdf/renderer` o `jspdf`) que consuma directamente los datos de `ventas` y `ventas_detalles` al cerrar la venta para descargar o imprimir el archivo automáticamente.
* **Estados de Cuenta (Clientes):** La estructura estilo Excel del componente `EstadoCuenta` permite un mapeo limpio a plantillas de impresión PDF que los clientes puedan recibir vía WhatsApp o correo electrónico.
