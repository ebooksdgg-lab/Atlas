#!/usr/bin/env bash
#
# Build a patched Evolution API image:  v2.2.3 + Typebot "no-refire" patch.
#
# WHY: Evolution 2.2.3, when the Typebot viewer returns an empty turn
# (messages: []), re-fires a continueChat with the user's text and relays the
# result. That turns an intentionally-silent Typebot branch into the SIBLING
# branch's content. The patch makes an empty turn END the turn. Full root-cause
# analysis + evidence: infra/patches/README.md.
#
# Run ON THE SERVER, from /opt/atlas:
#     bash infra/build-evolution-patched.sh
#
# Produces local image:  atlas-evolution:2.2.3-atlas1
# Requires: git, docker, network access. Build takes a few minutes.
# This script DOES NOT deploy anything. See README.md for the deploy runbook.

set -euo pipefail

EVOLUTION_TAG="2.2.3"
IMAGE="atlas-evolution:2.2.3-atlas1"
REPO_URL="https://github.com/EvolutionAPI/evolution-api.git"
TYPEBOT_SVC="src/api/integrations/chatbot/typebot/services/typebot.service.ts"

# Resolve the patch path relative to this script so CWD doesn't matter.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$SCRIPT_DIR/patches/typebot-no-refire.patch"
[ -f "$PATCH" ] || { echo "ERROR: patch not found at $PATCH"; exit 1; }

BUILD_DIR="$(mktemp -d /tmp/evo-build.XXXXXX)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "==> Cloning evolution-api @ $EVOLUTION_TAG"
git clone --depth 1 --branch "$EVOLUTION_TAG" "$REPO_URL" "$BUILD_DIR/repo"
cd "$BUILD_DIR/repo"

echo "==> Sanity: cloned source must be $EVOLUTION_TAG"
grep -q "\"version\": \"$EVOLUTION_TAG\"" package.json \
  || { echo "ERROR: cloned source is not $EVOLUTION_TAG"; exit 1; }

echo "==> Applying patch"
git apply --check -p1 "$PATCH"
git apply -p1 "$PATCH"

echo "==> Verifying patch landed"
test "$(grep -c 'Atlas patch (no-refire)' "$TYPEBOT_SVC")" = "2"
# The only continueChat left in CODE must be the legit opened-session one:
grep -qF "split('-')[1]}/continueChat" "$TYPEBOT_SVC"
# ...and the two empty-turn refire calls (data.sessionId) must be gone:
! grep -qF '${data.sessionId}/continueChat' "$TYPEBOT_SVC"
echo "    patch OK (2 markers, refire removed, legit continueChat kept)"

# baileys wants jimp ^1.6 while the root pins ^0.16 -> npm ERESOLVE. Build with
# --legacy-peer-deps (Evolution's Dockerfile uses a bare `RUN npm install`).
echo "==> Relaxing peer-deps in cloned Dockerfile (jimp baileys vs root conflict)"
if grep -qE '^[[:space:]]*RUN npm install.*--legacy-peer-deps' Dockerfile; then
  echo "    already has --legacy-peer-deps"
elif grep -qE '^[[:space:]]*RUN npm install([[:space:]]|$)' Dockerfile; then
  sed -i -E 's/^([[:space:]]*RUN npm install)([[:space:]]|$)/\1 --legacy-peer-deps\2/' Dockerfile
  echo "    patched: $(grep -nE '^[[:space:]]*RUN npm install' Dockerfile)"
else
  echo "ERROR: no 'RUN npm install' line found in Dockerfile to patch"; exit 1
fi

echo "==> Building $IMAGE (Evolution's own Dockerfile; a few minutes)"
docker build -t "$IMAGE" .

echo ""
echo "==> Built $IMAGE"
echo "    Verify it before deploy (see infra/patches/README.md), e.g.:"
echo "      docker run --rm --entrypoint sh $IMAGE -c 'grep -o continueChat dist/main.js | wc -l'   # expect 1 (stock = 3)"
echo "      docker run --rm --entrypoint sh $IMAGE -c 'grep \"\\\"version\\\"\" package.json | head -1'  # expect 2.2.3"
echo "    Then deploy ONLY this service:"
echo "      docker compose -p atlas up -d --no-deps --force-recreate evolution-api"
