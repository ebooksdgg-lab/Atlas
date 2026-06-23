# Manual de funcionamiento — Funnel de WhatsApp (producto Pastas)

> **Para quién es esto:** cualquiera del equipo que tenga que entender, operar o debuggear
> el funnel sin haberlo construido. Refleja el estado **real y ya corregido** del sistema
> (post-auditoría de 2026-06-22).
>
> **Nota sobre `CONTRATO_LABELS.md`:** ese documento es un contrato **aspiracional** (multi-tenant,
> tablas `secuencias`/`cola`, labels `comprador-<slug>`/`humano`/`unsubscribe`). El sistema
> **realmente desplegado hoy** es el que describe ESTE manual. Donde difieran, manda este.

---

## 1. Arquitectura en una frase

```
WhatsApp (Meta Cloud API)
   → Evolution API  (gateway; instancia por número)
       → Typebot     (bots de conversación: pitch, datos, follow-ups, entrega)
       → n8n         (orquestación: timers, OCR, alias, envío de PDFs, facturación)
       → Chatwoot    (CRM + LABELS = fuente de verdad del estado, a nivel CONTACTO)
       → MinIO       (archivos: PDFs de producto + media de los bots)
```

**Regla de oro del estado:** Typebot **escribe** labels en el contacto de Chatwoot; n8n las
**lee** antes de cada envío (gates). El estado vive en el **contacto** (no en la conversación),
porque las conversaciones se purgan a las 24 h y las labels del contacto sobreviven.

### Componentes desplegados

| Componente | Dónde | Notas |
|---|---|---|
| Evolution API | `atlas-evolution-api-1` (imagen `atlas-evolution:2.2.3-atlas2`) | Patch no-refire + media. Instancia activa: **Natacha** `atlas-14022681586`, inbox *"Las Pastas de la Abuela — PASTAS"*. 2ª instancia `atlas-17252588682` está inerte (sin bot ni webhook). |
| Typebot | `atlas-typebot-builder-1` / `atlas-typebot-viewer-1`; DB `typebot` en `atlas-postgres-1` | El viewer corre la versión **publicada** (`PublicTypebot`). |
| n8n | `root_infra-n8n-1`; DB en `root_infra-postgres-1` | Workflows del funnel en la carpeta *Typebot* + *Recepción Comprobante* (carpeta Comprobantes). |
| Chatwoot | `atlas-chatwoot-rails-1` / `-sidekiq-1`; DB `chatwoot` | Cuenta `1`. API base `https://chatwoot.ebooksdgg.lat/api/v1/accounts/1`. |
| MinIO | `atlas-minio-1` → `https://s3.ebooksdgg.lat`, bucket `typebot` | PDFs en `productos-pdf/<slug>/`; media de bots en `public/workspaces/.../blocks/...`. |

---

## 2. Los bots de Typebot (8)

| Bot | publicId | Qué hace | Cómo se arranca |
|---|---|---|---|
| **Inicio ROUTER** | `inicio-test-zm1i9og` | Entra **todo** mensaje. Router/guard: lee estado del contacto, marca `lead`+`producto-pastas`, y deriva al funnel, a entrega (comprobante OK) o al mensaje de comprobante falso. | Binding de Evolution (`triggerType=all`) **y** lo re-arranca n8n al recibir un comprobante (con `resultado=valido/falso`). |
| **Contraentrega 1** | `contraentrega-ilblkhf` | Pitch (audio + imágenes) + botones **"Sí, valoro tu ayuda" / "No estoy dispuesta"**. Arranca el timer-2h. | Typebot-link desde INICIO. |
| **Envio de datos de pago** | `envio-datos-de-pago` | Según `con_bonos`: rama **con bonos** (label `valoro` + envía principal+bonos) o rama **si-contrib** (label `si-contrib`, saca `no-dispuesta`). Pide alias y manda datos de pago. Dispara la cascada de FU. | Typebot-link (desde Contraentrega / Envío sin Bonos) **y** n8n "Arrancar Auto 2". |
| **Envio sin Bonos** | `envio-pastas` | Envío del **no-tap** (a las 2 h sin tocar botón): manda el producto SIN bonos + pregunta de contribución con botón **"Sí, por supuesto"**. | n8n Timer 2h (`/typebot/start` con nombre `envio-<slug>`). |
| **FU-Pastas** | `fu-pastas` | Follow-ups. Según `step` (1/2/3) manda recordatorio, downsell o "¿seguís ahí?". | n8n fu-next (`/typebot/start` con nombre `fu-<slug>`). |
| **Recepcion email** | `recepcion-comprobante-nhsxfg8` | Tras comprobante válido: pide y captura el email del comprador (lo guarda en Chatwoot) y dispara la entrega. | Typebot-link desde INICIO (rama "Envío Prod"). |
| **Envio de producto** | `envio-de-producto` | Entrega el **link del producto** (carpeta Drive) y marca `entregado`. | n8n Captura de email (`/typebot/start`) y Typebot-link desde Recepción email. |
| **Comprobante Falso** | `comprobante-falso-p5ohasv` | Mensaje "no detectamos un comprobante, reenvialo". | Typebot-link desde INICIO (rama comprobante falso). |

