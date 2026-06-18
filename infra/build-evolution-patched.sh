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
# Produces local image:  atlas-evolution:2.2.3-atlas1
# Requires: docker (+ network to pull the base digest once). This script DOES NOT deploy.

set -euo pipefail

IMAGE="atlas-evolution:2.2.3-atlas1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"   # build context = infra/ (so Dockerfile's `COPY patches/...` resolves)

echo "==> Building $IMAGE  (FROM pinned 2.2.3 digest + bundle no-refire patch)"
docker build -f Dockerfile.evolution -t "$IMAGE" .

echo "==> Verifying patched bundle: continueChat count (expect 1; stock digest = 3)"
N="$(docker run --rm --entrypoint sh "$IMAGE" -c 'grep -o continueChat dist/main.js | wc -l' | tr -d '[:space:]')"
echo "    continueChat occurrences = $N"
[ "$N" = "1" ] || { echo "ERROR: expected 1 continueChat in patched bundle, got $N"; exit 1; }

echo "==> Verifying version is still 2.2.3 (drop-in)"
docker run --rm --entrypoint sh "$IMAGE" -c 'grep "\"version\"" package.json | head -1'

echo ""
echo "==> OK. Built and verified $IMAGE"
echo "    Deploy ONLY this service (never a global up):"
echo "      cd /opt/atlas/infra && docker compose -p atlas up -d --no-deps --force-recreate evolution-api"
