# Atlas — Runbook Operacional

## Primera puesta en marcha

### 1. Clonar y preparar variables

```bash
git clone git@github.com:EbooksDGG/atlas.git
cd atlas/infra
cp .env.example .env
# Completar TODOS los valores en .env
```

### 2. Crear red externa (si no existe)

```bash
docker network create proxy_default 2>/dev/null || true
```

### 3. Levantar infraestructura

```bash
docker compose up -d
docker compose ps          # Verificar que todos estén healthy
docker compose logs -f atlas-app
```

### 4. Inicializar base de datos

```bash
# Desde la raíz del repo
cd apps/atlas-app
npm ci
npm run db:migrate         # Aplica migraciones Drizzle
SEED_LUCHO_PASSWORD=xxx SEED_GABI_PASSWORD=xxx npm run db:seed
```

### 5. Configurar Meta App

1. Entrá a `https://atlas.ebooksdgg.lat` → Settings → Meta Apps
2. Completá App ID, App Secret y Config ID de tu app de Meta
3. Hacé clic en **Activar** en la app que vas a usar como default
4. Registrá el webhook en Meta Developers:
   - URL: `https://atlas.ebooksdgg.lat/api/webhooks/meta/app_1`
   - Token de verificación: valor de `META_VERIFY_TOKEN` en `.env`
   - Suscribirse a: `phone_quality_score`

### 6. Configurar Evolution API webhook

En el panel de Evolution API o via API:

```bash
curl -X POST https://evolution.ebooksdgg.lat/webhook/set/INSTANCIA \
  -H "apikey: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://atlas.ebooksdgg.lat/api/webhooks/evolution",
    "headers": { "x-evolution-secret": "TU_EVOLUTION_WEBHOOK_SECRET" },
    "events": ["CONNECTION_UPDATE", "MESSAGES_UPSERT"]
  }'
```

O configurá el webhook global en `WEBHOOK_GLOBAL_URL` en el `.env` de Evolution.

### 7. Importar workflows en n8n

1. En `https://n8n.ebooksdgg.lat` → Settings → Import workflow
2. Importar en orden:
   - `n8n-workflows/01-quality-alert.json`
   - `n8n-workflows/02-disconnect-alert.json`
   - `n8n-workflows/03-daily-health.json`
   - `n8n-workflows/04-payment-ocr.json`
   - `n8n-workflows/05-add-chatwoot-label.json`
3. Configurar credenciales (Slack, Notion, OpenAI, Chatwoot, SMTP)
4. Copiar las URLs de los webhooks de n8n (01 y 02) a `.env`:
   - `N8N_QUALITY_ALERT_WEBHOOK_URL=...`
   - `N8N_DISCONNECT_ALERT_WEBHOOK_URL=...`
5. Reiniciar atlas-app: `docker compose restart atlas-app`
6. Activar los 5 workflows en n8n

---

## Conectar un número nuevo

1. `https://atlas.ebooksdgg.lat/connect`
2. Seleccionar producto y Meta App
3. Clic **Conectar con Meta** → completar Embedded Signup
4. El número aparece en el Dashboard en estado **Activo**

---

## Operaciones comunes

### Ver logs en vivo

```bash
docker compose logs -f atlas-app
docker compose logs -f evolution-api
docker compose logs -f chatwoot-rails
```

### Reiniciar un servicio

```bash
docker compose restart atlas-app
docker compose restart evolution-api
```

### Pausar un número

Dashboard → click en el número → pestaña Acciones → Pausar

### Cambiar el producto de un número

Dashboard → click en el número → pestaña Acciones → Cambiar producto → Guardar

### Desconectar un número

Dashboard → click en el número → pestaña Acciones → Desconectar → confirmar

### Forzar sync de calidad ahora

```bash
curl -H "x-atlas-cron-secret: TU_ATLAS_CRON_SECRET" \
  https://atlas.ebooksdgg.lat/api/numbers/sync
```

---

## Actualizar Atlas

```bash
cd infra
git pull
docker compose build atlas-app
docker compose up -d atlas-app
# Si hay migraciones nuevas:
docker compose exec atlas-app node -e "require('./node_modules/.bin/drizzle-kit') push"
# O mejor: correr npm run db:migrate desde apps/atlas-app en la máquina local
```

---

## Backup de base de datos

```bash
docker compose exec postgres pg_dump -U postgres atlas \
  | gzip > backups/atlas-$(date +%Y%m%d).sql.gz
```

Automatizar con cron en el VPS:

```cron
0 3 * * * cd /opt/atlas/infra && docker compose exec -T postgres pg_dump -U postgres atlas | gzip > /backups/atlas-$(date +\%Y\%m\%d).sql.gz && find /backups -name "atlas-*.sql.gz" -mtime +30 -delete
```

---

## Troubleshooting

### El número aparece Desconectado sin haberlo desconectado

Evolution cerró la conexión. Ir a la pestaña Acciones → Reconectar para volver a hacer el Embedded Signup.

### El webhook de Meta no se verifica

Verificar que `META_VERIFY_TOKEN` en `.env` coincida con el configurado en Meta Developers, y que el subdominio `atlas.ebooksdgg.lat` tenga SSL válido.

### n8n no recibe alertas

1. Verificar que los workflows 01 y 02 estén activos en n8n
2. Verificar `N8N_QUALITY_ALERT_WEBHOOK_URL` y `N8N_DISCONNECT_ALERT_WEBHOOK_URL` en `.env`
3. Verificar que atlas-app se reinició después de setear esas variables

### Error de firma en webhook de Meta

La app secret en Settings debe coincidir con la registrada en Meta Developers (App Settings → Basic → App Secret).

### Typebot no responde en conversaciones nuevas

1. Verificar que el número tiene un producto con `typebotId` configurado
2. Verificar que `TYPEBOT_VIEWER_URL` apunta a `http://typebot-viewer:3000`
3. Probar `setTypebot` manualmente llamando al endpoint de Evolution API

---

## Variables de entorno clave

| Variable | Descripción |
|---|---|
| `ATLAS_ENCRYPTION_KEY` | 64 hex chars — AES-256 para secrets de Meta en DB |
| `META_VERIFY_TOKEN` | Token de verificación webhook Meta |
| `META_SYSTEM_USER_TOKEN` | Token para sync de calidad vía Meta Graph API |
| `EVOLUTION_WEBHOOK_SECRET` | Header compartido con Evolution para autenticar webhooks |
| `ATLAS_CRON_SECRET` | Header para endpoint `/api/numbers/sync` |
| `N8N_QUALITY_ALERT_WEBHOOK_URL` | URL webhook n8n workflow 01 |
| `N8N_DISCONNECT_ALERT_WEBHOOK_URL` | URL webhook n8n workflow 02 |