> Hay 5 bindings de Typebot en Natacha; solo **inicio-test** tiene `triggerType=all`. Los otros
> 4 (`envio-pastas`, `fu-pastas`, `envio-datos-de-pago`, `envio-de-producto`) están con
> `trigger=null` (no auto-disparan; se usan vía `/typebot/start`).

---

## 3. Los workflows de n8n (funnel)

| Workflow | Webhook (path) | Qué hace |
|---|---|---|
| **Recepcion Comprobante** | `atlas-inbound-media` | Recibe **todos** los inbound de Natacha. Dos ramas: (1) OCR de comprobante → válido/falso; (2) Router de botón → arranca Auto 2. Incluye **Facturar**. |
| **Timer 2h** | `timer-2h` | Espera 2 h y, si el contacto **sigue siendo solo lead**, arranca `envio-<slug>` (camino no-tap). |
| **Envio de Follow Ups** | `fu-next` | Manda los FU según `step`, encadena el siguiente y respeta la ventana horaria. |
| **Captura de email** | `timer-entrega` | Espera 15 min y, si no está `entregado`, arranca `envio-de-producto`. |
| **Envio de PDFs** | `enviar-productos` | Lista MinIO `productos-pdf/<slug>/` y manda los PDFs (principal siempre; bonos si `conBonos`). |
| **Envio de Alias** | `asignar-alias` | Pool de alias con rotación **sticky** por contacto (round-robin sobre cuentas activas). |
| **Add Chatwoot Label** | `atlas-add-label` | Utilitario para agregar labels a una conversación (helper). |

---

## 4. Las LABELS (estado real del sistema)

Todas a **nivel contacto** en Chatwoot (espejadas a la conversación abierta para que se vean en la UI).

| Label | La pone | Cuándo | Frena / efecto |
|---|---|---|---|
| `lead` | INICIO | Primer mensaje de un contacto nuevo | No frena. Marca "está en el funnel". |
| `producto-pastas` | INICIO | Al entrar al funnel (`producto-<slug>`) | No frena. En qué producto está. |
| `valoro` | Envío de datos (rama con bonos) | Tocó **"Sí, valoro tu ayuda"** | Frena timer-2h. Define `fullCascade` (FU 1+2+3). |
| `si-contrib` | Envío de datos (rama reflote) | Tocó **"Sí, por supuesto"** (y saca `no-dispuesta`) | Frena timer-2h. Define `fullCascade`. |
| `no-dispuesta` | Contraentrega | Tocó **"No estoy dispuesta"** | Frena timer-2h y FU. **Ya NO frena la entrega** (corregido: ver §8 M1). |
| `comprador` | INICIO | Comprobante **válido** | **Stop total** en INICIO + gates de FU/timer/entrega. |
| `entregado` | Envío de producto | Tras entregar el link | Gate de timer-entrega y timer-2h (evita re-entrega). |
| `comprobante-falso` | n8n (Label falso) | OCR inválido | Informativo (hoy no gatea nada). |

---

## 5. Variables que viaja cada bot

Patrón: todo bot arrancado por `/typebot/start` recibe `remoteJid`, `instanceName`, `pushName`
+ la variable específica. Quien arranca por **Typebot-link** hereda las variables ya seteadas
(por eso INICIO hace `Setear ID`/`Setear instancia`).

| Bot | Recibe | Variable propia |
|---|---|---|
| INICIO | `remoteJid`, `instanceName`, `pushName` (prefilled por Evolution) | `resultado` (lo manda n8n en el re-arranque del comprobante) |
| Contraentrega | hereda de INICIO | `con_bonos` (lo setea al tocar "valoro") |
| Envío de datos | hereda / `con_bonos` (n8n) | `alias`, `Nombre de Cuenta` (del webhook alias) |
| Envío sin Bonos (`envio-pastas`) | `slug`, `remoteJid`, `instanceName`, `pushName` | — |
| FU-Pastas | `step`, `remoteJid`, `instanceName`, `pushName` | `alias`, `Nombre de Cuenta` (webhook alias) |
| Recepción email | hereda / `remoteJid`, `instanceName`, `link_producto` | `email` (del input) |
| Envío de producto | `link_producto`, `remoteJid`, `instanceName`, `pushName` | `entregado` |

---

## 6. El recorrido de un lead (todos los caminos)

### 6.0 Entrada — INICIO ROUTER (siempre)
Todo mensaje entra acá. Orden de decisión:

