# NGINX Proxy Manager — Setup Guide

This doc covers the one-time network setup and the exact proxy host entries to create in NPM's UI.

---

## 1. Connect Atlas containers to NPM's network

Atlas services join the existing `proxy_default` network (NPM's Docker network).
This is declared in `docker-compose.yml` as an external network — no action needed from NPM's side.
NPM resolves containers by their Docker Compose service name on the shared network.

Verify the network exists before first deploy:

```bash
docker network ls | grep proxy_default
```

Expected output: a line with `proxy_default` and driver `bridge`.

---

## 2. Proxy host entries

Create one entry per subdomain in NPM → **Proxy Hosts → Add Proxy Host**.

### 2.1 Evolution API

| Field | Value |
|---|---|
| Domain Names | `evolution.ebooksdgg.lat` |
| Scheme | `http` |
| Forward Hostname | `evolution-api` |
| Forward Port | `8080` |
| Websockets Support | ✅ ON |
| Block Common Exploits | ✅ ON |
| SSL Certificate | Let's Encrypt (request new) |
| Force SSL | ✅ ON |
| HTTP/2 Support | ✅ ON |

---

### 2.2 Typebot builder (editor)

| Field | Value |
|---|---|
| Domain Names | `typebot.ebooksdgg.lat` |
| Scheme | `http` |
| Forward Hostname | `typebot-builder` |
| Forward Port | `3000` |
| Websockets Support | ✅ ON |
| Block Common Exploits | ✅ ON |
| SSL Certificate | Let's Encrypt (request new) |
| Force SSL | ✅ ON |
| HTTP/2 Support | ✅ ON |

---

### 2.3 Typebot viewer (public runtime)

| Field | Value |
|---|---|
| Domain Names | `typebot-viewer.ebooksdgg.lat` |
| Scheme | `http` |
| Forward Hostname | `typebot-viewer` |
| Forward Port | `3000` |
| Websockets Support | ✅ ON |
| Block Common Exploits | ✅ ON |
| SSL Certificate | Let's Encrypt (request new) |
| Force SSL | ✅ ON |
| HTTP/2 Support | ✅ ON |

---

### 2.4 Chatwoot

| Field | Value |
|---|---|
| Domain Names | `chat.ebooksdgg.lat` |
| Scheme | `http` |
| Forward Hostname | `chatwoot-rails` |
| Forward Port | `3000` |
| Websockets Support | ✅ ON |
| Block Common Exploits | ✅ ON |
| SSL Certificate | Let's Encrypt (request new) |
| Force SSL | ✅ ON |
| HTTP/2 Support | ✅ ON |

Chatwoot uses ActionCable (WebSockets) for real-time chat. Add this in the **Advanced** tab → Custom Nginx Configuration:

```nginx
location /cable {
    proxy_pass http://chatwoot-rails:3000/cable;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

### 2.5 Atlas admin app

> **Create this entry only after completing build step 5** (Atlas app scaffolded and running).

| Field | Value |
|---|---|
| Domain Names | `atlas.ebooksdgg.lat` |
| Scheme | `http` |
| Forward Hostname | `atlas-app` |
| Forward Port | `3000` |
| Websockets Support | ✅ ON |
| Block Common Exploits | ✅ ON |
| SSL Certificate | Let's Encrypt (request new) |
| Force SSL | ✅ ON |
| HTTP/2 Support | ✅ ON |

---

## 3. DNS records (Cloudflare or your DNS provider)

Add one A record per subdomain, all pointing to the Hetzner server IP:

| Name | Type | Value | Proxy |
|---|---|---|---|
| `evolution` | A | `<hetzner-ip>` | DNS only (grey cloud) |
| `typebot` | A | `<hetzner-ip>` | DNS only |
| `typebot-viewer` | A | `<hetzner-ip>` | DNS only |
| `chat` | A | `<hetzner-ip>` | DNS only |
| `atlas` | A | `<hetzner-ip>` | DNS only |

> Use **DNS only** (not proxied) on Cloudflare so Let's Encrypt HTTP-01 challenge reaches the server directly.
> After SSL certs are issued, you can optionally enable Cloudflare proxy — but it's not required.

---

## 4. First-run checklist

Run these commands on the Hetzner server after DNS propagates and before accessing the UIs:

```bash
# 1. Verify DNS resolves to your server
dig evolution.ebooksdgg.lat +short

# 2. Start infrastructure services only (postgres + redis)
cd /opt/atlas
docker compose up -d postgres redis

# 3. Wait for postgres to be healthy, then prepare Chatwoot DB
docker compose run --rm chatwoot-rails bundle exec rails db:chatwoot_prepare

# 4. Bring up all services
docker compose up -d

# 5. Check all containers are healthy
docker compose ps
```

Expected: all containers show `healthy` or `running` within 2 minutes.

---

## 5. Verify each service is reachable

| URL | Expected |
|---|---|
| `https://evolution.ebooksdgg.lat` | JSON response from Evolution API root |
| `https://typebot.ebooksdgg.lat` | Typebot login page |
| `https://typebot-viewer.ebooksdgg.lat` | Blank or Typebot viewer page |
| `https://chat.ebooksdgg.lat` | Chatwoot login page |
| `https://atlas.ebooksdgg.lat` | Atlas login page *(after step 5)* |
