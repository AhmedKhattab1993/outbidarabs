#!/usr/bin/env bash
# Sets the PRODUCTION Polar webhook signing secret in Vercel and redeploys.
#
# The webhook secret is per Polar-ENDPOINT (sandbox endpoint ≠ production
# endpoint). Vercel production must hold the PRODUCTION endpoint's secret,
# otherwise Polar's production webhooks 403 at signature validation and paid
# listings never apply.
#
# Usage:
#   bash scripts/set-prod-webhook-secret.sh            # reads whsec from stdin
#   bash scripts/set-prod-webhook-secret.sh whsec_...  # or as argument
#
# Get it: polar.sh (PRODUCTION org, not sandbox) → Settings → Webhooks →
# your outbidarabs.lol endpoint → Signing secret.
set -euo pipefail
cd "$(dirname "$0")/.."

SECRET="${1:-$(cat)}"
case "$SECRET" in
  whsec_*) ;;
  *) echo "!! not a Polar webhook secret (expected whsec_… prefix)" >&2; exit 1 ;;
esac

# Guard: refuse to overwrite with the known sandbox endpoint secret
if grep -q "^POLAR_WEBHOOK_SECRET=$SECRET$" .env 2>/dev/null; then
  echo "!! this is the SANDBOX secret (it matches local .env) — production needs the production endpoint's secret" >&2
  exit 1
fi

npx vercel env rm POLAR_WEBHOOK_SECRET production --yes >/dev/null 2>&1 || true
printf "%s" "$SECRET" | npx vercel env add POLAR_WEBHOOK_SECRET production
echo "✓ POLAR_WEBHOOK_SECRET updated (production)"
echo "→ redeploying production (env changes need it)…"
bash scripts/deploy.sh prod
echo
echo "Verify (expect a POST /api/webhooks/polar 200 after any new checkout):"
echo "  npx vercel logs <prod-url> | grep webhooks"
