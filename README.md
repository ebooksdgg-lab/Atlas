# Atlas

Self-hosted WhatsApp automation stack. Replaces ManyChat.

**Stack:** Evolution API · Typebot · Chatwoot · n8n · Atlas admin app  
**Domain:** ebooksdgg.lat  
**Server:** Hetzner CPX31 (4 vCPU / 8 GB RAM)

---

## Repository structure

```
atlas/
├── apps/
│   └── atlas-app/          # Next.js 15 admin panel
├── infra/
│   ├── docker-compose.yml  # All services
│   └── .env.example        # Environment template
├── n8n-workflows/          # Importable n8n JSON exports
├── scripts/                # Operational helper scripts
├── docs/                   # Runbook and operational docs
└── ATLAS_PROJECT_PLAN.md   # Full project spec
```

## Quick start (production)

```bash
cp infra/.env.example infra/.env
# Fill all values in infra/.env
docker compose -f infra/docker-compose.yml up -d
```

## Services and subdomains

| Service | URL |
|---|---|
| Atlas admin | https://atlas.ebooksdgg.lat |
| Evolution API | https://evolution.ebooksdgg.lat |
| Typebot editor | https://typebot.ebooksdgg.lat |
| Typebot viewer | https://typebot-viewer.ebooksdgg.lat |
| Chatwoot | https://chat.ebooksdgg.lat |

## Docs

- [Project plan](./ATLAS_PROJECT_PLAN.md)
- [Operational runbook](./docs/runbook.md) *(coming soon)*
- [NGINX Proxy Manager setup](./docs/nginx-setup.md) *(coming soon)*
