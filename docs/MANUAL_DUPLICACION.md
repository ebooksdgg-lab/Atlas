# Manual de duplicación — Clonar el funnel a un producto nuevo

> **Objetivo:** levantar un producto nuevo (ej. `sibo`) clonando el funnel de Pastas, sin
> romper Pastas. Es una **checklist accionable en orden**. Asume que ya leíste
> `MANUAL_FUNCIONAMIENTO.md`.
>
> **Convención:** en toda esta guía, `<slug>` = el slug del producto nuevo (minúscula, sin
> espacios, ej. `sibo`). Donde Pastas usa `pastas`, vos ponés `<slug>`.

---

## 0. Antes de empezar — entendé los 3 tipos de "arranque"

Cómo se inicia cada bot determina qué tenés que cambiar:

| Tipo de arranque | Bots | Qué implica al clonar |
|---|---|---|
| **Por nombre dinámico (slug)** en n8n | `envio-<slug>` (timer-2h), `fu-<slug>` (fu-next) | Alcanza con que el bot clonado tenga el **publicId correcto** (`envio-<slug>`, `fu-<slug>`). **No tocás n8n.** |
| **Por nombre fijo** en n8n | `envio-datos-de-pago` (Arrancar Auto 2), `envio-de-producto` (Captura de email) | n8n los llama por nombre **hardcodeado** ⇒ tenés que **parametrizar esos 2 code nodes por slug** (paso 6). |
| **Por Typebot-link** (cuid interno) | INICIO→Contraentrega, INICIO→Recepción email, INICIO→Comprobante Falso, Contraentrega→datos, envio-`<slug>`→datos, Recepción email→producto | Al duplicar, los links apuntan al cuid **viejo** ⇒ hay que **re-apuntarlos** a los bots clonados (paso 4). |
| **Binding de Evolution** (`triggerType=all`) + re-arranque del comprobante (`typebot/find` dinámico) | INICIO | Bindear el INICIO clonado a la instancia nueva (paso 8). El re-arranque del comprobante ya es dinámico (usa `typebot/find` de la instancia). |

> ⚠️ **Caveat de estado compartido entre productos.** Las labels `comprador`, `lead`, `valoro`,
> `si-contrib`, `no-dispuesta`, `entregado` son **genéricas** (no llevan slug). Si el **mismo
> número de WhatsApp** entra a dos productos, el estado se "contagia" (un `comprador` de Pastas
> sería frenado por el INICIO del producto nuevo). Hoy se asume **un número/instancia por
> producto**. Si necesitás que el mismo contacto compre varios productos, hay que migrar a
> labels `comprador-<slug>` (lo que prevé `CONTRATO_LABELS.md`) — eso es trabajo aparte, no
> está en esta checklist.

---

## 1. Definir el slug y juntar los assets product-specific

- [ ] **Slug:** `<slug>` (ej. `sibo`).
- [ ] **Número de WhatsApp** nuevo (Meta Cloud API: token, `phoneNumberId`, `businessId`).
- [ ] **PDFs del producto:** el principal y los bonos (archivos finales).
- [ ] **Carpeta de Google Drive** con el producto (para el `link_producto`).
- [ ] **Copys y media nuevos:** pitch, audios e imágenes de cada bot (son específicos del producto).
- [ ] **Precios:** principal y downsell (hoy `$5.990` y `$3.990` hardcodeados en Pastas).
- [ ] **Cuentas de alias** del producto (alias + nombre del titular + activo/inactivo).

---

## 2. MinIO — subir los PDFs del producto

- [ ] Subir al bucket `typebot`, prefijo **`productos-pdf/<slug>/`**.
- [ ] Respetar la convención de nombres:
  - `principal*` → el producto principal (se manda **siempre**).
  - `bono*` → cada bono (se manda **solo si `conBonos:true`**, o sea camino `valoro`).
  - El nombre "lindo" que ve el usuario sale de lo que va **después de `__`** en el filename
    (ej. `01__Recetario-SIBO.pdf` → "Recetario SIBO"). Sin `__`, usa el filename completo.
- [ ] Verificar que son públicos a Meta (el bucket `typebot` ya tiene `anonymous=download`).

---

## 3. Typebot — duplicar los bots y fijar publicIds

Duplicá estos bots desde el de Pastas y **publicá** cada uno con su publicId:

| Bot origen (Pastas) | publicId nuevo | ¿Obligatorio el publicId exacto? |
|---|---|---|
| Inicio ROUTER | `inicio-<slug>` | Libre (lo bindeás vos en Evolution). |
| Contraentrega 1 | `contraentrega-<slug>` | Libre (lo referencia el link de INICIO). |
| Envio de datos de pago | `envio-datos-<slug>` | **Sí** si parametrizás n8n por slug (paso 6). |
| Envio sin Bonos | **`envio-<slug>`** | **Sí, exacto** — n8n lo arranca como `"envio-" + slug`. |
| FU-Pastas | **`fu-<slug>`** | **Sí, exacto** — n8n lo arranca como `"fu-" + slug`. |
| Recepcion email | `recepcion-email-<slug>` | Libre (lo referencia el link de INICIO). |
| Envio de producto | `envio-de-producto-<slug>` | **Sí** si parametrizás n8n por slug (paso 6). |
| Comprobante Falso | — | **Se puede compartir** (no tiene variables ni slug). |

