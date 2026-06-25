# Conversions API (CAPI) para WhatsApp + Embedded Signup config "V4"

> Cómo lograr que el dataset de Conversions API se **auto-cree y auto-conecte** durante
> el Embedded Signup (estilo ManyChat), para mandar eventos `Purchase` atribuidos a
> anuncios Click-to-WhatsApp (CTWA) con el **mismo token del signup** (BISU), sin pasos
> manuales por número.
>
> Derivar esto costó días de pruebas contra la Graph API. Este doc es la fuente de verdad.
> Última validación: 2026-06-24.

---

## TL;DR

- El único camino **cero-touch** es un **config del Embedded Signup con el producto
  Conversions API activado**. Eso hace que Meta auto-cree el dataset `"<WABA> Event Data"`,
  lo conecte a la WABA, y le dé `UPLOAD` automático al **BISU token** que devuelve el signup.
- **NO** crear datasets a mano: el BISU no llega a un dataset que no se ató durante el signup
  (da `subcode 33 / Missing Permission`).
- **NO** confundir la **versión del Graph API** (`v21.0` → `v24.0`, el número del URL) con la
  **generación del config del Embedded Signup** ("V4"). Son cosas distintas (ver más abajo).

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
| `business_management` | onboarding de assets | ✅ |
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
