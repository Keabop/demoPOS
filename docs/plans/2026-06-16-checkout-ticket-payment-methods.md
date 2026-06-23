# Ticket Payment Method and Credit Payments Implementation Plan

> **Status:** COMPLETED (2026-06-16)
>
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display the payment method on the printed checkout ticket (removing or replacing "Se atendió" with "VENDEDOR"), and verify/expand credit payment options (abonos) to include credit card, debit card, bank transfer, and cash.

**Architecture:**
- Update `CheckoutSuccessModal.tsx` props to accept the `metodoPago` prop.
- Translate `metodoPago` database key into a descriptive uppercase Spanish format (`EFECTIVO`, `TARJETA DE CRÉDITO`, `TARJETA DE DÉBITO`, `TRANSFERENCIA BANCARIA`, `CRÉDITO`).
- Render this payment method label on the physical printed ticket in `CheckoutSuccessModal.tsx`.
- Pass the completed sale's payment method from `POS.tsx` when instantiating `CheckoutSuccessModal`.
- Ensure `RegistrarPagoModal.tsx` includes options for debit card, credit card, transfer, and cash, and writes them correctly to the database.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS.

---

### Task 1: Update CheckoutSuccessModal to Accept and Render Payment Method

**Files:**
- Modify: `src/features/pos/CheckoutSuccessModal.tsx:7-33`
- Modify: `src/features/pos/CheckoutSuccessModal.tsx:345-362`

**Step 1: Write a test or verify props structure**
We will add `metodoPago` to the props definition.
In `src/features/pos/CheckoutSuccessModal.tsx`, update `CheckoutSuccessModalProps`:
```typescript
interface CheckoutSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  folio: string;
  total: number;
  vendedorNombre: string;
  clientName?: string | null;
  clientPhone?: string | null;
  cartItems: Array<any>; // contains products with quantity
  onSendWhatsApp: (phone: string) => Promise<boolean>;
  metodoPago: string;
}
```

**Step 2: Map and Render Payment Method in Ticket**
In the printed ticket section of `CheckoutSuccessModal.tsx`, map the `metodoPago` prop values:
```typescript
  const paymentLabels: Record<string, string> = {
    efectivo: 'EFECTIVO',
    tarjeta: 'TARJETA DE CRÉDITO',
    debito: 'TARJETA DE DÉBITO',
    transferencia: 'TRANSFERENCIA BANCARIA',
    credito: 'CRÉDITO'
  };
  const paymentLabel = paymentLabels[metodoPago] || metodoPago.toUpperCase();
```
And display it on the ticket layout:
```tsx
            <div>VENDEDOR: {vendedorNombre.toUpperCase()}</div>
            {clientName && <div>CLIENTE: {clientName.toUpperCase()}</div>}
            <div>MÉTODO DE PAGO: {paymentLabel}</div>
```
Ensure "Se atendió" is not present (we already verified it says "VENDEDOR: ...").

**Step 3: Run TypeScript compiler check**
Run: `npx tsc --noEmit`
Expected: Failure because `POS.tsx` does not yet pass `metodoPago` to `CheckoutSuccessModal`.

---

### Task 2: Update POS Component to Pass metodoPago

**Files:**
- Modify: `src/features/pos/POS.tsx:1262-1274`

**Step 1: Pass metodoPago Prop**
Update the instantiation of `<CheckoutSuccessModal />` in `src/features/pos/POS.tsx`:
```tsx
      {completedSale && (
        <CheckoutSuccessModal
          isOpen={completedSale !== null}
          onClose={() => setCompletedSale(null)}
          folio={completedSale.folio}
          total={completedSale.total}
          vendedorNombre={vendedorNombre}
          clientName={completedSale.clientName}
          clientPhone={completedSale.clientPhone}
          cartItems={completedSale.cartItems}
          onSendWhatsApp={handleSendWhatsApp}
          metodoPago={completedSale.metodoPago}
        />
      )}
```

**Step 2: Verify Compilation and Run Tests**
Run: `npx tsc --noEmit`
Expected: PASS
Run: `npm run test`
Expected: PASS

---

### Task 3: Verify Credit Payments Modal Methods

**Files:**
- Modify: `src/features/clientes/RegistrarPagoModal.tsx`

**Step 1: Check Payment Options in RegistrarPagoModal**
Verify the payment options dropdown:
```tsx
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta de Crédito</option>
              <option value="debito">Tarjeta de Débito</option>
```
Confirm the state maps these correctly and writes to the `pagos_credito` table under the `metodo` column. This is already implemented, so we only need to verify and test.

**Step 2: Add validation/test case if needed**
Run: `npm run test` to verify everything is fully intact.
