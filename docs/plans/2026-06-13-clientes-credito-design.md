# Diseño de Integración: Módulo de Clientes y Control de Cuentas por Cobrar (Excel-Style)

**Fecha:** 13 de junio de 2026  
**Proyecto:** POS AGROMAR  
**Módulos:** Clientes (CRUD y Estado de Cuenta) y Notas a Crédito

---

## 1. Resumen
Este documento detalla el plan de diseño para implementar el **Módulo de Clientes** y el **Control de Notas a Crédito** con la funcionalidad de registro de abonos. El diseño replica la estructura y lógica de cálculo del Excel de cuentas por cobrar utilizado actualmente por AGROMAR, permitiendo ver días de atraso, estatus de remisiones, historial de abonos individuales por nota, y balances generales.

---

## 2. Arquitectura de Base de Datos y Triggers

### 2.1 Trigger para Procesar Abonos de Crédito
Se implementará un disparador (`trigger`) en la tabla `public.pagos_credito` que automatiza la contabilidad cada vez que se agrega o elimina un abono:

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

CREATE OR REPLACE TRIGGER trg_procesar_abono_credito
  AFTER INSERT OR DELETE ON public.pagos_credito
  FOR EACH ROW EXECUTE FUNCTION public.fn_procesar_abono_credito();
```

---

## 3. UI/UX: Pantalla de Clientes (`Clientes.tsx`)

Esta pantalla permitirá gestionar el catálogo de clientes y acceder a su perfil detallado con el **Estado de Cuenta**.

### 3.1 Indicadores de Resumen
* **Clientes totales:** Cantidad total de registros.
* **Al corriente:** Clientes con crédito activo y sin notas vencidas.
* **Deuda vencida:** Clientes bloqueados o con notas que excedieron los 30 días de plazo.
* **Total por Cobrar:** Suma de los saldos deudores consolidados de todos los clientes.

### 3.2 Listado y Búsqueda
* Input de búsqueda por nombre, teléfono o rancho.
* Píldoras de filtrado: *Todos*, *Al corriente*, *Por vencer*, *Con deuda vencida*.
* Tarjetas de cliente que muestran:
  * Iniciales e indicador de color según su estado (rojo para moroso, verde para al corriente).
  * Límite de crédito vs saldo deudor con barra de progreso.
  * Botón para abrir el perfil y estado de cuenta.

### 3.3 Modal de "Nuevo Cliente"
Formulario flotante para ingresar:
* Nombre del productor.
* Predio / Rancho.
* Teléfono de contacto.
* Límite de crédito autorizado (por defecto `0.00`).

---

## 4. UI/UX: Perfil y Estado de Cuenta (Excel-Style)

Al seleccionar a un cliente, se desplegará su **Estado de Cuenta** oficial basado en la plantilla de Excel de la sucursal:

### 4.1 Resumen Financiero
* **Días de crédito:** Selector interactivo (`30`, `45`, `60` días) para recalcular las fechas límite y plazos vencidos.
* **Total Vencido:** Suma de deudas con plazo expirado.
* **Saldo por Cobrar (Total Notas):** Suma total de los saldos pendientes.

### 4.2 Tabla de Remisiones
* **Días de Atraso:** Calculado dinámicamente como `Fecha de Compra - Fecha de Generación` (representado como valor negativo, e.g. `-85` días transcurridos).
* **Remisión:** Folio de la venta.
* **Fecha:** Fecha de la venta original.
* **Fec. Ven.:** Fecha de compra + Días de crédito.
* **Factura:** Folio de factura SAT si aplica (opcional).
* **Saldo:** Saldo pendiente (`$0.00` o vacío si está pagada).
* **Status:** `VENCIDA` (rojo), `AL CORRIENTE` (verde) o `PAGADA` (gris/tachado).
* **Abonos:** Desglose del historial de pagos aplicados a la nota (Monto, Fecha y Observaciones / Método de pago).

---

## 5. Módulo de Notas a Crédito (`CreditosList.tsx` y `CreditoDetail.tsx`)

Este módulo permitirá ver todas las notas vigentes del negocio de forma global y realizar abonos directos.

### 5.1 Registro de Pago (Modal)
* Al seleccionar "Registrar Pago" en una nota o perfil de cliente, se despliega un formulario:
  * **Remisión:** Folio preseleccionado.
  * **Monto:** Cantidad a abonar en pesos (sugiere liquidar el saldo total por defecto).
  * **Método de Pago:** Selector entre `Efectivo` y `Transferencia`.
  * **Folio de Abono:** Generado de forma automática secuencial (ej. `P-00124`).
* Al confirmar el pago, la base de datos ejecuta el trigger contable y la pantalla actualiza los saldos y estados de cuenta instantáneamente.
