# Configuración del envío automático de WhatsApp (n8n + Evolution API + ngrok + Cloudflare)

Esta guía explica **cómo queda conectado el envío automático de tickets y recibos de
abono por WhatsApp** en producción, y **todos los pasos** para montarlo o repararlo.

> ℹ️ **¿No quieres montar nada?** El sistema funciona igual sin esto: si el webhook no
> está disponible, la app cae a un **respaldo `wa.me`** que abre WhatsApp con el mensaje
> ya escrito; el cajero solo da "Enviar". Todo lo de abajo es para que sea **100% automático**.

---

## 1. Cómo funciona (arquitectura)

La app (POS) vive en internet (Cloudflare, HTTPS) y n8n + Evolution viven en la
**computadora del local**. El flujo de un envío es:

```
Caja (navegador) → agromar.pages.dev (Cloudflare, HTTPS)
                 → https://<tu-dominio>.ngrok-free.dev  (ngrok, HTTPS público)
                 → http://localhost:5678  (n8n, en la PC del local)
                 → http://evolution-api:8080  (Evolution API, mismo Docker)
                 → WhatsApp del cliente
```

**Por qué hace falta ngrok:** el navegador **bloquea** que una página segura (HTTPS) le
hable a algo inseguro (HTTP). Solo `localhost` es excepción (funciona en la MISMA compu
del contenedor). Para que **cualquier caja** mande WhatsApp, n8n necesita una dirección
**HTTPS pública** → eso lo da **ngrok** (un "cable" seguro hacia tu n8n local; n8n y
Evolution **siguen 100% locales**).

**Piezas:**
| Pieza | Dónde corre | Para qué |
|---|---|---|
| POS (frontend) | Cloudflare Pages (`agromar.pages.dev`) | La app |
| n8n | Docker en la PC del local (`:5678`) | Recibe el webhook y arma el mensaje |
| Evolution API | Docker en la PC del local (`:8080`) | Manda el WhatsApp (instancia conectada por QR) |
| ngrok | La PC del local | Puerta HTTPS pública hacia n8n |

---

## 2. Docker: n8n + Evolution API (en la PC del local)

1. Levanta el `docker-compose` que tiene **n8n** y **evolution-api**. Quedan en:
   - n8n → `http://localhost:5678`
   - Evolution API → `http://localhost:8080` (n8n la llama internamente como `http://evolution-api:8080`)
2. **Conecta WhatsApp en Evolution:** entra al manager de Evolution, crea/abre la
   instancia **`agromar`** y **escanea el QR** con el WhatsApp del negocio. Debe quedar
   "conectada". Sin esto, n8n envía pero Evolution no entrega.
3. La **apikey** de Evolution es la que está configurada en el nodo HTTP de n8n
   (header `apikey`). Si la cambias en el `docker-compose`, actualízala también en n8n.

> La PC del local debe estar **encendida** con Docker corriendo para que se envíe WhatsApp.

---

## 3. n8n: importar el flujo, CORS y activar

1. En n8n → **Import from File** → `docs/plans/agromar-n8n-workflow.json`.
2. El flujo trae **2 webhooks**:
   - `agromar-ventas` → manda el **ticket de compra**.
   - `agromar-abonos` → manda el **recibo de abono**.
   Cada uno arma el número como **`(lada || '52') + phone`** (soporta México +52, EE.UU. +1, etc.)
   y llama a Evolution `…/message/sendText/agromar`.
3. **CORS:** abre **cada** nodo Webhook → **Options → Add Option → Allowed Origins (CORS)**
   → escribe `https://agromar.pages.dev` (puedes usar `*` para la primera prueba).
4. **Activa** el workflow (toggle "Active" arriba a la derecha) y guarda.

> Si editas la lógica del número en n8n, recuerda que la app manda `{ phone, lada, text, … }`.

---

## 4. ngrok: exponer n8n con HTTPS

### 4.1 Instalación (una vez)
- Descarga ngrok de https://ngrok.com/download (o `winget install Ngrok.Ngrok`).
- ⚠️ **Actualízalo:** las cuentas requieren agente **≥ 3.20**. Si lo instalaste con winget
  (trae una versión vieja), corre:
  ```powershell
  ngrok update
  ```

### 4.2 Token (una vez)
En el panel de ngrok → **Your Authtoken** → cópialo y:
```powershell
ngrok config add-authtoken TU_AUTHTOKEN
```

