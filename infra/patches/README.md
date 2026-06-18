# Evolution patch — Typebot "no-refire"

Custom build of **Evolution API v2.2.3** that makes an empty Typebot turn END the
turn, instead of re-firing a second `continueChat`.

- Patch: [`typebot-no-refire.patch`](./typebot-no-refire.patch)
- Build: [`../build-evolution-patched.sh`](../build-evolution-patched.sh) → image `atlas-evolution:2.2.3-atlas1`
- Compose: `evolution-api.image` already points to the custom image (pinned digest kept commented for rollback).

---

## Root cause (why this patch exists)

Symptom: a Typebot Condition branch that is intentionally **silent** (no message
bubble) makes WhatsApp receive the **sibling** branch's content. Deterministic.

Chain, verified in source + on the running stack:

1. **Typebot/viewer is correct.** For a silent branch the viewer returns
   `messages: []`. (Engine `walkFlowForward` terminates cleanly when the condition
   has no matching item / no else-edge and the session queue length is 1.)
2. **Evolution re-fires on empty.** In `typebot.service.ts > processTypebot`, both
   the expired-session and no-session branches do:
   ```ts
   if (data.messages.length === 0) {
     ...
     const request = await axios.post(`${url}/api/v1/sessions/${data.sessionId}/continueChat`, { message: content });
     await this.sendWAMessage(..., request.data.messages, ...);   // relays whatever comes back
   }
   ```
   Evolution treats `[]` as "the bot hasn't answered yet" and pokes the flow again
   with the user's text — and that second call emits the sibling branch.

### Empirical proof (captured against the live viewer, INICIO `inicio-test-zm1i9og`)

```
startChat (lead remoteJid)            → { "messages": [] }
continueChat (same session, "hola")   → { "messages": [ { "text": "aca va el pitch" } ] }
```
i.e. empty → re-poke → the Contraentrega ("aca va el pitch") sibling. Exact match
with the manual experiment (lead branch with text → that text; lead branch
disconnected → "aca va el pitch").

This is the inherent input-driven model of Evolution's Typebot integration.
Confirmed unchanged in **2.3.7** and **2.4.0-rc** (same `if empty → continueChat`),
so upgrading does NOT fix it. No upstream issue/fix published.

## What the patch changes

Both empty-turn blocks become a clean end of turn:

```ts
if (data.messages.length === 0) return;   // no continueChat re-fire, no unknownMessage
```

- The legit `continueChat` of the **opened-session** path (a user answering an
  input) is untouched.
- If a bot's first reachable block is an input, the input is still presented (it was
  already sent before this block); the trigger message is no longer consumed as the
  answer — more correct, and not relied on by any current bot (see audit).

## Audit (done before patching — confirms it's safe)

- Only **one** Typebot bot bound in all of Evolution: `inicio-test-zm1i9og`,
  `triggerType=all`, on instance **Natacha** (`atlas-14022681586`).
- The 2nd live instance (`atlas-17252588682`) has **no** Typebot bound → the patch
  has zero functional effect on it (the patched code only runs inside `processTypebot`).
- INICIO is a router: `startChat` returns `{messages:[]}` with **no** `input` → it
  does NOT depend on the re-fire / "first block = input" pattern.
- The other 3 bots (Contraentrega, Comprobante Falso, Recepción comprobante) are
  reached via Typebot-link mid-walk, not via Evolution `startChat` → unaffected.

Net: deploying the patched image affects only Natacha's bot behaviour.

---

## Runbook

> Server rules: business-critical box (n8n / AFIP postgres live). Always `-p atlas`,
> never a global `up`, never `docker volume prune`, never touch n8n or the AFIP
> postgres. Run docker from `/opt/atlas/infra`, git from `/opt/atlas`.

### 1. Build (on the server, from `/opt/atlas`)

```bash
bash infra/build-evolution-patched.sh      # → atlas-evolution:2.2.3-atlas1
```

### 2. Verify the image (throwaway containers — no deploy yet)

```bash
# a) version is still 2.2.3 (drop-in)
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas1 -c 'grep "\"version\"" package.json | head -1'
#    → "version": "2.2.3",

# b) the bundle lost the two refire continueChat calls (stock=3 → patched=1)
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas1 -c 'grep -o continueChat dist/main.js | wc -l'
#    → 1
#    (compare against stock if you want:)
docker run --rm --entrypoint sh atendai/evolution-api@sha256:1a69aaeea408ccf753e8c9ad5fa91146a478ce4d3609577fd73ad2c52e69f8ae -c 'grep -o continueChat dist/main.js | wc -l'
#    → 3
```

### 3. Deploy (scoped to evolution-api only)

`evolution-api.image` in `infra/docker-compose.yml` already points to
`atlas-evolution:2.2.3-atlas1`. Recreate ONLY that service:

```bash
cd /opt/atlas/infra
docker compose -p atlas up -d --no-deps --force-recreate evolution-api
```

Both WhatsApp numbers are Cloud API (token-based) → the container reconnects on its
own, no QR. State lives in the `evolution` DB + Redis (untouched by recreate).

Watch it come up:

```bash
docker logs -f atlas-evolution-api-1            # expect a clean boot, instances reconnecting
docker compose -p atlas ps                      # evolution-api healthy/up
```

### 4. Post-deploy tests (Natacha = `atlas-14022681586`)

```bash
# bot still bound, single, all-trigger
curl -s -H "apikey: $EVOLUTION_AUTH_API_KEY" \
  http://evolution-api:8080/typebot/find/atlas-14022681586    # (run from inside atlas-net, or via NPM host)
```

Functional, by sending real WhatsApp messages to Natacha:
- **Lead** (contact already labelled `lead`) → **silence** (no "aca va el pitch").
- **New contact** → **pitch** ("aca va el pitch") fires as before.
- **Comprobante** flow → `/typebot/start` path still delivers ENVÍO correctly.
- **2nd instance** (`atlas-17252588682`) → unaffected (no bot).
- Keep an eye on `docker logs atlas-evolution-api-1` for any new errors.

### 5. Rollback (instant, one line)

In `infra/docker-compose.yml`, re-comment the custom `image:` line and uncomment
the pinned digest:

```yaml
    image: atendai/evolution-api@sha256:1a69aaeea408ccf753e8c9ad5fa91146a478ce4d3609577fd73ad2c52e69f8ae
    # image: atlas-evolution:2.2.3-atlas1
```

```bash
cd /opt/atlas/infra
docker compose -p atlas up -d --no-deps --force-recreate evolution-api
```
