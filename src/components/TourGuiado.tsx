// src/components/TourGuiado.tsx
// Tutorial guiado interactivo de la DEMO (driver.js), organizado POR CAPÍTULOS.
// El botón "Ver tutorial" del DemoBanner dispara 'demo:start-tour', que abre un
// MENÚ de capítulos (overlay ámbar). Cada capítulo es un mini-tour enfocado en un
// área del sistema; al terminar se vuelve al menú para elegir otro. La navegación
// entre pantallas se hace disparando 'demo:goto' (App lo escucha y hace navigate()).
import { useEffect, useState } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour-amber.css';
import { Icon } from './Icon';
import { useAuth } from '../features/auth/AuthContext';
import { can } from '../features/auth/useCan';
import type { Capacidad } from '../lib/capacidades';

// Evita 2 tours simultáneos (doble-registro de StrictMode en dev, doble click, etc.).
let tourActivo = false;

function goto(screen: string) {
  window.dispatchEvent(new CustomEvent('demo:goto', { detail: screen }));
}

// Espera (con tope) a que un selector exista: la pantalla destino puede tardar en montar.
function waitFor(selector: string, timeout = 6000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (document.querySelector(selector) || Date.now() - t0 > timeout) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

// Cambia de pestaña (Compras/Reportes) dando clic al botón cuyo texto coincide,
// dentro de un contenedor. Se usa en onHighlightStarted del paso de transición.
function clickPorTexto(contenedor: string, texto: string) {
  const root = document.querySelector(contenedor);
  if (!root) return;
  const btn = Array.from(root.querySelectorAll('button')).find((b) =>
    (b.textContent || '').toLowerCase().includes(texto.toLowerCase())
  );
  (btn as HTMLButtonElement | undefined)?.click();
}

// Da clic a un elemento (p.ej. expandir una fila del historial).
function clickEl(selector: string) {
  (document.querySelector(selector) as HTMLElement | null)?.click();
}

// ───────────────────────── Pasos por capítulo ─────────────────────────

const PASOS_INICIO: DriveStep[] = [
  {
    popover: {
      title: 'Su tablero de inicio',
      description: 'Es el <b>pulso de su negocio</b>: lo más importante del día, de un vistazo, en cuanto entra. Veámoslo.',
    },
  },
  {
    element: '[data-tour="dash-kpis"]',
    popover: {
      title: 'Los números del día',
      description: 'Sus indicadores clave: <b>ventas de hoy</b>, <b>productos por agotarse</b>, <b>notas a crédito pendientes</b> y <b>clientes activos</b>. Cada tarjeta es un acceso directo: dé clic y la lleva a su detalle.',
    },
  },
  {
    element: '[data-tour="dash-rango"]',
    popover: {
      title: 'Su tendencia de ventas',
      description: 'La gráfica muestra cómo va vendiendo. Cambie entre <b>Semana, Mes o Año</b> para ver el panorama corto o largo.',
    },
  },
  {
    element: '[data-tour="dash-acciones"]',
    popover: {
      title: 'Accesos rápidos',
      description: 'Botones directos a lo que más usa: <b>flujo de caja, cobranza, inventario y clientes</b>. Sin dar vueltas por el menú.',
    },
  },
  {
    element: '[data-tour="dash-alertas"]',
    popover: {
      title: 'Atención requerida',
      description: 'Aquí le avisa de los <b>créditos vencidos</b> que necesitan cobro. Su interés del <b>2% mensual</b> se va sumando solo, así que nunca pierde de vista lo que le deben.',
    },
  },
  {
    popover: {
      title: 'Eso es su inicio',
      description: 'Con esta pantalla sabe, apenas abre, cómo va el negocio hoy. Elija otro tema del menú para seguir conociendo el sistema.',
    },
  },
];

const PASOS_VENTAS: DriveStep[] = [
  {
    popover: {
      title: 'Su Punto de Venta',
      description: 'El mostrador donde arma cada venta. Le muestro <b>función por función</b> cómo cobrar de contado o a crédito.',
    },
  },
  {
    element: '[data-tour="pos-codigo"]',
    popover: {
      title: '1. Código de barras',
      description: 'Si el producto tiene código de barras, lo <b>escanea con su lector</b> (o lo teclea aquí) y se agrega solo a la venta. Atajo: tecla <b>F2</b>.',
    },
  },
  {
    element: '[data-tour="pos-escanear"]',
    popover: {
      title: '2. Escanear con cámara',
      description: '¿No tiene lector? Puede usar la <b>cámara</b> de la computadora o el celular para leer el código. Práctico para el mostrador.',
    },
  },
  {
    element: '[data-tour="pos-buscar"]',
    popover: {
      title: '3. Buscar por nombre',
      description: 'O simplemente <b>escriba el nombre</b> del producto. La lista se filtra al instante mientras teclea.',
    },
  },
  {
    element: '[data-tour="pos-categorias"]',
    popover: {
      title: '4. Filtrar por categoría',
      description: 'Acote por tipo: <b>fertilizantes, herbicidas, semillas…</b> para encontrar más rápido lo que vende.',
    },
  },
  {
    element: '[data-tour="pos-grid"]',
    popover: {
      title: '5. Su catálogo',
      description: 'Aquí están sus productos con <b>precio</b> y <b>existencias</b>. Dé clic para agregarlos. El color del número de stock le avisa: <b>verde</b> bien, <b>ámbar</b> bajo, <b>rojo</b> por agotarse.',
    },
  },
  {
    element: '[data-tour="pos-tipo"]',
    popover: {
      title: '6. ¿Venta de mostrador o a crédito?',
      description: 'Elija <b>Venta Anónima</b> para el público en general, o <b>Venta a Cliente</b> para venderle a uno de sus clientes (y poder fiarle).',
    },
  },
  {
    element: '[data-tour="pos-precio"]',
    popover: {
      title: '7. Precio automático por nivel',
      description: 'El sistema aplica solo el precio correcto: <b>contado</b>, <b>crédito</b> o <b>subdistribuidor</b>. Usted no anda recordando listas de precios.',
    },
  },
  {
    element: '[data-tour="pos-cliente"]',
    popover: {
      title: '8. Vender a un cliente',
      description: 'Al elegir <b>Venta a Cliente</b> busca al cliente por nombre, número o rancho. Verá su <b>límite</b>, su <b>saldo con interés</b> y si está apto para crédito.',
    },
  },
  {
    element: '[data-tour="pos-carrito"]',
    popover: {
      title: '9. El carrito de la venta',
      description: 'Aquí se va armando la venta: <b>ajuste cantidades</b>, quite productos o vacíe todo. El total se recalcula solo.',
    },
  },
  {
    element: '[data-tour="pos-metodo"]',
    popover: {
      title: '10. Cómo le pagan',
      description: 'Elija el método: <b>efectivo, transferencia, débito o tarjeta</b>. Cada uno deja registrado el movimiento en su caja.',
    },
  },
  {
    element: '[data-tour="pos-efectivo"]',
    popover: {
      title: '11. Cambio automático',
      description: 'En efectivo, anote cuánto le dieron (o use los botones rápidos <b>+$50, +$100…</b>) y el sistema le calcula el <b>cambio</b> al instante.',
    },
  },
  {
    element: '[data-tour="pos-cobrar"]',
    popover: {
      title: '12. Cobrar o fiar',
      description: 'El botón muestra el <b>total</b> y, según su elección, <b>cobra de contado</b> o genera la <b>nota a crédito (pagaré)</b> con los datos del cliente. Así de rápido queda la venta.',
    },
  },
  {
    element: '[data-tour="pos-cotizacion"]',
    popover: {
      title: '13. Cotizaciones',
      description: '¿El cliente solo está preguntando? Genere una <b>cotización en PDF</b> para entregársela, y luego conviértala en venta con un clic.',
    },
  },
  {
    popover: {
      title: 'Eso es vender',
      description: 'Ya conoce todo su mostrador. Vuelva al menú para ver cómo se controla la <b>caja</b>, el <b>inventario</b> o el <b>crédito</b>.',
    },
  },
];

const PASOS_CAJA: DriveStep[] = [
  {
    popover: {
      title: 'Su caja',
      description: 'Le dice, en todo momento, <b>cuánto dinero debería tener</b> en el cajón y le ayuda a cerrar el turno cuadrado.',
    },
  },
  {
    element: '.caja-stat-card',
    popover: {
      title: 'Los números de su turno',
      description: 'De un vistazo: con cuánto <b>abrió</b>, cuánto ha <b>entrado</b> y el <b>efectivo estimado</b> que debería haber ahora en caja.',
    },
  },
  {
    element: '[data-tour="caja-resumen"]',
    popover: {
      title: 'De dónde sale el efectivo',
      description: 'El desglose: <b>ventas en efectivo</b>, <b>abonos</b> de clientes, ingresos y egresos. La suma es el <b>efectivo que el sistema espera</b> en su cajón.',
    },
  },
  {
    element: '[data-tour="caja-mov-manual"]',
    popover: {
      title: 'Ingresos y retiros',
      description: '¿Sacó dinero para un pago o metió un fondo? Regístrelo aquí como <b>ingreso o egreso</b> para que su corte siempre cuadre.',
    },
  },
  {
    element: '#corte-monto',
    popover: {
      title: 'El conteo físico',
      description: 'Al cerrar, cuente el efectivo de su cajón y anótelo aquí. El sistema lo compara con lo esperado y le dice si <b>cuadra, sobra o falta</b>.',
    },
  },
  {
    element: '[data-tour="caja-corte"]',
    popover: {
      title: 'Cerrar el turno',
      description: 'Con <b>Realizar Corte</b> cierra el turno: queda guardado el arqueo y su diferencia. Listo para empezar limpio el día siguiente.',
    },
  },
];

const PASOS_INVENTARIO: DriveStep[] = [
  {
    popover: {
      title: 'Su inventario',
      description: 'Aquí controla sus productos, sus existencias y sus precios. Veámoslo.',
    },
  },
  {
    element: '[data-tour="inv-nuevo"]',
    popover: {
      title: 'Dar de alta un producto',
      description: 'Con <b>Nuevo Producto</b> agrega un artículo: nombre, sus precios (contado y crédito), categoría y el stock con el que arranca.',
    },
  },
  {
    element: '[data-tour="inv-movimiento"]',
    popover: {
      title: 'Entradas y salidas',
      description: 'Registre movimientos: una <b>entrada</b> cuando le llega mercancía, o una <b>salida</b> por <b>merma, ajuste o caducidad</b>. El stock se actualiza solo y queda el registro.',
    },
  },
  {
    popover: {
      title: 'Ahora, sus precios',
      description: 'Pasemos a la <b>Lista de Precios</b> para ver cómo maneja sus tres niveles de venta.',
    },
    onHighlightStarted: () => { goto('precios'); },
  },
  {
    element: '[data-tour="precios-niveles"]',
    popover: {
      title: 'Tres precios por producto',
      description: 'Cada artículo tiene su precio de <b>contado</b>, de <b>crédito</b> y de <b>subdistribuidor</b> (mayoreo). El sistema aplica el correcto solo en cada venta.',
    },
  },
  {
    element: '[data-tour="precios-ieps"]',
    popover: {
      title: 'IEPS cuando aplica',
      description: 'Si un producto causa <b>IEPS</b>, aquí ve su porcentaje. Esta pantalla es de <b>consulta</b>: los precios se cambian al dar de alta o editar el producto, o al registrar una compra.',
    },
  },
];

const PASOS_COMPRAS: DriveStep[] = [
  {
    popover: {
      title: 'Compras y proveedores',
      description: 'De aquí salen sus productos: a quién le compra, qué pide y qué le debe. Tiene <b>tres áreas</b>.',
    },
  },
  {
    element: '[data-tour="compras-tabs"]',
    popover: {
      title: 'Sus tres pestañas',
      description: '<b>Órdenes de compra</b> (pedidos formales), <b>Compras locales</b> (de mostrador, con pagaré) y <b>Proveedores</b> (su directorio). Empecemos por los proveedores.',
    },
  },
  {
    popover: {
      title: 'Proveedores',
      description: 'Veamos su directorio de proveedores.',
    },
    onHighlightStarted: () => { clickPorTexto('[data-tour="compras-tabs"]', 'Proveedores'); },
  },
  {
    element: '[data-tour="prov-nuevo"]',
    popover: {
      title: 'Dar de alta un proveedor',
      description: 'Con <b>Nuevo proveedor</b> registra a quién le compra: sus datos y si es local. Cada tarjeta le muestra cuánto le debe.',
    },
  },
  {
    element: '[data-tour="prov-productos"]',
    popover: {
      title: 'Qué le compra a cada quien',
      description: 'En <b>Productos</b> define qué artículos maneja ese proveedor y a qué precio. Eso alimenta sus órdenes de compra.',
    },
  },
  {
    popover: {
      title: 'Órdenes de compra',
      description: 'Ahora los pedidos formales a proveedor.',
    },
    onHighlightStarted: () => { clickPorTexto('[data-tour="compras-tabs"]', 'Órdenes'); },
  },
  {
    element: '[data-tour="ordenes-nueva"]',
    popover: {
      title: 'Crear una orden',
      description: 'Con <b>Nueva orden</b> arma un pedido: elige al proveedor, agrega productos y cantidades. Queda en <b>borrador</b> hasta que la envíe.',
    },
  },
  {
    element: '[data-tour="ordenes-fila"]',
    popover: {
      title: 'Recibir la mercancía',
      description: 'Al dar clic en una orden ve su detalle y, cuando le llega, la marca como <b>recibida</b>: ahí <b>entra al inventario</b> con su costo, automáticamente.',
    },
  },
  {
    popover: {
      title: 'Compras locales',
      description: 'Y las compras de mostrador, con su pagaré.',
    },
    onHighlightStarted: () => { clickPorTexto('[data-tour="compras-tabs"]', 'locales'); },
  },
  {
    element: '[data-tour="locales-nueva"]',
    popover: {
      title: 'Registrar una compra local',
      description: 'Con <b>Nueva compra local</b> captura una compra de contado o a crédito. Al guardar, la mercancía <b>entra al inventario</b> y, si es a crédito, genera su cuenta por pagar.',
    },
  },
  {
    element: '[data-tour="locales-porpagar"]',
    popover: {
      title: 'Lo que usted debe',
      description: 'Aquí ve el total <b>por pagar a proveedores</b>. Igual que sus clientes le deben a usted, esto le recuerda lo que usted debe.',
    },
  },
  {
    element: '[data-tour="locales-pago"]',
    popover: {
      title: 'Pagar a un proveedor',
      description: 'Con <b>Registrar pago</b> abona o liquida una compra a crédito. El saldo por pagar baja al instante.',
    },
  },
];

const PASOS_CLIENTES: DriveStep[] = [
  {
    popover: {
      title: 'Clientes y crédito',
      description: 'Su directorio de clientes, con el crédito y la cobranza de cada uno. Veámoslo.',
    },
  },
  {
    element: '[data-tour="cli-nuevo"]',
    popover: {
      title: 'Dar de alta un cliente',
      description: 'Con <b>Nuevo Cliente</b> registra a un comprador y le asigna su <b>límite de crédito</b> y sus días de plazo para fiarle.',
    },
  },
  {
    element: '[data-tour="cli-estado"]',
    popover: {
      title: 'Estado de cuenta',
      description: 'Con <b>Estado de cuenta</b> ve todo de un cliente: cuánto debe, sus pagos, su crédito disponible y cada una de sus notas — con el interés ya calculado.',
    },
  },
  {
    popover: {
      title: 'Su cartera de crédito',
      description: 'Pasemos a <b>Notas a Crédito</b>: todas las deudas en un solo lugar, con su interés del <b>2% mensual</b> siempre al día (mire a <b>Lucía Torres</b>, vencida).',
    },
    onHighlightStarted: () => { goto('credito'); },
  },
  {
    element: '[data-tour="cred-cobrar"]',
    popover: {
      title: 'Cómo cobrar un abono',
      description: 'Para <b>cobrar</b>, dé <b>Registrar Pago</b> en la fila del cliente, anote cuánto le abonó y listo: el <b>saldo baja al instante</b>, se registra en su caja y, si lo liquida, la nota se marca como pagada.',
    },
  },
];

const PASOS_REPORTES: DriveStep[] = [
  {
    popover: {
      title: 'Sus reportes',
      description: 'El análisis a fondo de su negocio. Cuatro reportes con números, gráficas y tablas.',
    },
  },
  {
    element: '[data-tour="rep-tabs"]',
    popover: {
      title: 'Cuatro áreas de análisis',
      description: '<b>Ventas</b>, <b>Crédito y cobranza</b>, <b>Inventario</b> y <b>Caja</b>. Cada pestaña abre su propio reporte detallado.',
    },
  },
  {
    element: '[data-tour="rep-periodo"]',
    popover: {
      title: 'El período manda',
      description: 'Elija <b>Hoy, 7 días, Mes o Año</b> y todos los números del reporte se ajustan a ese rango.',
    },
  },
  {
    popover: {
      title: 'Ejemplo: su cobranza',
      description: 'Veamos el reporte de <b>Crédito y cobranza</b>, el que más le interesa cuando vende fiado.',
    },
    onHighlightStarted: () => { clickPorTexto('[data-tour="rep-tabs"]', 'Cobranza'); },
  },
  {
    element: '[data-tour="rep-kpis"]',
    popover: {
      title: 'La salud de su cartera',
      description: 'De un vistazo: <b>cartera total</b>, <b>saldo vencido</b>, lo que está por vencer y su <b>porcentaje de recuperación</b>. Así sabe qué tan sana está su cobranza.',
    },
  },
];

const PASOS_HISTORIAL: DriveStep[] = [
  {
    popover: {
      title: 'Historial de ventas',
      description: 'El registro de todo lo que ha vendido. Aquí busca, revisa, reimprime y, si hace falta, devuelve o anula una venta.',
    },
  },
  {
    element: '[data-tour="hv-busqueda"]',
    popover: {
      title: 'Buscar y filtrar',
      description: 'Encuentre cualquier venta por <b>folio o cliente</b>, o fíltrelas por <b>tipo de pago, estado o vendedor</b>.',
    },
  },
  {
    element: '[data-tour="hv-export"]',
    popover: {
      title: 'Exportar e imprimir',
      description: 'Lleve sus ventas a <b>Excel o PDF</b>, o imprímalas. Útil para su contador o para un respaldo.',
    },
  },
  {
    element: '[data-tour="hv-fila"]',
    popover: {
      title: 'El detalle de cada venta',
      description: 'Dé clic en una venta para ver sus productos, su forma de pago y, si aplica, su plazo de crédito. Veámoslo.',
    },
  },
  {
    popover: {
      title: 'Acciones sobre la venta',
      description: 'Al abrir una venta aparecen sus acciones.',
    },
    onHighlightStarted: () => { clickEl('[data-tour="hv-fila"]'); },
  },
  {
    element: '[data-tour="hv-acciones"]',
    popover: {
      title: 'Reimprimir, devolver o anular',
      description: 'Puede <b>reimprimir el ticket</b>, registrar una <b>devolución</b> (repone el stock) o <b>anular</b> la venta. Todo queda registrado en su bitácora.',
    },
  },
];

const PASOS_ADMIN: DriveStep[] = [
  {
    popover: {
      title: 'Administración',
      description: 'El control del sistema: quién entra, qué puede hacer cada quien, qué ha pasado y los datos de su negocio.',
    },
  },
  {
    element: '[data-tour="usr-crear"]',
    popover: {
      title: 'Crear usuarios',
      description: 'Con <b>Crear usuario</b> da acceso a su personal. Al crearlo elige un <b>perfil de permisos</b> (Administrador, Vendedor, Ventas, Técnico…) que define qué ve y qué puede hacer.',
    },
  },
  {
    element: '[data-tour="usr-fila"]',
    popover: {
      title: 'Cada cuenta y su rol',
      description: 'Cada usuario muestra su <b>nombre, correo y rol</b>. Sus ventas quedan registradas con su nombre, para que sepa quién vendió qué.',
    },
  },
  {
    element: '[data-tour="usr-acciones"]',
    popover: {
      title: 'Editar, contraseña, baja',
      description: 'Puede <b>editar</b> el perfil, <b>restablecer la contraseña</b>, o dar de baja. Ojo: <b>desactivar</b> conserva su historial de ventas; <b>eliminar</b> es definitivo.',
    },
  },
  {
    popover: {
      title: 'La bitácora',
      description: 'Veamos el registro de auditoría: quién cambió qué y cuándo.',
    },
    onHighlightStarted: () => { goto('auditoria'); },
  },
  {
    element: '[data-tour="aud-filtros"]',
    popover: {
      title: 'Todo queda registrado',
      description: 'La <b>bitácora</b> guarda cada alta, cambio y baja del sistema. Filtre por <b>tabla, tipo de operación o usuario</b> para encontrar lo que busca.',
    },
  },
  {
    element: '[data-tour="aud-operacion"]',
    popover: {
      title: 'Altas, cambios y bajas',
      description: 'Filtre por tipo de movimiento: <b>Alta</b> (se creó), <b>Cambio</b> (se modificó) o <b>Baja</b> (se borró). Cada registro guarda el <b>antes y el después</b>.',
    },
  },
  {
    popover: {
      title: 'La configuración',
      description: 'Por último, los datos de su negocio.',
    },
    onHighlightStarted: () => { goto('configuracion'); },
  },
  {
    element: '[data-tour="cfg-razon-social"]',
    popover: {
      title: 'Los datos de su negocio',
      description: 'Su <b>nombre comercial</b>, RFC, dirección y teléfono. Esto es lo que sale impreso en sus tickets, notas y pagarés.',
    },
  },
  {
    element: '[data-tour="cfg-logo"]',
    popover: {
      title: 'Su logo',
      description: 'Suba el <b>logo</b> de su negocio para que aparezca en sus documentos. Su sistema, con su marca.',
    },
  },
  {
    element: '[data-tour="cfg-impresion"]',
    popover: {
      title: 'Sus impresoras',
      description: 'Elija la <b>impresora de tickets</b> y la de documentos, y el ancho del papel (58 u 80 mm). Se conecta con su impresora térmica local.',
    },
  },
  {
    element: '[data-tour="cfg-guardar"]',
    popover: {
      title: 'Guardar cambios',
      description: 'Con <b>Guardar cambios</b> aplica los datos. Y eso es todo: ya conoce su sistema completo. ¡Vuelva al menú cuando quiera!',
    },
  },
];

// ───────────────────────── Definición de capítulos ─────────────────────────

type Capitulo = {
  id: string;
  titulo: string;
  resumen: string;
  icono: string;
  screen: string;
  primerAncla: string;
  capacidad?: Capacidad;
  steps: DriveStep[];
};

const CAPITULOS: Capitulo[] = [
  { id: 'inicio', titulo: 'Inicio y tablero', resumen: 'El pulso de su negocio, de un vistazo.', icono: 'home', screen: 'dashboard', primerAncla: '[data-tour="dash-kpis"]', capacidad: 'ver_reportes', steps: PASOS_INICIO },
  { id: 'ventas', titulo: 'Vender (Punto de Venta)', resumen: 'Cobrar de contado o a crédito, paso a paso.', icono: 'cart', screen: 'pos', primerAncla: '[data-tour="pos-buscar"]', capacidad: 'vender', steps: PASOS_VENTAS },
  { id: 'caja', titulo: 'Caja y corte', resumen: 'El efectivo de su cajón y el cierre de turno.', icono: 'cash', screen: 'caja', primerAncla: '.caja-stat-card', capacidad: 'manejar_caja', steps: PASOS_CAJA },
  { id: 'inventario', titulo: 'Inventario y precios', resumen: 'Productos, existencias y sus tres precios.', icono: 'box', screen: 'inventario', primerAncla: '[data-tour="inv-nuevo"]', capacidad: 'gestionar_inventario', steps: PASOS_INVENTARIO },
  { id: 'compras', titulo: 'Compras y proveedores', resumen: 'Pedidos, recepción y cuentas por pagar.', icono: 'sack', screen: 'proveedores', primerAncla: '[data-tour="compras-tabs"]', capacidad: 'gestionar_compras', steps: PASOS_COMPRAS },
  { id: 'clientes', titulo: 'Clientes y crédito', resumen: 'Dar de alta, estado de cuenta y cobrar abonos.', icono: 'users', screen: 'clientes', primerAncla: '[data-tour="cli-nuevo"]', capacidad: 'gestionar_clientes', steps: PASOS_CLIENTES },
  { id: 'reportes', titulo: 'Reportes', resumen: 'Ventas, cobranza, inventario y caja a fondo.', icono: 'report', screen: 'reportes', primerAncla: '[data-tour="rep-tabs"]', capacidad: 'ver_reportes', steps: PASOS_REPORTES },
  { id: 'historial', titulo: 'Historial de ventas', resumen: 'Buscar, exportar, devolver o anular ventas.', icono: 'file', screen: 'historial-ventas', primerAncla: '[data-tour="hv-busqueda"]', capacidad: 'vender', steps: PASOS_HISTORIAL },
  { id: 'admin', titulo: 'Administración', resumen: 'Usuarios, bitácora y datos de su negocio.', icono: 'shield', screen: 'usuarios', primerAncla: '[data-tour="usr-crear"]', capacidad: 'gestionar_usuarios', steps: PASOS_ADMIN },
];

// ───────────────────────── Componente ─────────────────────────

export function TourGuiado() {
  const { profile } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const abrir = () => setMenuAbierto(true);
    window.addEventListener('demo:start-tour', abrir);
    return () => window.removeEventListener('demo:start-tour', abrir);
  }, []);

  const lanzar = async (cap: Capitulo) => {
    if (tourActivo) return;
    tourActivo = true;
    setMenuAbierto(false);
    goto(cap.screen);
    await waitFor(cap.primerAncla);
    let d: ReturnType<typeof driver>;
    d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: 'rgba(20, 19, 13, 0.7)',
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Atrás',
      doneBtnText: 'Terminar ✓',
      progressText: '{{current}} de {{total}}',
      popoverClass: 'tour-amber',
      // Antes de avanzar, espera a que exista el elemento del SIGUIENTE paso. Varias
      // pantallas llenan sus tablas/listas de forma asíncrona (productos, ventas,
      // créditos, reportes); esto evita popovers "perdidos" sobre un elemento aún no
      // montado. Si no carga en 4s, avanza igual (driver lo muestra centrado).
      onNextClick: async () => {
        const i = d.getActiveIndex();
        const sig = i === undefined ? undefined : cap.steps[i + 1];
        const sel = sig?.element;
        if (typeof sel === 'string') await waitFor(sel, 4000);
        d.moveNext();
      },
      // Al cerrar/terminar el capítulo, vuelve al menú para elegir otro tema.
      onDestroyed: () => { tourActivo = false; setMenuAbierto(true); },
      steps: cap.steps,
    });
    d.drive();
  };

  if (!profile || !menuAbierto) return null;

  const disponibles = CAPITULOS.filter((c) => !c.capacidad || can(profile, c.capacidad));

  return (
    <div className="tourmenu-overlay" onClick={() => setMenuAbierto(false)}>
      <div className="tourmenu-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tourmenu-head">
          <div>
            <h2 className="tourmenu-title">Tutorial guiado</h2>
            <p className="tourmenu-sub">Elija un tema y le muestro, paso a paso, cómo se usa.</p>
          </div>
          <button className="tourmenu-close" onClick={() => setMenuAbierto(false)} aria-label="Cerrar tutorial">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="tourmenu-grid">
          {disponibles.map((c, i) => (
            <button key={c.id} className="tourmenu-card" onClick={() => lanzar(c)}>
              <span className="tourmenu-ico"><Icon name={c.icono} size={20} /></span>
              <span className="tourmenu-body">
                <span className="tourmenu-tit"><span className="tourmenu-num">{i + 1}.</span> {c.titulo}</span>
                <span className="tourmenu-res">{c.resumen}</span>
              </span>
              <span className="tourmenu-arrow"><Icon name="chevron-right" size={18} /></span>
            </button>
          ))}
        </div>
        <p className="tourmenu-foot">Puede salir cuando quiera con la ✕ y volver con el botón “Ver tutorial”. Cada tema lo regresa aquí al terminar.</p>
      </div>
    </div>
  );
}
