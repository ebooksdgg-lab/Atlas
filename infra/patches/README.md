# Evolution patches — Typebot "no-refire" + media send-path fixes

Custom build of **Evolution API v2.2.3** with two bundle patches:
1. **no-refire** — an empty Typebot turn ENDS the turn instead of re-firing a second
   `continueChat` (which leaked the sibling branch on a silent Condition branch).
2. **media** — 5 fixes to the Cloud API send path so Typebot-uploaded media (image and
   audio) actually reaches WhatsApp. Typebot stores uploads at an **extensionless** S3
   key (`.../blocks/<blockId>?v=...`) and Evolution sends them as a Cloud API `link`,
   which triggered a chain of bugs (isImage crash, `filename`-on-audio 400, and a crash
   that masked Meta's real error). See "Patch #2" below.

**Build method: derive from the digest + patch the compiled bundle.** We do NOT
rebuild from source — the 2.2.3 source no longer compiles against today's transitive
deps (baileys git HEAD dropped `offerCall`/`terminateCall`; axios changed
`AxiosHeaderValue`), none of which is our change. Instead we `FROM` the pinned 2.2.3
digest (which already ships `dist/main.js` + `node_modules`) and apply the fixes to the
bundle with self-verifying node scripts.

- Bundle patches (applied at build, in order):
  [`patch-bundle-norefire.cjs`](./patch-bundle-norefire.cjs),
  [`patch-bundle-media.cjs`](./patch-bundle-media.cjs)
- Dockerfile: [`../Dockerfile.evolution`](../Dockerfile.evolution)
- Build: [`../build-evolution-patched.sh`](../build-evolution-patched.sh) → image `atlas-evolution:2.2.3-atlas2`
- Compose: `evolution-api.image` already points to the custom image (pinned digest kept commented for rollback).
- [`typebot-no-refire.patch`](./typebot-no-refire.patch) — the equivalent **source** change for patch #1, kept as documentation of intent (NOT used by the build).

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

The two empty-turn re-fire blocks (expired-session + no-session branches of
`processTypebot`) are neutralized. In the **source** the intent is:

```ts
if (data.messages.length === 0) return;   // no continueChat re-fire, no unknownMessage
```

In the **bundle**, `patch-bundle-norefire.cjs` finds each block via a unique anchor
(`x.messages.length===0){…` and `b.messages.length===0){…`), brace-matches its body,
and replaces the body with `{return}` — which removes the two re-fire `continueChat`
calls. The script asserts `continueChat` goes **3 → 1** and fails the build otherwise.

- The legit `continueChat` of the **opened-session** path (a user answering an
  input, the only one using `sessionId.split("-")[1]`) is untouched.
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

## Patch #2 — media send-path (`patch-bundle-media.cjs`)

**Symptom:** media bubbles (image/audio) uploaded in Typebot show fine in the builder
but **never arrive on WhatsApp**. First error in the logs:
`TypeError: t.mimetype?.startsWith is not a function ... status: 400`.

**Context.** Typebot persists uploads at an **extensionless** S3 key
(`https://s3.ebooksdgg.lat/typebot/public/workspaces/.../blocks/<blockId>?v=...`) and
Evolution sends them as a Cloud API `link` (`mediaMessage`/`audioWhatsapp` →
`sendMessageWithTyping`). MinIO serves the correct `Content-Type` (audio/mpeg,
image/png) — the serving side is fine; the bugs are all in Evolution's send path, and
they surface in order, so all five fixes are needed.

| # | Bug | Source | Fix |
|---|-----|--------|-----|
| 1 | `isImage = mimetype?.startsWith('image/')` throws — `mimeTypes.lookup(extensionless-url)` returns `false` (`string\|false`), and `false?.startsWith` is not guarded by `?.` | `:802` | `isImage = mediaType === 'image'` (always a string; more correct) |
| 2 | audio-by-URL flows through the `message['media']` branch, which appends `filename` when `!isImage` (audio/video); Cloud API accepts `filename` only on `document` → 400 | `:812` | gate filename on `mediaType === 'document'` |
| 3 | failed send not detected — `post()` returns `e.response?.data?.error` (`:87`), so `messageSent` is Meta's error object (no `messages`); the guard only checked `error_data` (often absent) | `:911` | detect via `error_data \|\| error \|\| !messages` → log + return Meta's real error |
| 4–5 | on a Meta error, `messageSent.messages[0]?.id/.timestamp` threw "reading '0'", **masking** Meta's actual error | `:917`, `:920` | optional-chain: `messages?.[0]?.id` / `messages?.[0]?.timestamp` |

Fix #1 unblocks the path; #2 is what actually makes **audio** send; #3–5 surface (instead
of hiding) any remaining Meta rejection. The `link` flow is otherwise unchanged — Meta
still fetches the URL and reads its real `Content-Type` from MinIO.