> Si preferís **no** tocar n8n, podés dejar `envio-datos-de-pago` y `envio-de-producto`
> **compartidos** entre productos — pero solo sirve si el contenido (audios, copy, bonos) es
> idéntico entre productos. Como casi nunca lo es, lo recomendado es clonarlos y parametrizar
> n8n (paso 6).

---

## 4. Typebot — re-apuntar todos los Typebot-link

Al duplicar, los bloques **Typebot-link** siguen apuntando al cuid de los bots de Pastas.
Re-apuntá cada uno a su equivalente clonado:

- [ ] **INICIO** (`inicio-<slug>`):
  - "Secuencia Contraentrega" → `contraentrega-<slug>`.
  - "Envío Prod" → `recepcion-email-<slug>`.
  - "Comp Falso" → Comprobante Falso (compartido o clonado).
- [ ] **Contraentrega** (`contraentrega-<slug>`): "Envio datos de pago" → `envio-datos-<slug>`.
- [ ] **Envío sin Bonos** (`envio-<slug>`): "Envio datos de pago" → `envio-datos-<slug>`.
- [ ] **Recepción email** (`recepcion-email-<slug>`): "Group #6" → `envio-de-producto-<slug>`.

---

## 5. Typebot — cambiar lo hardcodeado dentro de los bots

- [ ] **slug en los webhooks.** En CADA bloque webhook que llama a n8n, cambiá `"slug":"pastas"` → `"slug":"<slug>"`. Aparece en:
  - INICIO: (no manda slug por webhook, lo setea en código — ver abajo).
  - Contraentrega: `enviar-productos`, `timer-2h`.
  - Envío de datos: `enviar-productos`, `asignar-alias`, `fu-next`.
  - Envío sin Bonos (`envio-<slug>`): `enviar-productos`, `fu-next`.
  - FU (`fu-<slug>`): `asignar-alias`.
  - Recepción email: `timer-entrega` (no usa slug, pero verificá `link_producto`).
- [ ] **slug en el código de INICIO.** En el bloque **"Set Labels en ESTADO"**, cambiá
  `const slug = "pastas";` → `const slug = "<slug>";`. Esto hace que se marque
  `producto-<slug>` automáticamente.
- [ ] **link del producto.** En INICIO bloque **"Set Link Producto"**, cambiá la URL de Drive
  por la carpeta del producto nuevo.
- [ ] **Precios.** En los bloques `Set variable` de precio (`Precio Temporal` = `$5.990`,
  `precio temporal`/downsell = `$3.990`) poné los del producto nuevo. Están en Contraentrega,
  Envío sin Bonos y FU.
- [ ] **Copys, audios e imágenes.** Reemplazá todo el contenido específico de Pastas (pitch,
  audios, imágenes, textos de bonos). Los audios/imágenes se re-suben en cada bot (quedan en
  MinIO bajo los blocks del typebot clonado).
- [ ] **Verificación de variables (no romper los fixes).** Confirmá que cada bot clonado
  **define** las variables que usa, en especial:
  - `envio-de-producto-<slug>` debe declarar `remoteJid` **e** `instanceName` (fix H2).
  - `recepcion-email-<slug>` el código de captura debe leer `{{email}}` (fix H3), no `{{email_raw}}`.

> El **token de Chatwoot** (`api_access_token`) está embebido dentro del código de los bloques
> de Typebot. Si rotás keys (pendiente aparte), hay que actualizarlo acá también.

---

## 6. n8n — parametrizar los 2 arranques por nombre fijo

Solo si clonaste `envio-datos-<slug>` y `envio-de-producto-<slug>` (recomendado):

- [ ] **Workflow "Recepcion Comprobante", nodo "Arrancar Auto 2":** cambiá
  `typebot: "envio-datos-de-pago"` por `typebot: "envio-datos-" + slug` (y asegurate de que
  `slug` llegue en el payload del Router de botón).
- [ ] **Workflow "Captura de email", nodo Code:** cambiá `typebot: "envio-de-producto"` por
  `typebot: "envio-de-producto-" + slug` (y que `slug` viaje en el body de `timer-entrega`;
  hoy Recepción email manda `timer-entrega` sin slug → **agregar `slug`** a ese webhook).

> Los workflows `Timer 2h` (`"envio-" + slug`) y `Envío de Follow Ups` (`"fu-" + slug`) **ya
> son dinámicos** — no se tocan, solo dependen de que existan `envio-<slug>` y `fu-<slug>`.

---

## 7. n8n — pool de alias del producto

