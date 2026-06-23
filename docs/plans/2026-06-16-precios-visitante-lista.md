# Lista de Precios y Ajuste de Sidebar para Visitante

> **Status:** COMPLETED (2026-06-16)
>
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a fast, real-time read-only product price list for visitor roles, and customize the sidebar to show only valid navigation options for visitors.

**Architecture:**
- Create a read-only `Precios.tsx` component in `src/features/inventario/Precios.tsx`.
- Connect the prices list to Supabase's `productos` table with a real-time subscription.
- Add category filter pills and a responsive search input.
- Render public and wholesale prices, and color-coded stock badges.
- Import `Precios` in `App.tsx` and render it for the `precios` screen.
- Update `Sidebar.tsx` so that visitors (`role === 'usuario'`) see a clean menu consisting only of active/allowed routes, bypassing the disabled administrative links.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS, Vanilla CSS.

---

### Task 1: Create Precios Component

**Files:**
- Create: `src/features/inventario/Precios.tsx`
- Test: `src/features/inventario/Precios.test.tsx`

**Step 1: Write the Precios component**
Create the component at `src/features/inventario/Precios.tsx` with:
- State for `productos`, `loading`, `search`, and `selectedCat`.
- A search input and category pills.
- Table listing: Name, Category, SKU, stock indicator bar, Public Price, and Wholesale Price.
- Real-time subscription to `productos` changes via `supabase.channel`.
- Beautiful AGROMAR oklch styles.

**Step 2: Write tests for Precios component**
Create `src/features/inventario/Precios.test.tsx` to verify:
- Render of products.
- Filtering by category and search.
- Ensure no edit or creation controls are visible.

**Step 3: Run tests**
Run: `npm run test`
Expected: PASS

---

### Task 2: Integrate Precios in App.tsx

**Files:**
- Modify: `src/App.tsx:14-15` (Add import)
- Modify: `src/App.tsx:100-120` (Replace placeholder)

**Step 1: Import Precios**
```tsx
import { Precios } from './features/inventario/Precios';
```

**Step 2: Render Precios component**
```tsx
      case 'precios':
        return <Precios />;
```

**Step 3: Run TypeScript compiler**
Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 3: Adjust Sidebar for Visitor Role

**Files:**
- Modify: `src/components/Sidebar.tsx:136-191`

**Step 1: Adjust Sidebar rendering logic**
In `src/components/Sidebar.tsx`, update the navigation rendering:
If `role === 'usuario'` (visitante), only render the items present in `nav` directly (to prevent showing 6+ disabled admin links like dashboard, pos, caja, etc.).
For other roles, preserve the existing logic of showing all items with disabled opacity.

**Step 2: Verify Sidebar**
Run: `npx tsc --noEmit` and `npm run test`
Expected: PASS
