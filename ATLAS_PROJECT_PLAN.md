# Atlas — Self-hosted WhatsApp Messaging Stack

> Replacement for ManyChat. Owned end-to-end. Built on Evolution API + Typebot + Chatwoot + custom admin app.

---

## 1. Project Vision

**Atlas** is a self-hosted WhatsApp automation stack that replaces ManyChat for an Argentine infoproducts business. The owner (Lucho) and his partner (Gabi) sell wellness/lifestyle ebooks via Meta Ads → click-to-WhatsApp → automated sales sequences with voluntary contribution model.

### Why this project exists

- **ManyChat banning accounts unfairly** — accounts get deleted on ManyChat side even when WhatsApp numbers and BMs remain healthy at Meta
- **Cost** — ManyChat at scale costs ~$500/month and growing
- **Ownership** — full control of data, logic, and operations
- **Customization** — features that ManyChat doesn't allow

### Business context that informs technical decisions

- High volume per number (500+ messages/day average)
- Numbers are "burned" frequently (new ones connected regularly)
- 8+ admin profiles across multiple Business Managers
- 20+ VMs with numbers in operation
- Two-person team (Lucho + Gabi)
- Already runs Hetzner server with n8n and NGINX Proxy Manager

---

## 2. Architecture Overview

### Stack components

| Component | Role | Status |
|---|---|---|
| **Evolution API** | WhatsApp gateway via Meta Cloud API. Receives all webhooks from Meta. Routes messages to Typebot and mirrors to Chatwoot | New install |
| **Typebot** | Central flow manager. One bot per product. Manages user fields, variables, sequences. Source of truth for flow logic | New install |
| **Chatwoot** | Live chat inbox for human support. Read-only mirror of conversations plus takeover capability | New install |
| **n8n** | Glue and automation. Workflows for label management, alerts, custom logic | Already installed |
| **Atlas app** | Custom admin panel. Knockout/connection flow, monitoring dashboard, number management | New build |
| **NGINX Proxy Manager** | SSL termination and subdomain routing | Already installed |
| **PostgreSQL** | Shared database for all services | New install |
| **Redis** | Cache/queue for Chatwoot and Typebot | New install |

### Message flow (incoming)

```
Cliente WhatsApp
    ↓
Meta Cloud API webhook
    ↓
Evolution API (gateway)
    ↓
    ├─→ Typebot (executes flow for assigned product)
    │      ↓
    │      Typebot decision points fire HTTP webhooks → n8n
    │      ↓
    │      n8n calls Chatwoot API to add labels
    │
    └─→ Chatwoot (mirror for live view)
```

### Message flow (outgoing)

```
Typebot sends message
    ↓
Evolution API
    ↓
Meta Cloud API
    ↓
Cliente WhatsApp

(also mirrored to Chatwoot for live view)
```

### Critical architectural decisions (DO NOT QUESTION OR CHANGE)

1. **Cloud API, not Baileys.** High volume requires the official API.
2. **Evolution as the hub.** Not Chatwoot. Webhooks from Meta go to Evolution.
3. **Typebot as central manager.** All flow logic, user fields, tags, sequences live in Typebot.
4. **Chatwoot only for live support.** Mirrors conversations, allows takeover. Not the source of truth.
5. **Atlas custom app does the knockout.** Not Chatwoot's UI. Atlas controls connection + assigns product.
6. **Labels are ACCUMULATIVE.** n8n only ADDS labels, never replaces. Labels are journey history.
7. **One Meta App per BM, 3 BMs total for redundancy.** App 1 in production, Apps 2 and 3 dormant.
8. **8 admin profiles as developers on all 3 Apps.** No App Review needed.
9. **Single Evolution instance.** Manages numbers from all BMs.
10. **Routing by product is declarative.** Per-number config in Evolution: number → bot.

---

## 3. Prerequisites (Lucho confirms before starting)

