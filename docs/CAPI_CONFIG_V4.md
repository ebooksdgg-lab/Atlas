# Conversions API (CAPI) para WhatsApp + Embedded Signup config "V4"

> Cómo lograr que el dataset de Conversions API se **auto-cree y auto-conecte** durante
> el Embedded Signup (estilo ManyChat), para mandar eventos `Purchase` atribuidos a
> anuncios Click-to-WhatsApp (CTWA) con el **mismo token del signup** (BISU), sin pasos
> manuales por número.
>
> Derivar esto costó días de pruebas contra la Graph API. Este doc es la fuente de verdad.
> Última validación EN VIVO: 2026-06-25 (ver "UPDATE" abajo).

---

## TL;DR (actualizado tras verificación en vivo 2026-06-25)

- **Lo que importa es que el signup conceda `ads_management`** (el config V4 con productos de
  Ads/CTWA lo hace). Con eso, el **BISU token** del signup **postea eventos a los datasets del
  business** — incluidos datasets creados a mano — **siempre que el system user de la integración
  ("<App> System User") esté asignado al dataset**.
- El dataset **NO necesita auto-crearse**. Podés usar un dataset existente; lo único requerido es
  que el system user del BISU tenga acceso (task `UPLOAD`) a ese dataset. Esa asignación se hace
  con `POST /{dataset}/assigned_users` (1 call, scriptable) o desde la UI.
- El `subcode 33 / Missing Permission` que veíamos antes era porque el BISU **viejo** (signup sin
  `ads_management`) no tenía acceso a ningún dataset. Con el BISU **nuevo** desaparece.
- **NO** confundir la **versión del Graph API** (`v21.0` → `v24.0`, el número del URL) con la
  **generación del config del Embedded Signup** ("V4"). Son cosas distintas (ver más abajo).

> Nota: la hipótesis original (que el único camino era el dataset auto-creado "<WABA> Event Data" y
> que el BISU jamás llega a un dataset manual) quedó **refutada** por la prueba en vivo del 2026-06-25.
> El auto-create sigue siendo lo más limpio, pero NO es la única vía.

---

## UPDATE 2026-06-25 — verificación en vivo (número +19704561909 / WABA Pastas de la Abuela 2312628749265487, BM Natacha)

Se re-onboardeó un número con el config V4 (`config_id 1089619143509334`, app `2044825146471374` "Atlas Chat").

- `debug_token` del BISU nuevo → trae los scopes: `ads_management, ads_read, pages_show_list,
  pages_read_engagement, pages_manage_ads, whatsapp_business_management, whatsapp_business_messaging,
  whatsapp_business_manage_events`. **El config V4 SÍ concede los permisos de Ads.**
- **NO** se auto-creó un dataset `"<WABA> Event Data"` (el config concede permisos pero no incluyó el
  producto Conversions API como asset a crear en el setup). Es indistinto: ver siguiente punto.
- POST `/events` con el BISU nuevo:
  - dataset `1804956360475851` ("Pastas de la abuela") → `events_received:1` (manda)
  - dataset `1716016466262703` ("Pastas 1") → `Invalid Ctwa Clid` (subcode 2804087) = **llega**, solo
    rechaza el `TEST`. Es el dataset realmente conectado a la cuenta de ads CTWA (valida el clid) → **usar este para el funnel**.
  - dataset `1487356746014592` ("Pastas CAPI", creado a mano sin asignar este SU) → `subcode 33`.
- Causa raíz del acceso: ambos datasets reales tienen asignado el **"Atlas Chat System User"
  (`122116003677349998`)** con tasks `ADVERTISE/UPLOAD/ANALYZE/EDIT`. **Esa asignación es lo que
  habilita el envío.** (El "Conversions API System User" `122104907619364707` está con solo `ANALYZE`.)

### Receta práctica confirmada
1. Onboardear bajo config V4 (otorga `ads_management` al BISU).
2. Asegurar que el system user de la integración ("<App> System User") esté **asignado al dataset
   destino** con task `UPLOAD`: `POST /{dataset}/assigned_users` con `business={BM}`,
   `user={su_id}`, `tasks=["EDIT","UPLOAD"]`. (Si el dataset se auto-creó, ya viene asignado.)
3. n8n postea `Purchase` a ese dataset con el `ctwa_clid` real y `whatsapp_business_account_id` = WABA
   del número que recibió el click.

> Pendiente de confirmar: si la asignación del SU a esos datasets la hizo el signup o fue manual.
> Peor caso = 1 call por número (paso 2), scriptable. No bloquea.

---

## Las dos "versiones" que se confunden

| | Qué es | Dónde se cambia | ¿Da CAPI? |
|---|---|---|---|
| `v21` → `v24` | Versión del **Graph API** (la del URL `graph.facebook.com/vXX.0/...`) | string en Atlas (`META_API_VERSION` en `meta.ts:13`; `version: apiVersion` en `connect-form.tsx:171`) | ❌ no |
| "V4" / config | Generación del **config de Facebook Login for Business** (lo que genera el `config_id`) | panel de Meta → Facebook Login for Business → Configurations | ✅ sí, si tildás CTWA + Conversions API |

