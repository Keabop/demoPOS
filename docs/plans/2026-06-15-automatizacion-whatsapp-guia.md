# Guía de Automatización y Configuración: n8n + Evolution API

Esta guía detalla cómo levantar y configurar la infraestructura local en la computadora de la oficina para enviar mensajes de WhatsApp automatizados (Tickets de Ventas, Recibos de Abonos y Recordatorios de Cobranza) desde la aplicación web de AGROMAR.

---

## 🚀 Paso 1: Levantar los Servicios con Docker

Dado que ya tienes Docker y WSL instalado en la computadora de la oficina, levantar todo el sistema toma menos de un minuto.

1. Abre una terminal (PowerShell o CMD) en la carpeta raíz del proyecto `AGROMAR` (donde se encuentra el archivo `docker-compose.yml`).
2. Ejecuta el siguiente comando para levantar los servicios en segundo plano:
   ```bash
   docker compose up -d
   ```
3. Verifica que los servicios estén corriendo correctamente ejecutando:
   ```bash
   docker compose ps
   ```
   * **n8n** estará disponible en: `http://localhost:5678`
   * **Evolution API** estará disponible en: `http://localhost:8080`

---

## 📱 Paso 2: Crear tu Instancia en Evolution API

Evolution API funciona de forma similar a WhatsApp Web: necesita que crees una "instancia" (sesión) y escanees un código QR con el celular de ventas de la tienda.

### 1. Crear la Instancia de WhatsApp
Para crear la instancia llamada `agromar-ventas`, ejecuta este comando desde PowerShell (reemplazando `agromarApiKey123` por la api key configurada si la cambiaste):

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/instance/create" `
  -Method Post `
  -Headers @{ "apikey" = "agromarApiKey123" } `
  -ContentType "application/json" `
  -Body '{"instanceName": "agromar", "token": "agromarApiKey123", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

### 2. Escanear el Código QR
* El comando anterior te devolverá un JSON que contiene una representación del código QR en base64.
* Alternativamente, abre la dirección de la consola de Evolution API para ver el QR o usa una herramienta gratuita como el panel web de Evolution API (`Evolution Manager`) o abre:
  `http://localhost:8080/instance/connect/agromar`
* En el celular de ventas de la tienda, ve a **WhatsApp → Dispositivos vinculados → Vincular un dispositivo** y escanea el código QR en pantalla.
* Una vez vinculado, el estado cambiará a `CONNECTED`. ¡Listo! El celular ya puede enviar mensajes programáticamente.

---

## 🤖 Paso 3: Configurar los Workflows en n8n

1. Abre tu navegador e ingresa a `http://localhost:5678`.
2. Completa el registro inicial (crea tu usuario administrador local).
3. Para crear tus automatizaciones, crea un **Nuevo Workflow** e importa el siguiente diseño lógico:

### A. Estructura del Workflow para Nueva Venta
1. **Node 1: Webhook (POST)**
   * Path: `agromar-ventas`
   * URL resultante: `http://localhost:5678/webhook/agromar-ventas`
2. **Node 2: HTTP Request (Enviar WhatsApp)**
   * Method: `POST`
   * URL: `http://agromar-evolution-api:8080/message/sendText/agromar`
   * Headers:
     * `apikey`: `agromarApiKey123`
   * Body (JSON):
     ```json
     {
       "number": "{{ $json.phone }}",
       "text": "{{ $json.text }}"
     }
     ```

### B. Estructura del Workflow para Abonos
1. **Node 1: Webhook (POST)**
   * Path: `agromar-abonos`
   * URL resultante: `http://localhost:5678/webhook/agromar-abonos`
2. **Node 2: HTTP Request (Enviar WhatsApp)**
   * Method: `POST`
   * URL: `http://agromar-evolution-api:8080/message/sendText/agromar`
   * Headers:
     * `apikey`: `agromarApiKey123`
   * Body (JSON):
     ```json
     {
       "number": "{{ $json.phone }}",
       "text": "{{ $json.text }}"
     }
     ```

### C. Estructura para Recordatorios de Deuda (Cobranza Automática)
1. **Node 1: Schedule Trigger (Cron)**
   * Intervalo: Semanal (Lunes a las 10:00 AM).
2. **Node 2: Supabase / Postgres Node**
   * Operación: Consultar clientes morosos.
   * Query SQL:
     ```sql
     SELECT nombre, telefono, saldo_deudor, dias_credito
     FROM clientes
     WHERE saldo_deudor > 0 AND activo_para_credito = false;
     ```
3. **Node 3: HTTP Request (Enviar WhatsApp de Cobro)**
   * URL: `http://agromar-evolution-api:8080/message/sendText/agromar`
   * Body (JSON):
     ```json
     {
       "number": "{{ $json.telefono }}",
       "text": "*RECORDATORIO DE PAGO - AGROMAR*\n\nHola {{ $json.nombre }}, le recordamos de la manera más atenta que tiene un saldo pendiente de *${{ $json.saldo_deudor }} MXN* vencido. Le solicitamos de favor pasar a liquidar o realizar un abono a la brevedad. ¡Gracias por su preferencia!"
     }
     ```

---

## 🛠️ Paso 4: Configuración en Windows para Inicio Automático

Para que los servicios inicien solos al prender la computadora de la oficina:
1. Abre **Docker Desktop**.
2. Haz clic en el ícono de engranaje (**Settings**) en la barra superior.
3. En la pestaña **General**, marca la casilla **"Start Docker Desktop when you log in"**.
4. ¡Listo! Ya puedes apagar la computadora al cierre de la jornada de trabajo; todo se levantará solo al encenderla al día siguiente.