- [ ] Meta Business Manager verified (CONFIRMED: yes, 8+ profiles, 20+ VMs)
- [ ] Numbers in BM are owned (CONFIRMED: yes)
- [ ] Hetzner server (will upgrade to CPX31: 4 vCPU, 8 GB RAM, ~$13/month)
- [ ] Domain available for subdomains (assumed: `ebooksdgg.lat` or similar)
- [ ] Cloudflare or DNS provider access
- [ ] NGINX Proxy Manager running (CONFIRMED: yes)
- [ ] n8n running (CONFIRMED: yes)
- [ ] Docker + Docker Compose installed (CONFIRMED: yes)
- [ ] GitHub repo created for Atlas (this project)

---

## 4. Phase 1 — Meta Foundation (Lucho, manual via browser)

### 4.1 Subdomain plan

Decide and configure DNS for the following subdomains (all pointing to Hetzner IP):

| Subdomain | Service |
|---|---|
| `evolution.tudominio.com` | Evolution API |
| `typebot.tudominio.com` | Typebot editor |
| `typebot-viewer.tudominio.com` | Typebot runtime (public) |
| `chat.tudominio.com` | Chatwoot |
| `atlas.tudominio.com` | Atlas admin app |

### 4.2 Create Meta App #1 (production)

1. Go to https://developers.facebook.com
2. Create App → type "Business"
3. Associate with **BM #1**
4. Add product: **WhatsApp Business Platform**
5. Configure Embedded Signup:
   - Display name: `Atlas` (or chosen name)
   - Logo: upload business logo
   - Callback URL: `https://atlas.tudominio.com/api/whatsapp/embedded-signup/callback`
   - Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`
6. Generate **Configuration ID** for Embedded Signup
7. Add roles: invite all 8 admin profiles as **Developers**
8. Capture and save securely:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_CONFIG_ID`
   - `META_VERIFY_TOKEN` (Lucho generates random string)

### 4.3 Create Meta App #2 and #3 (redundancy)