1. **Leer estado** (lee labels del contacto) → `comprador` / `no-dispuesta` / `nuevo`.
2. **¿Es comprador?** → si tiene `comprador` ⇒ **STOP** (silencio). *(Tras el fix M1, este gate ya solo mira `comprador`.)*
3. **¿Es comprobante válido?** (`resultado == "valido"`) ⇒ camino **comprador/entrega** (§6.5).
4. **¿Es comprobante falso?** (`resultado == "falso"`) ⇒ setea `resultado=""` y manda al bot **Comprobante Falso** (§6.6).
5. Si nada de lo anterior ⇒ marca `producto-pastas`; **¿Es lead?** (si todavía no tiene `lead`) ⇒ marca `lead` y entra a **Contraentrega** (§6.1). Si ya era `lead`, termina en silencio (la re-activación la hacen los timers/FU).

### 6.1 Pitch — Contraentrega
- Al arrancar, **dispara `timer-2h`** (queda armado el camino no-tap).
- Manda audio + imágenes + pitch y los botones **"Sí, valoro tu ayuda" / "No estoy dispuesta"**.
- Según el botón:
  - **"valoro"** → setea `con_bonos=true` → va a **Envío de datos** rama con bonos (§6.2).
  - **"No estoy dispuesta"** → marca `no-dispuesta` → manda el producto SIN bonos (`enviar-productos conBonos:false`) → pregunta de reflote con **"Sí, por supuesto" / "No, gracias"**:
    - "Sí, por supuesto" → **Envío de datos** rama si-contrib (§6.3).
    - "No, gracias" → "Chau seco" (fin).

### 6.2 Camino **valoro** (dijo que sí de entrada)
Envío de datos → **marca `valoro`** → manda **principal + bonos** (`enviar-productos conBonos:true`) → pide alias (`asignar-alias`) → manda alias + nombre de cuenta → audio "mandame el comprobante" → **dispara `fu-next` step 1** ⇒ cascada **FU1 + FU2 + FU3**.

### 6.3 Camino **si-contrib** (primero dijo que no, después contribuye)
Envío de datos rama reflote → **marca `si-contrib` y saca `no-dispuesta`** → (ya recibió el principal antes, sin bonos) → pide alias → manda alias + datos → **dispara `fu-next` step 1** ⇒ cascada **FU1 + FU2 + FU3**.

### 6.4 Camino **no-tap** (no tocó ningún botón en 2 h)
- `timer-2h` se cumple. Gate: si ya tiene `valoro`/`si-contrib`/`no-dispuesta`/`comprador`/`entregado`, **no hace nada**. Si sigue **solo `lead`** ⇒ arranca **Envío sin Bonos** (`envio-pastas`).
- Envío sin Bonos: lo primero que hace es **disparar `fu-next` con `origen:"notap"`** (ver fix H1) → manda el producto SIN bonos → pregunta de contribución con **"Sí, por supuesto"**.
  - Si toca "Sí, por supuesto" → **Envío de datos** rama si-contrib (§6.3).
  - **FU del no-tap:** `fu-next` con `origen=notap` aplica un gate extra: si el contacto **ya tiene `si-contrib`/`valoro`**, no manda (la cascada lo cubre). Resultado final:
    - **no-tap puro → solo FU2.**
    - **valoro / si-contrib → FU1 + FU2 + FU3.**
  - *(Caso borde aceptado: si toca "Sí, por supuesto" justo después de que ya salió el FU2, puede repetirse ese único mensaje. Decisión de diseño: no se blinda.)*

### 6.5 Camino **comprador** (mandó comprobante válido)
1. El comprobante (imagen o PDF) llega por `atlas-inbound-media` → **Recepción Comprobante**:
   - **Guard media** (deja pasar solo imagen/PDF) → **Gate comprador** (si ya es `comprador`, corta; además resuelve dinámicamente el INICIO de la instancia) → **¿Es PDF?**
     - **PDF** → se aprueba directo (sin OCR — ver §8 M2) → **Typebot ENVIO (valido)** + **Facturar**.
     - **Imagen** → OCR (GPT-4o-mini extrae texto → modelo da veredicto) → **¿Válido?**
       - **Sí** → **Typebot ENVIO (valido)** + **Facturar**.
       - **No** → marca `comprobante-falso` → **Typebot FALSO**.
2. **Typebot ENVIO (valido)** re-arranca **INICIO** con `resultado=valido` → INICIO marca **`comprador`** → manda a **Recepción email**.
3. **Recepción email**: dispara `timer-entrega` (15 min), pide el email, lo captura y **lo guarda en Chatwoot** (`email` + `custom_attributes.email_capturado` — fix H3) → linkea a **Envío de producto**.
4. **Envío de producto** (también lo arranca `timer-entrega` a los 15 min si no está `entregado`): manda el **link del producto** (`link_producto`, carpeta Drive) y **marca `entregado`** (fix H2: ahora declara `remoteJid`/`instanceName`, así el label sí se setea).