> Note on #3: `post()` already unwraps to Meta's inner `error` object, so `messageSent.error`
> is normally absent — `!messages` is the reliable discriminator (added on top of the
> requested `error_data || error`).

Each anchor is a unique literal in the pinned 2.2.3 bundle; the script asserts exactly 1
occurrence per fix and fails the build on any mismatch.

> **Meta limits (not patched):** Cloud API image ≤ **5 MB**, audio ≤ 16 MB, audio must
> be mp3/`audio/mpeg` or ogg/opus. Evolution does not resize — keep funnel images < 5 MB.

---

## Runbook

> Server rules: business-critical box (n8n / AFIP postgres live). Always `-p atlas`,
> never a global `up`, never `docker volume prune`, never touch n8n or the AFIP
> postgres. Run docker from `/opt/atlas/infra`, git from `/opt/atlas`.

### 1. Build (on the server, from `/opt/atlas`)

```bash
bash infra/build-evolution-patched.sh      # → atlas-evolution:2.2.3-atlas2
```

### 2. Verify the image (the build script already does this; here to re-check by hand)

`build-evolution-patched.sh` fails if the bundle patch doesn't land. To re-check the
built image manually (throwaway containers — no deploy yet):

```bash
# a) the bundle lost the two refire continueChat calls (stock=3 → patched=1)
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas2 -c 'grep -o continueChat dist/main.js | wc -l'
#    → 1
#    (compare against the stock digest if you want:)
docker run --rm --entrypoint sh atendai/evolution-api@sha256:1a69aaeea408ccf753e8c9ad5fa91146a478ce4d3609577fd73ad2c52e69f8ae -c 'grep -o continueChat dist/main.js | wc -l'
#    → 3

# b) media send-path fixes landed (escaping-safe anchors; authoritative guarantee is
#    patch-bundle-media.cjs, which fails the build on mismatch). Both stock=1 → patched=0.
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas2 -c 'grep -oF "mimetype?.startsWith" dist/main.js | wc -l'
#    → 0   (isImage crash gone)
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas2 -c 'grep -oF "!u&&{filename" dist/main.js | wc -l'
#    → 0   (audio filename bug gone)

# c) version is still 2.2.3 (drop-in)
docker run --rm --entrypoint sh atlas-evolution:2.2.3-atlas2 -c 'grep "\"version\"" package.json | head -1'
#    → "version": "2.2.3",
```

### 3. Deploy (scoped to evolution-api only)

`evolution-api.image` in `infra/docker-compose.yml` already points to
`atlas-evolution:2.2.3-atlas2`. Recreate ONLY that service:

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
- **Media (patch #2)** → in a bot, **upload** (not link) an image (< 5 MB) and an mp3
  audio in bubbles; trigger to Natacha → both **arrive on WhatsApp**. Logs show no
  `mimetype?.startsWith is not a function`.
- **2nd instance** (`atlas-17252588682`) → unaffected (no bot).
- Keep an eye on `docker logs atlas-evolution-api-1` for any new errors.

### 5. Rollback (instant, one line)

In `infra/docker-compose.yml`, re-comment the custom `image:` line and uncomment
the pinned digest:

```yaml
    image: atendai/evolution-api@sha256:1a69aaeea408ccf753e8c9ad5fa91146a478ce4d3609577fd73ad2c52e69f8ae
    # image: atlas-evolution:2.2.3-atlas2
```

```bash
cd /opt/atlas/infra
docker compose -p atlas up -d --no-deps --force-recreate evolution-api
```