ManyChat en `v24.0` solo significa que inicializan el SDK con una API más nueva. Eso no agrega
productos al signup. Lo que agrega el dataset auto-creado es el **config con Conversions API**.

Subir la API a `v23/v24` es trivial y sano, pero por sí solo no cambia qué productos pide el signup.

---

## Evidencia (pruebas contra la Graph API, BM Natacha `2177746016025881`, WABA Pastas `2439150209832305`)

| Prueba | Resultado | Conclusión |
|---|---|---|
| Crear dataset por API `POST /{business}/adspixels` | ✅ id devuelto | Se puede crear, pero no sirve (ver abajo) |
| `POST /{dataset}/events` con **token User `ads_management`** | ✅ `events_received:1` (acepta `ctwa_clid:"TEST"`) | El token de Ads manda directo, pero **expira en 1-2h** → inútil para el funnel |
| `POST /{dataset}/events` con **BISU token (signup, el de Evolution)** | ❌ `subcode 33 / Missing Permission` | El BISU NO llega a un dataset creado a mano |
| Listar `GET /{business}/adspixels` | Apareció `"Snacks Saludables con Sofi - Robert Leduc Event Data"` | El patrón `"<WABA> Event Data"` es **prueba viva** de que un signup CON CAPI auto-creó+conectó el dataset y al BISU de ese número le quedó acceso |
| Asignar dataset a System User por API `POST /{dataset}/assigned_users` (`tasks=["EDIT","UPLOAD"]`) | ✅ `{"success":true}` | Se puede asignar, pero generar el token del system user por API exige app como *business app* del cliente + token admin del cliente → `owned_apps`/`client_apps` vacíos → **NO es cero-touch** |

**Tasks válidos** del dataset (`/assigned_users`): `EDIT, ANALYZE, UPLOAD, ADVERTISE, AA_ANALYZE`.
`UPLOAD` es el que habilita enviar eventos CAPI. (`MANAGE` no es válido.)

**Por qué el BISU funciona en el caso auto-creado y no en el manual:** el BISU (Business
Integration System User token) solo tiene acceso a los assets que Meta le ata **durante** el
Embedded Signup. Un dataset auto-creado por el flujo entra en ese set; uno creado por afuera, no.

---

## Checklist del config "V4"

### A. Crear el config en Meta
`developers.facebook.com` → app de Atlas → **Facebook Login for Business → Configurations → Create configuration**.

- Elegir la variante **multi-producto** (la que deja onboardear WhatsApp + Ads + CAPI en el mismo flujo).
- **Token type:** *System User access token* (Business Integration) — el que ya usa Atlas.

### B. Productos a activar (los 3)
| Producto | Para qué |
|---|---|
| **WhatsApp Business / Cloud API** | onboardea el número → devuelve `phone_number_id` + `waba_id` |
| **Ads that click to WhatsApp (CTWA)** | habilita atribución → el `ctwa_clid` llega en el `referral` del mensaje entrante |
| **Conversions API** ⭐ | auto-crea el dataset `"<WABA> Event Data"`, lo conecta a la WABA y le da `UPLOAD` al BISU |

> Sin **Conversions API** no hay magia cero-touch. Es el único producto que hoy falta en el config de Pastas.

### C. Permisos que pide (y de dónde salen)
| Permiso | Lo trae | ¿Necesario? |
|---|---|---|
| `whatsapp_business_management` | Cloud API | ✅ ya está |
| `whatsapp_business_messaging` | Cloud API | ✅ ya está |
| `ads_management` | CAPI / CTWA | ✅ **da acceso al dataset para mandar eventos** |
| `ads_read` | CTWA | ✅ |
| `business_management` | onboarding de assets | ❌ **NO agregar a mano**. Es Advanced Access → Meta lo restringe ("se restringieron algunos permisos") y NO se concede en el signup. Y NO hace falta: el dataset lo crea Meta, no Atlas. (Verificado: el BISU real no lo trae.) |
| `pages_show_list` | CTWA (page del anuncio) | ✅ |
| `pages_read_engagement` | CTWA | ✅ |
| `pages_manage_ads` | crear anuncios CTWA | ⚠️ **se puede sacar** si Atlas no crea los anuncios (los crea el cliente). Menos permisos = App Review más fácil |

### D. Acceso (esto frenó antes)
- Esos permisos de Ads/Pages arrancan en **Standard Access** → solo funcionan para usuarios **con rol en la app** (admin/dev/tester) en modo **Development**. Probar el signup así primero.
- Para producción (cualquier cliente) → **Advanced Access** vía **App Review + Business Verification**.
  Preparar caso de uso por permiso.

### E. Conectar en Atlas (cero código)
1. Copiar el **`config_id`** nuevo → Atlas **Settings → Meta Apps → app_X → campo "Config ID"**
   (`meta-apps-section.tsx:120`). El launcher ya lo inyecta (`connect-form.tsx:104`).
