#!/usr/bin/env bash
# Deploy to Vercel without leaking local .env / .env.local into the build.
# The Vercel CLI uploads .env and .env.local when present — which would
# override the project's Preview/Production env vars (e.g. local
# NEXT_PUBLIC_MOCK_MODE=true or localhost Supabase URLs).
#
# Usage:
#   bash scripts/deploy.sh            # preview deployment
#   bash scripts/deploy.sh prod       # production deployment
set -euo pipefail

cd "$(dirname "$0")/.."

PROD="${1:-}"
MOVED=()
restore() {
  for f in "${MOVED[@]:-}"; do
    [ -n "$f" ] && mv "$f.bak" "$f" || true
  done
}
trap restore EXIT

for f in .env .env.local; do
  if [ -f "$f" ]; then
    mv "$f" "$f.bak"
    MOVED+=("$f")
    echo "hidden $f for this deploy"
  fi
done

if [ "$PROD" = "prod" ]; then
  vercel deploy --prod --yes
else
  vercel deploy --yes
fi
