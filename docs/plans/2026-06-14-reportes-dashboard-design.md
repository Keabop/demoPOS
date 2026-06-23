# Diseño de Reportes Detallados y Dashboard para AGROMAR

Este documento define la arquitectura, diseño visual y especificaciones del nuevo módulo de **Reportes Detallados (`/reportes`)** para AGROMAR. El panel proveerá a los administradores (Karen Aguilar) un análisis completo del negocio dividido en cuatro pestañas principales con gráficas vectoriales SVG interactivas.

---

## 1. Arquitectura de Componentes

Para mantener el principio de **un componente por archivo** y un límite de 300 líneas, el módulo se estructurará de forma modular dentro del directorio `src/features/reportes/`:

```
src/features/reportes/
├── Reportes.tsx            # Contenedor principal y enrutador de pestañas
├── ReporteVentas.tsx        # Gráficas de ingresos y top de productos
├── ReporteCobranza.tsx      # Análisis de cartera de crédito y atrasos
├── ReporteInventario.tsx    # Valuación y rotación de stock
└── ReporteCaja.tsx          # Auditoría de turnos y balances de efectivo
```

---

## 2. Pestañas y Métricas Detalladas

### A. Ventas
* **Métricas Clave (Cards):** Total Vendido, Total Transacciones, Promedio por Ticket.
* **Gráfica Principal (SVG):** Línea de tendencia temporal de ventas diarias/mensuales con gradiente de relleno bajo la curva.
* **Desglose de Métodos de Pago:** Gráfica de dona SVG reflejando la participación de Efectivo vs Tarjeta vs Crédito vs Transferencia.
* **Top Productos:** Tabla de los 5 productos más vendidos indicando cantidad e importe.

### B. Créditos y Cobranza
* **Métricas Clave (Cards):** Cartera Activa Total, Cartera Vencida (Overdue), Clientes con Crédito.
* **Distribución de Antigüedad (SVG Bar Chart):** Agrupación de saldos por vencimiento (0-15 días, 16-30 días, 31-45 días, 45+ días).
* **Top Deudores:** Lista ordenada de los 5 clientes con mayor deuda vencida, incluyendo enlace a su estado de cuenta.

### C. Inventario
* **Métricas Clave (Cards):** Valuación Total del Inventario (al costo PEPS), Productos con Stock Crítico.
* **Rotación de Productos:** Tabla de productos con mayor movimiento vs productos sin ventas (stock muerto).
* **Próximas Caducidades:** Panel que lista los lotes de insumos químicos o semillas que están próximos a expirar en los siguientes 60 días.

### D. Caja y Turnos
* **Métricas Clave (Cards):** Total Caja Registrada, Balance de Discrepancias (Diferencias acumuladas), Total de Turnos Abiertos en el periodo.
* **Historial de Cuadres:** Lista de turnos cerrados mostrando fecha, cajero, faltantes/sobrantes e ingresos/egresos manuales.

---

## 3. Gráficas Vectoriales SVG de Alta Fidelidad

En lugar de utilizar librerías externas que incrementan el bundle de compilación, utilizaremos componentes SVG interactivos de React:
1. **Líneas Degradadas:** SVG `path` con propiedad Bézier (`d="M... C..."`), utilizando un `<linearGradient>` en la definición de la curva SVG para un efecto degradado premium.
2. **Barras Redondeadas:** Elementos `<rect>` con propiedades `rx="4" ry="4"` para esquinas estilizadas.
3. **Efecto Hover & Tooltips:** Estados locales de React `hoveredData` para mostrar tooltips flotantes premium (`position: absolute`, `backdrop-filter: blur(8px)`) sobre los puntos de datos activos.

---

## 4. Flujo de Datos y Consultas a Supabase

Los datos se consultarán de forma perezosa (lazy-loading) al cambiar de pestaña para optimizar el rendimiento y evitar descargas masivas innecesarias al abrir la aplicación:
* Las consultas filtrarán los datos basándose en un selector de fecha global en el Topbar.
* Mapeos de consultas clave:
  * Ventas: `supabase.from('ventas').select('*')` y `supabase.from('ventas_detalles').select('*')`.
  * Cobranza: `supabase.from('clientes').select('id, nombre, saldo_deudor, limite_credito')` y `supabase.from('ventas').select('*').eq('tipo_pago', 'credito')`.
  * Inventario: `supabase.from('productos').select('*')` y `supabase.from('inventario_lotes').select('*')`.
  * Caja: `supabase.from('caja_turnos').select('*')`.