### 4.3 Dominio estático gratis
En el panel de ngrok → **Domains** → reclama tu **dominio gratis** (tipo
`xxxx-xxxx-xxxx.ngrok-free.dev`). Es **fijo** y no cambia. El nombre "feo" da igual porque
nadie lo ve. **Dominio actual:** `footgear-backspace-molehill.ngrok-free.dev`

### 4.4 Levantar el túnel
```powershell
ngrok http --url=https://footgear-backspace-molehill.ngrok-free.dev 5678
```
Debe decir **`Session Status: online`**. Inspector local (ver todas las peticiones en vivo):
**http://127.0.0.1:4040**

### 4.5 Dejarlo permanente (servicio que arranca solo)
Edita el config de ngrok (ruta con `ngrok config check`, suele ser
`%LOCALAPPDATA%\ngrok\ngrok.yml`):
```yaml
version: "2"
authtoken: TU_AUTHTOKEN
tunnels:
  n8n:
    proto: http
    addr: 5678
    domain: footgear-backspace-molehill.ngrok-free.dev
```
Luego, en PowerShell **como administrador**:
```powershell
ngrok service install
ngrok service start
```
Así ngrok arranca solo cada vez que prende la PC.

---

## 5. Cloudflare Pages: variables de entorno y redeploy

1. Cloudflare → **Workers & Pages → (proyecto del POS) → Settings → Environment variables**
   (entorno **Production**), agrega:
   ```
   VITE_N8N_WEBHOOK_URL        = https://footgear-backspace-molehill.ngrok-free.dev/webhook/agromar-ventas
   VITE_N8N_ABONOS_WEBHOOK_URL = https://footgear-backspace-molehill.ngrok-free.dev/webhook/agromar-abonos
   ```
2. **Redeploy obligatorio:** estas variables se "hornean" al construir la app. Cualquier
   cambio de variable requiere volver a desplegar (un `git push` a `main` redeploya solo,
   o "Retry deployment" en Cloudflare). Espera a que el deploy diga **Success**.

> El código ya manda el header `ngrok-skip-browser-warning` para saltar la advertencia del
> plan gratis de ngrok.

---

## 6. Cómo probar

1. Ten corriendo en la PC del local: **Docker (n8n + Evolution)** + **ngrok**.
2. Abre el inspector **http://127.0.0.1:4040** en la PC.
3. Desde **otra caja o un celular**, entra a `agromar.pages.dev` → registra una **venta a
   un cliente con teléfono** (o un **abono**).
4. Señales de éxito:
   - El WhatsApp **se manda solo** (NO se abre la app de WhatsApp).
   - En **n8n → Executions** aparece la ejecución.
   - En el inspector **4040** ves la petición con respuesta **200**.
5. Si en su lugar **se abre WhatsApp** con el mensaje escrito → cayó al respaldo `wa.me`
   (el webhook no respondió) → revisa la sección de problemas.

---

## 7. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Se abre `wa.me` en vez de mandarse solo | El webhook no respondió | Revisa 4040 y n8n Executions |
| Error de **CORS** en el inspector / consola | n8n no permite el origen/headers | Pon `Allowed Origins` en los nodos Webhook (`https://agromar.pages.dev` o `*`) |
| `ERR_NGROK_121` (agente viejo) | ngrok < 3.20 | `ngrok update` |
| `unknown flag: --url` | ngrok viejo | `ngrok update` (o usa `--domain=` en versiones viejas) |
| La URL pública no abre n8n | Túnel caído o Docker apagado | Verifica `ngrok` corriendo y n8n en `:5678` |
| Llega a n8n pero no manda WhatsApp | Instancia de Evolution desconectada | Reescanea el QR de la instancia `agromar` |
| Funciona en una caja pero no en otra | Estaban usando `localhost` | Confirma que las variables de Cloudflare apuntan al dominio de ngrok |

---

## 8. Mantenimiento / notas

- La **PC del local** debe estar encendida con **Docker + ngrok** corriendo (por eso se
  instala ngrok como servicio).
- El **dominio de ngrok es fijo**; solo se actualizan las variables de Cloudflare si algún
  día lo cambias (y entonces hay que **redeploy**).
- La **instancia de WhatsApp** (Evolution) debe seguir conectada; si el WhatsApp se
  desvincula, hay que reescanear el QR.
- **Plan gratis de ngrok:** suficiente para un local chico (tráfico de mensajes de texto).
  Si algún día se necesita algo más robusto, se puede migrar a un dominio propio + Cloudflare
  Tunnel, o a n8n/Evolution en un servidor.