Repeat 4.2, but:
- App #2: associate with **BM #2** (different BM)
- App #3: associate with **BM #3** (different BM)
- Same display name allowed
- Same 8 profiles as developers
- Different callback URLs to test independently (or same, doesn't matter for dormant state)
- Save credentials separately

Status: Apps #2 and #3 remain dormant until needed.

---

## 5. Phase 2 — Server Infrastructure (Claude Code writes)

### 5.1 Server upgrade

Lucho upgrades Hetzner from current plan to **CPX31** (4 vCPU, 8 GB RAM, ~$13/month) before deployment.

### 5.2 Directory structure on server

```
/opt/atlas/
├── docker-compose.yml
├── .env
├── postgres-data/
├── redis-data/
├── evolution/
│   └── instances/
├── typebot/
│   └── uploads/
├── chatwoot/
│   ├── storage/
│   └── public/
└── backups/
```

### 5.3 docker-compose.yml requirements

Claude Code generates the file with these services. Use latest stable images.

**Shared services:**
- `postgres` (PostgreSQL 16) — single instance, multiple databases (evolution, typebot, chatwoot)
- `redis` (Redis 7) — used by Chatwoot and Typebot

**Application services:**
- `evolution-api` — official Evolution image, latest stable. Mode: cloud API. Database: postgres. Webhook URL pre-configured to Typebot integration internal endpoint.
- `typebot-builder` — official Typebot builder image
- `typebot-viewer` — official Typebot viewer image
- `chatwoot-rails` — official Chatwoot image (rails app)
- `chatwoot-sidekiq` — same image, different command (background jobs)

**Important configuration:**
- All services on same Docker network
- Internal communication via service names
- External access only via NGINX Proxy Manager
- Persistent volumes for all data
- Health checks on every service
- Automatic restart on failure
- Resource limits per service (prevent any service from starving others)

### 5.4 .env file structure

Variables to define (Claude Code writes the template, Lucho fills with real values):

```
# Server
SERVER_DOMAIN=tudominio.com
POSTGRES_PASSWORD=
REDIS_PASSWORD=

# Evolution API
EVOLUTION_API_KEY=
EVOLUTION_DATABASE_URL=
EVOLUTION_AUTH_API_KEY=

# Typebot
TYPEBOT_ENCRYPTION_SECRET=
TYPEBOT_NEXTAUTH_SECRET=
TYPEBOT_DATABASE_URL=
TYPEBOT_ADMIN_EMAIL=

# Chatwoot
CHATWOOT_SECRET_KEY_BASE=
CHATWOOT_FRONTEND_URL=https://chat.tudominio.com
CHATWOOT_DATABASE_URL=
CHATWOOT_REDIS_URL=

# Meta App (active)
META_APP_ID=
META_APP_SECRET=
META_CONFIG_ID=
META_VERIFY_TOKEN=
META_API_VERSION=v21.0

# Atlas
ATLAS_DATABASE_URL=
ATLAS_NEXTAUTH_SECRET=
ATLAS_ADMIN_EMAIL_LUCHO=
ATLAS_ADMIN_EMAIL_GABI=
```

### 5.5 NGINX Proxy Manager setup

Lucho configures (via NPM UI) reverse proxy entries for each subdomain pointing to the corresponding Docker service. SSL via Let's Encrypt auto-renewal.

---

## 6. Phase 3 — Atlas Custom App (Claude Code builds)

### 6.1 Tech stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** PostgreSQL via Drizzle ORM
- **Auth:** Simple credential-based for 2 users (Lucho, Gabi). NextAuth with credentials provider.
- **Deployment:** Docker container in same compose stack
- **HTTP client:** Native fetch + zod schemas for validation

### 6.2 Database schema (Drizzle)

```typescript
// Numbers table
{
  id: uuid (PK)
  phone_number: text (unique)
  display_name: text
  business_id: text         // Meta WABA business ID
  waba_id: text             // Meta WABA ID  
  phone_number_id: text     // Meta phone number ID
  product_slug: text        // "sibo", "pastas", "tortas", etc
  product_name: text        // Human readable
  meta_app_used: text       // "app_1" | "app_2" | "app_3"
  internal_label: text      // Optional custom label
  status: enum              // "active" | "paused" | "disconnected" | "banned"
  quality_rating: enum      // "GREEN" | "YELLOW" | "RED" | "UNKNOWN"
  messaging_tier: text      // "TIER_250" | "TIER_1K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED"
  evolution_instance_name: text
  chatwoot_inbox_id: integer
  typebot_id: text
  connected_at: timestamp
  last_activity_at: timestamp
  created_at: timestamp
  updated_at: timestamp
}

// Products table  
{
  id: uuid (PK)
  slug: text (unique)
  name: text
  typebot_id: text          // Default Typebot to use for this product
  active: boolean
  created_at: timestamp
}

// Event log (for audit)
{
  id: uuid (PK)
  number_id: uuid (FK)
  event_type: text          // "connected" | "product_changed" | "quality_dropped" | "disconnected" | etc
  data: jsonb
  created_at: timestamp
}

// Meta apps config
{
  id: text (PK)             // "app_1" | "app_2" | "app_3"
  app_id: text
  app_secret_encrypted: text
  config_id: text
  is_active: boolean
  notes: text
}

// Users
{
  id: uuid (PK)
  email: text (unique)
  password_hash: text
  name: text
  role: enum                // "admin"
}
```

### 6.3 Pages

#### `/login`
Simple email + password. Two hardcoded users (Lucho, Gabi).

#### `/dashboard` — Numbers monitoring (main page)
- **Header stats:** total numbers, healthy, warning, critical, down
- **Filters:** by product, by status, by quality rating
- **Table:** number, product, quality badge, tier, messages today, status, last activity
- **Auto-refresh** every 30 seconds
- **Row click** → navigates to number detail
- **Header button:** "+ Conectar nuevo número"

#### `/connect` — Number connection (knockout)
- **Form before knockout:**
  - Dropdown: select product
  - Optional: internal label
  - Optional: target Meta App (defaults to active = App 1)
- **Button:** "Conectar con WhatsApp Business"
- Triggers Meta Embedded Signup popup
- On callback success → auto-configures Evolution + Chatwoot + Typebot
- Shows progress: "Configurando Evolution... ✓ Creando inbox en Chatwoot... ✓ Asociando flujo de Typebot... ✓"
- Final: "✅ Número activo"

#### `/number/[id]` — Number details
- **Header:** phone, display name, product, quality badge
- **Tabs:**
  - **Overview:** all current state, quality history (sparkline last 7 days), messages today/week/month
  - **Activity log:** event log entries
  - **Actions:**
    - Pausar (suspend, doesn't disconnect)
    - Cambiar producto (dropdown, applies to future conversations only)
    - Reconectar (re-trigger Embedded Signup with same number)
    - Desconectar (remove from Evolution, archive in Atlas)

#### `/settings`
- **Meta Apps:** show 3 apps with status (active/dormant), button to switch active app
- **Products:** CRUD list of products + associated Typebot IDs
- **Users:** simple list (Lucho, Gabi)

### 6.4 API routes (server-side)

#### `POST /api/whatsapp/embedded-signup/exchange-code`
- Receives auth code from Embedded Signup popup
- Exchanges for permanent access token via Meta API
- Returns success + number details

#### `POST /api/numbers/create`
- Called after successful exchange-code
- Creates record in Atlas DB
- Calls Evolution API to create instance bound to the Meta phone number
- Calls Chatwoot API to create inbox (with auto-label `producto-{slug}`)
- Updates Evolution instance with Typebot integration config (binds to product's bot)
- Logs event "connected"
- Returns full number record

#### `POST /api/numbers/{id}/change-product`
- Updates `product_slug` and `product_name` in DB
- Updates Evolution instance: change bound Typebot to new product's bot
- Adds new auto-label to Chatwoot for FUTURE conversations only
- Logs event "product_changed"

#### `POST /api/numbers/{id}/pause`
- Disables instance in Evolution (stops receiving)
- Does NOT delete or disconnect at Meta
- Logs event "paused"

#### `POST /api/numbers/{id}/disconnect`
- Removes instance from Evolution
- Archives number in Atlas
- Does NOT delete Meta-side (Lucho can re-add later)
- Logs event "disconnected"

#### `POST /api/webhooks/meta/{app-id}`
- Receives Meta webhooks for phone_number quality updates
- Updates number record with new quality_rating, messaging_tier
- If quality drops, triggers alert via n8n

#### `POST /api/webhooks/evolution`
- Receives Evolution lifecycle events (instance connected, disconnected)
- Updates number status
- Triggers alerts as needed

#### `GET /api/numbers/sync`
- Cron-triggered every 30 minutes
- Polls Meta API for each number's quality_rating + messaging_tier
- Updates Atlas DB if changed
- Fires alerts on changes

### 6.5 Embedded Signup integration

Use Meta's JavaScript SDK on the `/connect` page. Reference: https://developers.facebook.com/docs/whatsapp/embedded-signup

Flow:
1. Page loads Meta SDK
2. User selects product + clicks button
3. SDK opens Meta popup with `config_id`
4. User authorizes in Meta popup, selects WABA + number
5. Popup closes, returns `code` + `phone_number_id` + `waba_id`
6. Frontend posts to `/api/whatsapp/embedded-signup/exchange-code`
7. Backend exchanges code for permanent token
8. Frontend posts to `/api/numbers/create` with all data
9. Show progress UI

---

## 7. Phase 4 — n8n Workflows (Claude Code provides JSON exports)

Workflows live in n8n's existing instance. Claude Code provides JSON files importable via n8n UI.

### 7.1 Workflow: "Add Label from Typebot"

- **Trigger:** Webhook node, POST endpoint
- **Path:** `/webhook/atlas/add-label`
- **Input payload:**
  ```json
  {
    "phone": "+5491102",
    "label": "cliente",
    "metadata": { "source": "typebot", "flow": "sibo" }
  }
  ```
- **Steps:**
  1. Find contact in Chatwoot by phone number (API call)
  2. Get active conversation for that contact
  3. Call Chatwoot API: `POST /api/v1/accounts/{id}/conversations/{convId}/labels` with `{"labels": ["cliente"]}` — note: this is the ADD operation, never the REPLACE
  4. Log to Atlas event log (optional, via Atlas API)
- **Response:** `{ "success": true }` to Typebot

### 7.2 Workflow: "Quality Rating Alert"

- **Trigger:** Webhook from Atlas when quality_rating changes
- **Steps:**
  1. Check severity (GREEN→YELLOW, YELLOW→RED, etc)
  2. Send WhatsApp message to Lucho's personal number (via internal Evolution instance dedicated to alerts) with details
  3. (Optional) Send Telegram message via Telegram node
  4. Log event

### 7.3 Workflow: "Number Disconnect Alert"

- **Trigger:** Webhook from Atlas on disconnect events
- **Steps:**
  1. Notify Lucho + Gabi immediately
  2. Include number, product, last activity timestamp

### 7.4 Workflow: "Payment Receipt OCR"

(Migration of existing workflow — verify it still works with Typebot)
- **Trigger:** Webhook from Typebot when client sends image
- **Steps:**
  1. Download image
  2. Send to OpenAI Vision API with prompt to extract payment data
  3. Parse response, validate amount/date/account
  4. Reply to Typebot with `{ "valid": true/false, "extracted_data": {...} }`
- Typebot continues flow based on result

### 7.5 Workflow: "Daily Health Report"

- **Trigger:** Cron, 9 AM ART daily
- **Steps:**
  1. Fetch from Atlas API: total numbers, breakdown by status, quality, product
  2. Format as message
  3. Send to Lucho via WhatsApp

---

## 8. Phase 5 — Migration from ManyChat (manual + assisted)

### 8.1 Pre-migration checklist

- [ ] Atlas deployed and tested with 1 dev number
- [ ] At least 1 full Typebot flow replicated (start with simplest product)
- [ ] Chatwoot accessible by Lucho and Gabi (mobile app installed)
- [ ] Labels validated working
- [ ] Payment receipt OCR validated working

### 8.2 Migration sequence

**Week 1:** Connect 1 test number to Atlas. Run product X flow in parallel with ManyChat on different number. Compare outputs.

**Week 2:** Migrate first production number for product X. Pause same product in ManyChat for that number. Monitor 7 days.

**Week 3-4:** Roll out product by product, 2-3 numbers per day.

**Week 5+:** All numbers migrated. Cancel ManyChat subscription.

### 8.3 What to migrate from ManyChat

For each product, replicate in Typebot:
- All sequences (audios + text + buttons)
- All variables / user fields
- All tags (define as labels in Chatwoot)
- All conditional logic
- All n8n integrations (payment OCR, Google Sheets, etc)

---

## 9. Operations — Day-to-Day

### Lucho's workflows

**Adding a new number:**
1. Atlas → /connect
2. Select product, click "Conectar"
3. Authorize in Meta popup
4. Done (30 seconds)

**Editing a flow:**
1. Open Typebot
2. Edit visual flow
3. Save and publish

**Live support:**
1. Open Chatwoot (web or mobile app)
2. Filter by label or inbox
3. Reply to conversations
4. Take control of bot when needed via Chatwoot

**Monitoring:**
1. Atlas dashboard on browser
2. Auto-refresh every 30s
3. Critical alerts arrive via WhatsApp (from n8n)

### Maintenance

- **Daily:** check dashboard, respond to alerts
- **Weekly:** review event log, check for patterns
- **Monthly:** Docker pull updates for all services, restart with `docker compose up -d`
- **Quarterly:** verify backups, test redundancy switch

---

## 10. Redundancy & Disaster Recovery

### Meta App switch procedure (if App 1 becomes unusable)

1. Atlas → /settings → Meta Apps
2. Click "Activar App 2"
3. Atlas updates `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` in runtime config
4. For each active number:
   - Atlas calls Meta API to re-authorize via App 2
   - Updates number record with `meta_app_used = "app_2"`
5. Estimated total time: 30 minutes for ~20 numbers

### Data backups

- **Postgres dump:** daily, retained 30 days
- **Volumes:** weekly snapshot to external storage (Hetzner Storage Box or S3-compatible)
- **Configs:** committed to GitHub repo

### Server failure recovery

- Spin up new Hetzner box
- Clone repo
- Restore postgres dump
- Restore volumes
- `docker compose up -d`
- Estimated total time: 1-2 hours

---

## 11. Build Order for Claude Code

Execute in this order. Each step must work before moving to the next.

1. **Repo scaffolding** — create folder structure, basic README, gitignore, MIT or proprietary license
2. **docker-compose.yml + .env.example** — all services defined but not yet customized
3. **Validate compose locally** — `docker compose config` passes, services start cleanly
4. **NGINX Proxy Manager configs documented** — exact entries Lucho needs to create
5. **Atlas app scaffolding** — Next.js + Tailwind + Drizzle setup, empty pages
6. **Atlas DB schema + migrations** — Drizzle schemas, migration generated
7. **Atlas auth** — login page, session management
8. **Atlas /settings page** — manage Meta apps and products (needed before connecting first number)
9. **Atlas /connect page + Embedded Signup integration** — full knockout flow
10. **Atlas /api/numbers/create** — Evolution + Chatwoot + Typebot configuration logic
11. **Atlas /dashboard** — read-only monitoring
12. **Atlas /number/[id] + actions** — change product, pause, reconnect, disconnect
13. **n8n workflows** — export JSONs for manual import
14. **Webhooks Atlas ↔ Meta/Evolution** — quality updates, status changes
15. **Cron sync job** — periodic poll for quality/tier
16. **Documentation** — operational runbook in repo
17. **Migration helper scripts** — for moving ManyChat flows to Typebot (optional)

---

## 12. Open Questions for Lucho (resolve before relevant phase)

- [ ] Domain to use for subdomains
- [ ] Display name to register for Embedded Signup ("Atlas" or other?)
- [ ] Encryption strategy for Meta App secrets in Atlas DB (env-based key acceptable, or KMS-like solution?)
- [ ] Alerts: WhatsApp only, or also Telegram/email?
- [ ] First product to migrate (likely SIBO based on history, confirm)
- [ ] Internal "alerts number" — dedicated WhatsApp number for receiving n8n alerts, separate from business numbers

---

## 13. Out of Scope (for now)

- Multi-tenant support (only Lucho's business)
- Analytics dashboard with charts (start with table, add later)
- Mobile-native admin app (Chatwoot mobile covers daily support)
- AI-assisted flow generation (Info Maker handles this separately)
- A/B testing of flows (manual variations in Typebot for now)
- CRM features (lives in Chatwoot)
- Public API for Atlas (internal use only)

---

## 14. Success Criteria

Atlas is "done" when:

1. Lucho can connect a new number in under 1 minute from Atlas
2. Connected number receives messages, routes to correct Typebot flow, mirrors to Chatwoot
3. Typebot labels appear in Chatwoot correctly and never get deleted
4. Quality rating drops trigger WhatsApp alerts within 30 minutes
5. At least 1 product fully migrated from ManyChat to Atlas, operating for 7 days without issues
6. Backup restore tested end-to-end on a staging server
7. Lucho and Gabi can both operate the system independently
8. Atlas runs stable on CPX31 with current load

---

## Appendix A — Key External References

- Meta WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp
- Embedded Signup: https://developers.facebook.com/docs/whatsapp/embedded-signup
- Evolution API docs: https://doc.evolution-api.com
- Typebot docs: https://docs.typebot.io
- Chatwoot docs: https://www.chatwoot.com/docs
- n8n docs: https://docs.n8n.io

## Appendix B — Meta App Required Permissions

For each Meta App:
- `whatsapp_business_management`
- `whatsapp_business_messaging`

Both available without App Review while app is in Development mode and users are listed as Developers.

## Appendix C — Glossary

- **BM** — Business Manager (Meta)
- **WABA** — WhatsApp Business Account (Meta entity holding numbers)
- **Knockout** — slang for Embedded Signup flow (Meta's OAuth popup for connecting numbers)
- **Tier** — messaging volume limit per number (250, 1K, 10K, 100K, unlimited)
- **Quality rating** — Meta's health score for a number (Green/Yellow/Red)