### 6.6 Camino **comprobante falso**
**Typebot FALSO** re-arranca INICIO con `resultado=falso` → INICIO **setea `resultado=""`** (fix bonus, evita re-mandar el mensaje en re-escrituras) → manda al bot **Comprobante Falso** → "no detectamos un comprobante, reenvialo".

---

## 7. Entrega, facturación, alias

### Entrega de productos — **dos mecanismos**
1. **Durante el funnel (gratis):** `enviar-productos` lista MinIO `productos-pdf/<slug>/` y manda los PDFs por WhatsApp. Convención de archivos: `principal*` (siempre) y `bono*` (solo si `conBonos:true`). El nombre "lindo" sale de lo que va después de `__` en el filename.
2. **Post-comprobante:** `envio-de-producto` manda el `link_producto` (carpeta de Google Drive, definida en INICIO "Set Link Producto").

### Alias de pago (`asignar-alias`)
- Pool por `slug` (hoy `pastas`): 5 cuentas (3 a nombre de *Marcelo Gabriel Aguero*, 2 de *Luciano Andrés Romero*).
- **Sticky:** una vez asignado un alias a un contacto, se congela (guardado en `custom_attributes.alias_asignado` / `nombre_asignado`). Si esa cuenta se desactiva (`activo:false`), se reasigna por round-robin sobre las activas.

### Facturación (`Facturar` — ya conectado, fix M3)
Tras un comprobante válido, **Facturar** manda el texto OCR + el `Facturador` (dueño de la cuenta de alias, de `custom_attributes.nombre_asignado`) a `/webhook/recibirdatos` → workflow **Facturas Automatización** (AFIP Factura C, PDF por Gotenberg, sube a MinIO, registra en postgres). *(Ese workflow está fuera del alcance del funnel pero es el destino de la facturación.)*

---

## 8. Timers, ventanas y decisiones de diseño

### Timers / ventanas
| Mecanismo | Cuándo | Detalle |
|---|---|---|
| **timer-2h** | 2 h después de arrancar Contraentrega | Si sigue solo `lead` ⇒ camino no-tap. |
| **FU (fu-next)** | FU1 a las **2 h**, FU2 a las **+3 h**, FU3 a las **+3 h** | El 1er Wait respeta `delayH` (fix L2: `={{ $json.body.delayH \|\| 2 }}`). |
| **Ventana horaria** | 08:00–22:00 (America/Argentina/Buenos_Aires) | Fuera de ventana, el FU se **reprograma** (no se saltea). |
| **timer-entrega** | 15 min después de Recepción email | Si no está `entregado` ⇒ arranca Envío de producto. |
| **Wait 20 s** | Router de botón antes de "Arrancar Auto 2" | Ventana de idempotencia (ver M4). |

### Decisiones de diseño documentadas (NO son bugs)
- **M2 — PDF auto-aceptado sin OCR:** un comprobante en **PDF se aprueba directo**, sin pasar por OCR. Comportamiento conocido e intencional por ahora; a revisar a futuro.
- **M4 — Idempotencia por ventana de 20 s:** al tocar un botón, el flujo lo resuelve por dos vías (el Jump/link de Typebot y el Router de n8n). n8n espera 20 s y **skipea si Typebot ya puso el label**. Suficiente para el volumen actual.
- **M5 — Match literal del texto del botón:** el Router de n8n compara el `displayText` exacto (`"Sí, valoro tu ayuda"` / `"Sí, por supuesto"`). Si se cambia el copy del botón, hay que actualizar el MAP del Router. Aceptado como diseño.

### Pendientes anotados (no implementados aún)
- Rotar las keys hardcodeadas (Evolution + token Chatwoot + token Meta) y moverlas a env/credenciales.
- Limpieza de email con regex en n8n antes de guardarlo en Chatwoot.

---

## 9. Glosario rápido de "quién dispara qué"

```
Inbound ─▶ Evolution ─▶ atlas-inbound-media (n8n) ──┬─▶ OCR/PDF ─▶ Typebot ENVIO valido/falso ─▶ INICIO(resultado)
                                                    └─▶ Router botón ─(20s)─▶ Arrancar Auto 2 ─▶ envio-datos-de-pago
Inbound ─▶ Evolution ─▶ INICIO (trigger all) ─▶ Contraentrega ─▶ (botón) ─▶ envio-datos-de-pago ─▶ fu-next(step1)
                                              └─▶ timer-2h ─(2h, si solo lead)─▶ envio-pastas ─▶ fu-next(notap)
Comprobante OK ─▶ INICIO(comprador) ─▶ Recepción email ─▶ timer-entrega ─(15m)─▶ envio-de-producto ─▶ entregado
```