- [ ] En **"Envio de Alias"** (`asignar-alias`), agregá la entrada del producto al objeto `POOL`:
  ```js
  const POOL = {
    pastas: [ ... ],
    <slug>: [
      { alias: "Alias.uno", nombre: "Esta es una cuenta a nombre de ...", activo: true },
      // ...
    ],
  };
  ```
- [ ] Si **no** agregás `<slug>`, el código cae al fallback `POOL.pastas` ⇒ usaría los alias de
  Pastas. **Agregalo explícitamente** para no mezclar cobranzas.

---

## 8. Evolution + Chatwoot — instancia e inbox del producto

- [ ] Crear la **instancia** de Evolution para el número nuevo (integración `WHATSAPP-BUSINESS`,
  con el token/`businessId` de Meta).
- [ ] Configurar el **webhook** de la instancia → `https://n8n.ebooksdgg.lat/webhook/atlas-inbound-media`,
  evento `MESSAGES_UPSERT`, `enabled:true`.
  - ⚠️ **base64 del comprobante:** la instancia de Pastas tiene `webhookBase64:false`. El OCR
    depende de `data.message.base64`. Antes de dar por buena la instancia nueva, **probá un
    comprobante real** y confirmá que el nodo "Guard media" lo deja pasar; si no, activá el
    envío de base64 en el webhook de la instancia.
- [ ] Configurar la integración **Chatwoot** de la instancia (cuenta `1` o el inbox que
  corresponda; `nameInbox` del producto).
- [ ] **Bindear el Typebot** INICIO clonado a la instancia: `typebot/create` con
  `typebot: "inicio-<slug>"`, `url: http://typebot-viewer:3000`, `triggerType: "all"`.
  - No crees bindings extra para los demás bots (se arrancan por `/typebot/start`).

---

## 9. Labels — qué aparece solo y qué no

- [ ] `producto-<slug>` aparece **automáticamente** al setear `const slug` en INICIO (paso 5).
- [ ] Las demás labels (`lead`, `valoro`, `si-contrib`, `no-dispuesta`, `comprador`,
  `entregado`, `comprobante-falso`) son **genéricas** y ya existen — no se crean por producto.
  (Releé el caveat de §0 sobre estado compartido si el mismo número toca dos productos.)

---

## 10. Checklist final de humo (probar antes de anunciar)

Mandando WhatsApp reales al número nuevo:

- [ ] **Lead nuevo** → INICIO marca `lead` + `producto-<slug>` → arranca Contraentrega (pitch + botones).
- [ ] **"Sí, valoro tu ayuda"** → marca `valoro` → llegan principal **+ bonos** + alias correcto del pool `<slug>` → arranca cascada FU.
- [ ] **"No estoy dispuesta"** → marca `no-dispuesta` → llega principal sin bonos → reflote → **"Sí, por supuesto"** marca `si-contrib` (saca `no-dispuesta`) + datos.
- [ ] **No-tap (esperar 2 h o forzar)** → `envio-<slug>` → llega producto sin bonos + recibe **solo FU2**.
- [ ] **Comprobante válido (imagen)** → `comprador` → pide email → guarda email en Chatwoot → entrega `link_producto` → marca `entregado` → **se dispara facturación**.
- [ ] **Comprobante en PDF** → se aprueba directo (comportamiento conocido, sin OCR).
- [ ] **Comprobante inválido** → marca `comprobante-falso` → mensaje "reenvialo".
- [ ] **Re-entrada de un `comprador`** → INICIO no responde (stop).
- [ ] **FU** → respetan delays 2/3/3 y ventana 8–22 (fuera de hora se reprograman, no se saltean).

---

## 11. Resumen de TODO lo product-specific (la lista corta)

| Qué | Dónde |
|---|---|
| `slug` | Webhooks de Typebot + `const slug` en INICIO + (n8n si parametrizás) + key del POOL de alias |
| PDFs del producto | MinIO `productos-pdf/<slug>/` (`principal*`, `bono*`) |
| `link_producto` (Drive) | INICIO → "Set Link Producto" |
| Bots clonados + publicIds | Typebot (`inicio/contraentrega/envio-datos/envio/fu/recepcion-email/envio-de-producto`-`<slug>`) |
| Re-apuntar Typebot-links | INICIO, Contraentrega, Envío sin Bonos, Recepción email |
| Precios | `Set variable` de precio en Contraentrega / Envío sin Bonos / FU |
| Copys, audios, imágenes | Cada bot clonado |
| Pool de alias | n8n "Envio de Alias" → `POOL["<slug>"]` |
| Arranques por nombre fijo | n8n "Arrancar Auto 2" y "Captura de email" (parametrizar por slug) |
| Instancia + número Meta | Evolution (token/businessId) |
| Webhook + base64 | Evolution (instancia → `atlas-inbound-media`, verificar base64) |
| Inbox Chatwoot | Integración Chatwoot de la instancia |
| Binding INICIO | Evolution `typebot/create` `inicio-<slug>` `triggerType=all` |
