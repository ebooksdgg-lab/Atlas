# Atlas — n8n Workflows

Importar en n8n: **Settings → Import workflow → Upload file**.

Después de importar, completar las credenciales marcadas como `REPLACE_*`.

| Archivo | Trigger | Descripción |
|---|---|---|
| `01-quality-alert.json` | Webhook POST | Alerta Slack + log Notion cuando baja la calidad de un número |
| `02-disconnect-alert.json` | Webhook POST | Alerta Slack + log Notion cuando un número se desconecta |
| `03-daily-health.json` | Cron 8am lun-vie | Reporte diario por Slack + email con estado de todos los números |
| `04-payment-ocr.json` | Webhook POST | Recibe imagen de comprobante, devuelve JSON con monto/moneda/fecha via GPT-4o |
| `05-add-chatwoot-label.json` | Webhook POST | Agrega etiquetas a una conversación de Chatwoot |

## Credenciales a configurar en n8n

| Nombre sugerido | Tipo | Datos |
|---|---|---|
| `Slack Atlas` | Slack OAuth2 | Bot token del workspace |
| `Notion Atlas` | Notion API | Integration token |
| `OpenAI Atlas` | OpenAI API | API key |
| `Chatwoot API Token` | HTTP Header Auth | Header: `api_access_token`, Value: token del agente-bot |
| `Atlas cron header` | HTTP Header Auth | Header: `x-atlas-cron-secret`, Value: valor de `ATLAS_CRON_SECRET` en `.env` |
| `SMTP Atlas` | SMTP | Servidor de correo saliente |

## Webhooks de alerta (01 y 02)

Atlas llama a estos webhooks desde `/api/webhooks/evolution` cuando recibe eventos de Evolution API.

Payload de entrada:
```json
{
  "eventType": "quality_dropped" | "disconnected",
  "numberId": "uuid",
  "phoneNumber": "+5491112345678",
  "productSlug": "sibo",
  "productName": "SIBO",
  "evolutionInstanceName": "atlas-xxx",
  "data": { "from": "GREEN", "to": "YELLOW" }
}
```

## Payment OCR (04)

Invocado desde Typebot cuando el contacto envía una imagen de comprobante.

Payload de entrada:
```json
{
  "imageUrl": "https://...",
  "conversationId": 123,
  "contactPhone": "+54911..."
}
```

Respuesta:
```json
{
  "amount": 15000,
  "currency": "ARS",
  "date": "2025-05-18",
  "type": "transferencia",
  "reference": "CBU 0000...",
  "valid": true
}
```
