# Clientes and Credit Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a complete client catalog (CRUD) and an Excel-style interactive account statement with payments (abonos) registration, connected to database-level triggers for credit balance reconciliation.

**Architecture:** Database triggers for payments handling, React components for the Clientes grid, dynamic mathematical date/delay calculators in React, and modals for creating clients and payments.

**Tech Stack:** React 19 + TypeScript + Supabase JS SDK + Postgres (Trigger) + Vitest

---

### Task 1: Database Migration (Abonos Trigger)

**Files:**
- Create: `supabase/migrations/20260613000001_procesamiento_abonos_credito.sql`

**Step 1: Write the SQL migration file**

Create the file `supabase/migrations/20260613000001_procesamiento_abonos_credito.sql`:
```sql
-- 1. Crear función trigger para procesar abonos
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

-- 2. Asignar el trigger a la tabla pagos_credito
CREATE OR REPLACE TRIGGER trg_procesar_abono_credito
  AFTER INSERT OR DELETE ON public.pagos_credito
  FOR EACH ROW EXECUTE FUNCTION public.fn_procesar_abono_credito();
```

**Step 2: Apply SQL migration to database**

Run the migration query directly in the database using the Supabase MCP tool or SQL execution.
Confirm that the trigger `trg_procesar_abono_credito` is created on the table `public.pagos_credito`.

**Step 3: Commit**

```bash
git add supabase/migrations/20260613000001_procesamiento_abonos_credito.sql
git commit -m "db: add pagos_credito accounting trigger"
```

---

### Task 2: Clientes View Layout & Routing

**Files:**
- Modify: `src/App.tsx:72-74`
- Create: `src/features/clientes/Clientes.tsx`

**Step 1: Replace placeholder in App.tsx**

Replace `screen === 'clientes'` in `src/App.tsx` with:
```tsx
      case 'clientes':
        return <Clientes onNav={setScreen} />;
```

**Step 2: Scaffolding Clientes.tsx**

Create the initial UI structure of `src/features/clientes/Clientes.tsx` with indicators, search filter, and list cards. We will use mock data initially to test layout.
Ensure it uses OKLCH color variables and matches the theme of AGROMAR.

**Step 3: Commit**

```bash
git add src/App.tsx src/features/clientes/Clientes.tsx
git commit -m "feat: scaffold Clientes component and integrate in App router"
```

---

### Task 3: Clientes CRUD and Creation Modal

**Files:**
- Modify: `src/features/clientes/Clientes.tsx`

**Step 1: Implement Supabase queries**

1. Query all clients from the `clientes` table.
2. Group and calculate statistics (Total, Al corriente, Deuda Vencida, Total por cobrar).
3. Connect the search bar to filter client card list.

**Step 2: Implement "Nuevo Cliente" Modal**

Add a float modal with inputs: Nombre, Rancho, Teléfono, Límite de Crédito. Upon save, perform:
```typescript
const { data, error } = await supabase
  .from('clientes')
  .insert([{ nombre, rancho, telefono, limite_credito: Number(limite) }]);
```
On success, close modal and refresh client list.

**Step 3: Commit**

```bash
git add src/features/clientes/Clientes.tsx
git commit -m "feat: implement clients database querying, filtering and Nuevo Cliente modal"
```

---

### Task 4: Excel-Style Estado de Cuenta (Account Statement) Component

**Files:**
- Modify: `src/features/clientes/Clientes.tsx`

**Step 1: Detailed Profile View**

Implement a sub-view in `Clientes.tsx` (when clicking "Ver perfil" or "Notas" on a card) to render the client's profile details.

**Step 2: Query client credit purchases and payments**

1. Fetch all `ventas` for `cliente_id` where `tipo_pago = 'credito'`.
2. Fetch `pagos_credito` for all those `venta_ids`.

**Step 3: Date calculations and columns**

Map rows and calculate:
* `fec_ven` = `fecha_venta + dias_credito` (using state variable `diasCredito`, default `30` but editable via dropdown).
* `dias_atraso` = `fecha_venta - today` (as negative, e.g. `-85` days).
* `saldo` = `total_venta - sum(monto_abonos)`.
* `status` = `vencida` if `saldo > 0` and `today > fec_ven`, else `al corriente` if `saldo > 0`, else `pagada`.

**Step 4: Table rendering**

Render the Excel-style table displaying columns: `DIAS DE ATRASO`, `REMISION`, `FECHA`, `FEC. VEN.`, `FACTURA`, `SALDO`, `STATUS`, `ABONOS`, `FECHA`, `OBSERVACIONES`.
Match look of `Estados_de_cuenta_credito_clientes.png`.

**Step 5: Commit**

```bash
git add src/features/clientes/Clientes.tsx
git commit -m "feat: implement Excel-style interactive Account Statement with dynamic date calculations"
```

---

### Task 5: Payments (Abonos) Registration

**Files:**
- Modify: `src/features/clientes/Clientes.tsx`
- Create: `src/features/credito/CreditosList.tsx` (if needed, or route Case 'credito' in App.tsx)

**Step 1: Registrar Pago Modal**

Create a modal to register an abono for a selected pending sale note.
Fields:
* Remisión (Folio, read-only)
* Monto a abonar (defaults to pending balance)
* Método de pago (`Efectivo` | `Transferencia`)

**Step 2: Database Insert**

Generate folio prefix: `P-` + timestamp or count.
```typescript
const { error } = await supabase
  .from('pagos_credito')
  .insert([{ venta_id, monto: Number(monto), metodo: metodo, folio_pago: `P-${Date.now().toString().slice(-6)}` }]);
```
On success, close modal and reload state. The trigger will update client balances and sale state automatically.

**Step 3: Commit**

```bash
git add src/features/clientes/Clientes.tsx
git commit -m "feat: implement payments modal to record abonos to credit notes"
```

---

### Task 6: Build Verification and cleanup

**Step 1: Check build**

Run: `npm run build` to verify there are no TypeScript compile issues.
Run: `npm run test` to make sure all unit tests pass.

**Step 2: Commit**

```bash
git commit -am "chore: verify build and ensure all unit tests pass"
```
