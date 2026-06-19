#!/usr/bin/env bash
#
# Build the patched Evolution API image:  pinned 2.2.3 digest + Typebot "no-refire"
# fix applied to the COMPILED bundle (dist/main.js). No npm / no tsc — the 2.2.3
# source no longer compiles against today's transitive deps, so we derive from the
# digest image (which already ships dist/main.js + node_modules) and patch the bundle.
#
# Root cause + deploy/rollback/test runbook: infra/patches/README.md
#
# Run ON THE SERVER, from /opt/atlas:
#     bash infra/build-evolution-patched.sh
#
# Produces local image:  atlas-evolution:2.2.3-atlas2
# Requires: docker (+ network to pull the base digest once). This script DOES NOT deploy.

set -euo pipefail

IMAGE="atlas-evolution:2.2.3-atlas2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"   # build context = infra/ (so Dockerfile's `COPY patches/...` resolves)

echo "==> Building $IMAGE  (FROM pinned 2.2.3 digest + bundle no-refire patch)"
docker build -f Dockerfile.evolution -t "$IMAGE" .

echo "==> Verifying patched bundle #1 (no-refire): continueChat count (expect 1; stock digest = 3)"
N="$(docker run --rm --entrypoint sh "$IMAGE" -c 'grep -o continueChat dist/main.js | wc -l' | tr -d '[:space:]')"
echo "    continueChat occurrences = $N"
[ "$N" = "1" ] || { echo "ERROR: expected 1 continueChat in patched bundle, got $N"; exit 1; }

echo "==> Verifying patched bundle #2 (media): crashing isImage expr + audio filename gone"
# Escaping-safe anchors (no inner quotes). The authoritative guarantee is
# patch-bundle-media.cjs, which already fails the Docker build on any mismatch; these are
# a post-build sanity re-check. Stock digest = 1 each, patched = 0.
M="$(docker run --rm --entrypoint sh "$IMAGE" -c 'grep -oF "mimetype?.startsWith" dist/main.js | wc -l' | tr -d '[:space:]')"
echo "    mimetype?.startsWith occurrences = $M (expect 0)"
[ "$M" = "0" ] || { echo "ERROR: expected 0 crashing isImage exprs in patched bundle, got $M"; exit 1; }
F2="$(docker run --rm --entrypoint sh "$IMAGE" -c 'grep -oF "!u&&{filename" dist/main.js | wc -l' | tr -d '[:space:]')"
echo "    !u&&{filename (audio filename bug) occurrences = $F2 (expect 0)"
[ "$F2" = "0" ] || { echo "ERROR: expected 0 audio-filename bug exprs in patched bundle, got $F2"; exit 1; }

echo "==> Verifying version is still 2.2.3 (drop-in)"
docker run --rm --entrypoint sh "$IMAGE" -c 'grep "\"version\"" package.json | head -1'

echo ""
echo "==> OK. Built and verified $IMAGE"
echo "    Deploy ONLY this service (never a global up):"
echo "      cd /opt/atlas/infra && docker compose -p atlas up -d --no-deps --force-recreate evolution-api"
