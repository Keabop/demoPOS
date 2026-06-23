# Reportes Detallados y Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a comprehensive multi-tab reporting dashboard (`/reportes`) for Karen, incorporating custom interactive SVG charts and data aggregates for Sales, Collections, Inventory, and Cash Register Turnos.

**Architecture:** Create a modular component system where `Reportes.tsx` serves as the tab manager and dates coordinator, lazily rendering subcomponents `ReporteVentas.tsx`, `ReporteCobranza.tsx`, `ReporteInventario.tsx`, and `ReporteCaja.tsx`. Graphs are rendered dynamically using responsive React SVG paths, rects, and linear gradients with custom interactive tooltips.

**Tech Stack:** React 18, TypeScript, Supabase Client SDK, Vanilla CSS, custom SVG components.

---

### Task 1: Setup Route and Sidebar Navigation for Reportes

**Files:**
- Modify: `src/App.tsx:82-120`
- Modify: `src/components/Sidebar.tsx:13-30`

**Step 1: Write mock rendering for screen === 'reportes'**
Ensure `<Reportes />` is imported and rendered when the screen state is set to `'reportes'` instead of rendering the "Pantalla en Construcción" placeholder.

**Step 2: Update Sidebar to link to `/reportes`**
Confirm the sidebar navigation triggers `onNav('reportes')` and displays correctly.

**Step 3: Commit**
```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: enable reportes navigation route and sidebar link"
```

---

### Task 2: Create Reportes Tab Manager Component

**Files:**
- Create: `src/features/reportes/Reportes.tsx`

**Step 1: Write the tab manager code**
Create `Reportes.tsx` which manages:
* A global date range picker (options: Hoy, Últimos 7 días, Este mes, Año en curso).
* A state `activeTab` ('ventas' | 'cobranza' | 'inventario' | 'caja').
* Renders the tab buttons in a premium flex row.
* Lazily renders each sub-component: `<ReporteVentas />`, `<ReporteCobranza />`, etc., passing the selected date range.

**Step 2: Run verification**
Run: `npx tsc --noEmit`
Expected: Compile PASS.

**Step 3: Commit**
```bash
git add src/features/reportes/Reportes.tsx
git commit -m "feat: add Reportes container component with tab switcher and date filters"
```

---

### Task 3: Implement Sales Report (`ReporteVentas.tsx`) with SVG Line & Circle Charts

**Files:**
- Create: `src/features/reportes/ReporteVentas.tsx`

**Step 1: Implement data fetching and calculations**
Query `ventas` and `ventas_detalles` inside the date range. Accumulate daily sums, total tickets, and item sales.
**Step 2: Write SVG Line Graph and SVG Donut Component**
* Line Chart: Plot points with `<path d="..." />` and a `<linearGradient>` under the path. Add hover dots and a floating HTML tooltip for tooltip values.
* Donut Chart: Render `<circle>` elements with computed `strokeDasharray` and `strokeDashoffset` representing payments split (Efectivo, Tarjeta, Crédito, Transferencia).
**Step 3: Run verification**
Run: `npx tsc --noEmit` and check for type safety.
**Step 4: Commit**
```bash
git add src/features/reportes/ReporteVentas.tsx
git commit -m "feat: implement ReporteVentas with SVG line chart, payments donut, and top sales table"
```

---

### Task 4: Implement Collections & Credit Report (`ReporteCobranza.tsx`) with SVG Bar Chart

**Files:**
- Create: `src/features/reportes/ReporteCobranza.tsx`

**Step 1: Implement credit portfolio calculations**
Fetch all client credit balances, payments, and credit notes. Calculate total active credit, overdue balances, and average days of payment delays.
**Step 2: Write SVG Aging Bar Chart**
Render vertical `<rect rx="4">` bars representing debt segments: 0-15 days, 16-30 days, 31-45 days, 45+ days.
**Step 3: Render Top Deudores table**
Display top 5 most delayed customers with outstanding debt amounts and links to directly open their profile card or account statements.
**Step 4: Commit**
```bash
git add src/features/reportes/ReporteCobranza.tsx
git commit -m "feat: implement ReporteCobranza with aging SVG bar chart and top debtors table"
```

---

### Task 5: Implement Inventory Valuation and Expiry Report (`ReporteInventario.tsx`)

**Files:**
- Create: `src/features/reportes/ReporteInventario.tsx`

**Step 1: Fetch and calculate PEPS valuation**
Query products and active `inventario_lotes`. Sum `stock * costo` for all items to yield total inventory net worth.
**Step 2: Generate product activity statistics**
Find the best rotating products and list inactive products (dead stock).
**Step 3: List next-expiring batches**
Filter `inventario_lotes` where `fecha_caducidad` is within the next 60 days.
**Step 4: Commit**
```bash
git add src/features/reportes/ReporteInventario.tsx
git commit -m "feat: implement ReporteInventario with FIFO valuation summary and batch expiry warning list"
```

---

### Task 6: Implement Caja Turnos Auditing Report (`ReporteCaja.tsx`)

**Files:**
- Create: `src/features/reportes/ReporteCaja.tsx`

**Step 1: Query shifts activity**
Fetch `caja_turnos` and map them to their closures. Calculate sum of manual cash adjustments (egresos, ingresos).
**Step 2: Write turn discrepancy summary**
Highlight cashier discrepancies (positive/negative differences at shift close) in a list or bar comparison.
**Step 3: Render shift audit history table**
Allow viewing past shifts, totals, cajero name, opening time, and closing variance.
**Step 4: Build project & verify**
Run: `npm run build`
Expected: Complete compilation success, no unused imports.
**Step 5: Commit**
```bash
git add src/features/reportes/ReporteCaja.tsx
git commit -m "feat: implement ReporteCaja turn auditing view and complete reports integration"
```
