# Atlas — Contrato de Labels y Atributos

> **Qué es esto:** el modelo de estado único que comparten Typebot (escribe) y n8n (lee).
> El estado vive **a nivel de CONTACTO en Chatwoot** (no en la conversación), porque
> las conversaciones se purgan a las 24h y las labels del contacto sobreviven.
> Esto es la fuente de verdad. Si Typebot y n8n no coinciden con esto, hay un bug.

---

## 1. LABELS (Chatwoot, a nivel contacto — slug en minúscula)

| Label | Significado | La pone | Cuándo | Frena secuencias? |
|---|---|---|---|---|
| `lead` | Contacto nuevo que entró por un mensaje entrante | Typebot (INICIO) | Al detectar primer mensaje | No |
| `producto-<slug>` | En qué producto está (`producto-pastas`, `producto-sibo`, …). Puede tener varios | Typebot | Al entrar al funnel de ese producto | No |
| `comprador` | Es cliente (compró *algo*). Para retención forever + broadcasts | n8n | Primera compra verificada | No (genérico) |
| `comprador-<slug>` | Compró *ese* producto/upsell puntual (`comprador-pastas`, `comprador-protocolo`) | n8n | Compra verificada de ese producto | **Sí (stop de la secuencia de ese producto)** |
| `comprobante-falso` | OCR dio inválido | n8n | OCR inválido | No (dispara re-pedido) |
| `no-contribuye` | Dijo que no contribuye | Typebot | Botón "No estoy dispuesta" | No |
| `humano` | Pasado a agente humano (bot en pausa) | Chatwoot→n8n / agente | Handoff | **Sí (pausa bot)** |
| `unsubscribe` | Opt-out total | Typebot / n8n | Pidió baja | **Sí (stop todo)** |

**Stops por secuencia** = cada secuencia define su propio stop (`label_stop` en la config,
normalmente `comprador-<slug>`). **Stops globales** = `humano` y `unsubscribe` frenan
TODAS las secuencias sin importar producto. Se chequea **leyendo Chatwoot por API antes
de cada envío**.

---

## 2. ATRIBUTOS (Chatwoot custom attributes — a nivel contacto)

| Key | Tipo | Significado | Escribe | Lee |
|---|---|---|---|---|
| `precio` | número | Precio del producto para este contacto | Typebot / config | Typebot (pitch) |
| `precio_downsell` | número | Precio del downsell | Typebot / config | Typebot |
| `email` | texto | Email capturado (paso Envío de Producto) | Typebot | n8n (entrega, Brevo) |
| `comprobante_pago` | texto (URL/ref) | Referencia a la imagen/PDF del comprobante | Typebot | n8n (OCR) |

---

## 3. Flujo de estado (quién escribe, quién lee)

```
Inbound (Evolution)
   → Typebot (flujo síncrono: INICIO router → funnel)
        · escribe labels/atributos en el CONTACTO de Chatwoot
        · comprobante: HTTP síncrono a n8n → {valido:true/false} → ramifica inline
   → n8n (async: drips, entrega, CAPI, purgas)
        · LEE labels/atributos del contacto (vía Chatwoot API)
        · respeta stop-labels antes de cualquier envío
```

- **Typebot escribe, n8n lee.** Si ambos necesitan el mismo dato, vive en el contacto.
- **Retención:** conversaciones se purgan >24h; el estado (labels/atributos) queda en el
  contacto. Leads se purgan >7d; compradores quedan para siempre.

---

## 4. Mapeo ManyChat → Atlas (para la migración)

| ManyChat (viejo) | Atlas (nuevo) |
|---|---|
| Tag "Secuencia Normal" (GOTO) | Arrows de Typebot + cola en n8n (no es label) |
| Tag "Contraentrega" (GOTO) | Arrow de Typebot al flujo Contraentrega |
| Tag "Cliente Meta" (GOTO) | Webhook directo de CAPI (no es label) |
| Tag "Comprobante OK" | Label `comprador` |
| Tag "Comprobante Falso" | Label `comprobante-falso` |
| Campo email | Atributo `email` |

Los **GOTO-tags de ManyChat NO se traducen a labels** — eran control de flujo, y eso
ahora son las flechas de Typebot o un webhook directo. Solo se vuelven label los estados
que tienen que **sobrevivir** y ser leídos por n8n después.

---

## 5. Multi-tenant (desde el día 0, aunque arranquemos single-tenant)

- Cada contacto vive bajo un **tenant** (cuenta de Chatwoot del tenant + `tenant_id`).
- Los **slugs de label son iguales entre tenants**; la separación es por cuenta/`tenant_id`.
- Webhooks **por tenant**: `/<tenant_id>/comprobante`, `/<tenant_id>/capi`, etc.
- Jere = otro tenant sobre las mismas instancias, con su propia cuenta de Chatwoot y sus
  webhooks apuntando a SU n8n.

---

## 6. Extensibilidad — upsells, cross-sells y secuencias nuevas

> **Regla de oro:** si te encontrás creando una label por cada *paso* de una secuencia,
> pará. El paso y la pertenencia a la secuencia van en la tabla `cola`, NO en labels.
> Las labels son solo para **estado durable que gatea** comportamiento.

**Qué NO requiere labels nuevas:**
- Sumar pasos a una secuencia → filas en `secuencias` (config).
- Que un contacto esté en una secuencia y en qué paso → fila en `cola`.
- El motor lee la config fresca en cada paso, así que editás secuencias en vivo.

**Qué SÍ suma labels (todas por convención, sin código nuevo):**
- Producto/upsell nuevo → `producto-<slug>` y `comprador-<slug>`.

### Receta: agregar un upsell (ej. "Protocolo Antiinflamatorio")

1. **Slug:** `protocolo`.
2. **Config en `secuencias`:** filas `(tenant_id, producto='protocolo', paso, delay,
   texto, media, label_stop='comprador-protocolo')`.
3. **Trigger de enrollment:** cuando n8n ve que se setea `comprador-pastas` (compró la base)
   → inserta en `cola` `(contacto, producto='protocolo', proximo_paso=1, …)`.
4. **Labels que aparecen, por convención:** `producto-protocolo`, `comprador-protocolo`.
5. **Código nuevo:** cero. **Rebuild de Typebot:** cero. Solo config + el trigger.

### Cómo conviven varias secuencias en un mismo contacto

- `cola` trackea por **(contacto, producto)** — un contacto puede tener varias filas activas.
- Cada secuencia chequea **su** `label_stop` + los stops globales (`humano`, `unsubscribe`).
- Ejemplo: alguien `comprador-pastas` ya tiene frenada la secuencia de pastas, pero puede
  estar corriendo la de `protocolo`. Cuando compra el upsell → se setea `comprador-protocolo`
  → esa secuencia frena sola. Sin colisiones.

**Resumen:** productos y upsells escalan al infinito con dos labels por convención
(`producto-<slug>`, `comprador-<slug>`) + filas de config. El contrato no se reescribe.