2. **Re-onboardear** el número bajo el config nuevo (el signup viejo no tiene CAPI).
3. Verificar que apareció `"<WABA> Event Data"` en `GET /{business}/adspixels` y que el **BISU nuevo**
   quedó guardado/encriptado por número.
4. **Re-push del BISU nuevo a Evolution** (`Instance.token`).
5. n8n: POST `Purchase` a **ese** dataset con el `ctwa_clid` real del `referral`.

### Verificación final
Con el BISU nuevo, repetir el POST `/events` (paso de la tabla de evidencia) → tiene que dar
**`events_received:1`** (no `subcode 33`). Ahí está cerrado.

---

## Cómo crear el config V4 — paso a paso (panel de Meta)

> Diagnóstico confirmado en vivo (2026-06-25): el config actual `1089619143509334` **concede los
> permisos de Ads pero NO provisiona el dataset**. Dos signups (WABA existente y WABA nueva con página +
> cuenta de ads seleccionadas) → ninguno auto-creó dataset. **No es un permiso faltante** (agregar
> `business_management` NO lo arregla) — es que el config **no declara el producto Conversions API**.

**Panel:** developers.facebook.com → app **Atlas** (`2044825146471374`) → menú izquierdo
**"Facebook Login for Business"** → pestaña **"Configurations"**.

### Camino A — "Create from template" (el más rápido)
Buscar el preset **"Conversions API Partner Integration"** / WhatsApp. Si aparece, elegirlo: viene con
los productos y permisos correctos. Nombre → guardar → sale el `config_id`.

### Camino B — "Create configuration" (manual)
1. **Name:** ej. `Atlas WA V4 + CAPI`.
2. **Token type / "Who can use":** **System User access token** (Business Integration). NO "User token".
3. **Assets:** **WhatsApp accounts** (WhatsApp Business Account).
4. **Productos a onboardear (EL PASO QUE FALTA):** activar **Ads that click-to-WhatsApp** + **Conversions
   API** (+ opcional **Marketing Messages Lite**), además de WhatsApp Cloud API. Este bloque de productos
   adicionales es lo que dispara que Meta cree y conecte el dataset.
5. **Permisos:** dejar los que vienen atados a esos productos (`whatsapp_business_*`, `ads_management`,
   `ads_read`, `pages_*`). **NO agregar `business_management`** (restringido + innecesario, ver tabla C).
6. **Guardar** → **`config_id` nuevo**.

### Después
- Atlas → Settings → Meta Apps → **app_1** → pegar el `config_id` nuevo (reemplaza `1089619143509334`).
  Atlas ya lo inyecta en el signup (`connect-form.tsx:104`), sin tocar código.
- Signup de prueba → verificar que aparezca `"<page> Event Data"` en los datasets del business.

### Si con el config V4 IGUAL no se crea el dataset
El siguiente lever es el código del launcher: hoy manda `extras: { setup: {}, sessionInfoVersion: "3" }`
(`connect-form.tsx:107`). En V4 puede requerir un **`featureType`** en `extras` para pedir explícitamente
el onboarding de CTWA + CAPI. Verificar en vivo (signup de prueba → ¿aparece el dataset?); si no, tocar
ese `extras`.

### Bonus: webhook `automatic_events`
Meta analiza con NLP el hilo del chat que vino de un anuncio CTWA y, si detecta lead/compra, dispara un
webhook **`automatic_events`** avisando qué evento reportar. Parte de la detección de conversión la da
Meta. Sumar al funnel cuando el config esté.

---

## Payload del evento (referencia)

```
POST https://graph.facebook.com/v21.0/{DATASET_ID}/events?access_token={BISU}
Content-Type: application/json

{"data":[{
  "event_name":"Purchase",
  "event_time": <unix_now>,
  "action_source":"business_messaging",
  "messaging_channel":"whatsapp",
  "user_data":{
    "whatsapp_business_account_id":"<WABA_ID>",
    "ctwa_clid":"<del referral del mensaje entrante>"
  },
  "custom_data":{"currency":"ARS","value":<monto>}
}]}
```

- `action_source: "business_messaging"` + `messaging_channel: "whatsapp"` son obligatorios.
- El `ctwa_clid` real llega en el objeto `referral` del mensaje entrante cuando el lead vino de un anuncio CTWA. Sin CTWA real no hay atribución (con `"TEST"` Meta acepta el evento pero no atribuye).

---

## Para el re-onboarding masivo (los ~29 números restantes)

- Mismo config nuevo para todos. Por cada número: re-hacer Embedded Signup → verificar
  `"<WABA> Event Data"` creado → confirmar BISU encriptado → re-push a Evolution → smoke test del POST `/events`.
- Mientras el config esté en **Standard Access**, el signup solo lo puede completar un usuario con rol
  en la app. Para que lo hagan los clientes solos hace falta **Advanced Access (App Review + Business Verification)**.
- NO crear datasets a mano para ninguno. Si en un número el dataset no se auto-creó, el config no tenía
  CAPI activado en ese momento → revisar el config, no parchear con datasets manuales.
