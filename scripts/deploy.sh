#!/usr/bin/env bash
# Deploy to Vercel without leaking local .env / .env.local into the build.
# The Vercel CLI uploads .env and .env.local when present — which would
# override the project's Preview/Production env vars (e.g. local
# NEXT_PUBLIC_MOCK_MODE=true or localhost Supabase URLs).
#
# Usage:
#   bash scripts/deploy.sh            # preview deployment + re-alias staging
#   bash scripts/deploy.sh prod       # production deployment
#   bash scripts/deploy.sh --no-alias # preview without touching the alias
set -euo pipefail

cd "$(dirname "$0")/.."

PROD=""
ALIAS="true"
for arg in "$@"; do
  case "$arg" in
    prod) PROD="1" ;;
    --no-alias) ALIAS="" ;;
  esac
done

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

URL=""
if [ "$PROD" = "1" ]; then
  URL="$(vercel deploy --prod --yes 2>&1 | tee /dev/stderr | grep -oE 'https://outbidarabs-[a-z0-9]+-akteam93\.vercel\.app' | head -1)"
else
  URL="$(vercel deploy --yes 2>&1 | tee /dev/stderr | grep -oE 'https://outbidarabs-[a-z0-9]+-akteam93\.vercel\.app' | head -1)"
fi

if [ -z "$URL" ]; then
  echo "!! could not parse deployment URL" >&2
  exit 1
fi

if [ "$PROD" != "1" ] && [ "$ALIAS" = "true" ]; then
  echo "re-aliasing staging.outbidarabs.lol → $URL"
  vercel alias set "$URL" staging.outbidarabs.lol
fi
