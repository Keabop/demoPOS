// src/components/TourGuiado.tsx
// Tutorial guiado interactivo de la DEMO (driver.js). Escucha 'demo:start-tour'
// (botón del DemoBanner) y recorre a fondo CADA función del POS y luego la cartera
// de crédito. Navega entre pantallas disparando 'demo:goto' (App lo escucha).
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour-amber.css';

// Evita 2 tours simultáneos (doble-registro de StrictMode en dev, doble click, etc.).
let tourActivo = false;

function goto(screen: string) {
  window.dispatchEvent(new CustomEvent('demo:goto', { detail: screen }));
}

// Espera (con tope) a que un selector exista: la pantalla destino puede tardar en montar.
function waitFor(selector: string, timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (document.querySelector(selector) || Date.now() - t0 > timeout) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export function TourGuiado() {
  useEffect(() => {
    const start = async () => {
      if (tourActivo) return;
      tourActivo = true;
      // Arrancamos en el POS (corazón del guión) y esperamos a que esté montado.
      goto('pos');
      await waitFor('[data-tour="pos-buscar"]');

      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: 'rgba(20, 19, 13, 0.7)',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Atrás',
        doneBtnText: '¡Listo!',
        progressText: '{{current}} de {{total}}',
        popoverClass: 'tour-amber',
        onDestroyed: () => { tourActivo = false; },
        steps: [
          {
            popover: {
              title: '¡Bienvenida! 👋',
              description: 'Le voy a mostrar <b>todo su Punto de Venta</b>, función por función, y luego su cartera de crédito. Puede ir con <b>Siguiente</b> o hacer las cosas usted misma; el tutorial la acompaña. Empecemos en el mostrador.',
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
            // Transición a INVENTARIO (popover centrado mientras carga la pantalla).
            popover: {
              title: '14. Pasemos a su inventario',
              description: 'Listo con las ventas. Ahora veamos <b>Inventario</b>, donde controla sus productos y existencias.',
            },
            onHighlightStarted: () => { goto('inventario'); },
          },
          {
            element: '[data-tour="inv-nuevo"]',
            popover: {
              title: '15. Dar de alta un producto',
              description: 'Con <b>Nuevo Producto</b> agrega un artículo a su catálogo: nombre, sus precios (contado y crédito), categoría y el stock con el que arranca.',
            },
          },
          {
            element: '[data-tour="inv-movimiento"]',
            popover: {
              title: '16. Entradas y salidas de inventario',
              description: 'Aquí registra movimientos: una <b>entrada</b> cuando le llega mercancía (una compra), o una <b>salida</b> cuando saca producto por <b>merma, ajuste o caducidad</b>. El stock se actualiza solo y queda el registro.',
            },
          },
          {
            // Transición a CLIENTES.
            popover: {
              title: '17. Ahora sus clientes',
              description: 'Pasemos a <b>Clientes</b>: su directorio, con el crédito y el historial de cada uno.',
            },
            onHighlightStarted: () => { goto('clientes'); },
          },
          {
            element: '[data-tour="cli-nuevo"]',
            popover: {
              title: '18. Dar de alta un cliente',
              description: 'Con <b>Nuevo Cliente</b> registra a un comprador y le asigna su <b>límite de crédito</b> y sus días de plazo para fiarle.',
            },
          },
          {
            element: '[data-tour="cli-estado"]',
            popover: {
              title: '19. Estado de cuenta del cliente',
              description: 'Con <b>Estado de cuenta</b> ve todo de un cliente: cuánto debe, sus pagos, su crédito disponible y cada una de sus notas — con el interés ya calculado.',
            },
          },
          {
            // Transición a NOTAS A CRÉDITO.
            popover: {
              title: '20. Su cartera de crédito',
              description: 'Por último, <b>Notas a Crédito</b>: todas las deudas en un solo lugar, con su interés del <b>2% mensual</b> siempre al día (mire a <b>Lucía Torres</b>, vencida).',
            },
            onHighlightStarted: () => { goto('credito'); },
          },
          {
            element: '[data-tour="cred-cobrar"]',
            popover: {
              title: '21. Cómo cobrar un abono',
              description: 'Para <b>cobrar</b>, dé <b>Registrar Pago</b> en la fila del cliente, anote cuánto le abonó y listo: el <b>saldo baja al instante</b>, se registra en su caja y, si lo liquida, la nota se marca como pagada.',
            },
          },
          {
            popover: {
              title: '¡Eso es todo! 🎉',
              description: 'Ya conoce su sistema completo: <b>vender</b>, <b>inventario</b>, <b>clientes</b> y <b>cobranza con interés</b>, todo en un solo lugar. ¿Lista para probarlo usted misma? Puede reiniciar la demo cuando quiera con el botón <b>Reiniciar demo</b> de arriba.',
            },
          },
        ],
      });
      d.drive();
    };

    window.addEventListener('demo:start-tour', start);
    return () => window.removeEventListener('demo:start-tour', start);
  }, []);

  return null;
}
