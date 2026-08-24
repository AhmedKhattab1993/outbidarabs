#!/usr/bin/env bash
# Layer-3 helper: bring up the local Dodo test-mode payment loop.
#
#   bash scripts/dev-tunnel-dodo.sh up     # tunnel + webhook endpoint + .env sync + verify
#   bash scripts/dev-tunnel-dodo.sh down   # delete the webhook endpoint + stop the tunnel
#
# What "up" does:
#   1. starts a cloudflared quick tunnel → http://localhost:3000
#   2. registers https://<tunnel>/api/webhooks/dodo on the Dodo TEST account
#      (payment.succeeded only) via the API — no dashboard clicking
#   3. writes the tunnel URL (NEXT_PUBLIC_SITE_URL) + endpoint secret
#      (DODO_WEBHOOK_SECRET) into .env
#   4. verifies the secret against the running dev server
#
# Requires: dev server already running on :3000 (npm run dev, Layer 2 env),
# cloudflared in PATH, and DODO_API_KEY in .env. Restart `npm run dev` after
# "up" so the new env values are picked up. Quick-tunnel URLs change on every
# start — always re-run this script (never reuse an old URL).
set -euo pipefail

ENV_FILE=.env
API=https://test.dodopayments.com
LOG=/tmp/cf-tunnel.log
DESC="local layer-3 tunnel (ephemeral)"

key() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

up() {
  command -v cloudflared >/dev/null || { echo "cloudflared not found"; exit 1; }
  local API_KEY; API_KEY=$(key DODO_API_KEY)
  [ -n "$API_KEY" ] || { echo "DODO_API_KEY missing in $ENV_FILE"; exit 1; }
  curl -s -o /dev/null --max-time 5 http://localhost:3000 || { echo "dev server not running on :3000"; exit 1; }

  echo "starting cloudflared quick tunnel..."
  pkill -f "cloudflared tunnel --url http://localhost:3000" 2>/dev/null || true
  nohup cloudflared tunnel --url http://localhost:3000 --no-autoupdate >"$LOG" 2>&1 &
  local URL=""
  for _ in $(seq 1 15); do
    sleep 2
    URL=$(grep -o 'https://[a-z-]*\.trycloudflare\.com' "$LOG" | head -1 || true)
    [ -n "$URL" ] && break
  done
  [ -n "$URL" ] || { echo "tunnel failed — see $LOG"; exit 1; }
  echo "tunnel: $URL"

  echo "registering webhook endpoint on Dodo test account..."
  local EP; EP=$(curl -s --max-time 20 -X POST "$API/webhooks" \
    -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
    -d "{\"url\":\"$URL/api/webhooks/dodo\",\"description\":\"$DESC\",\"filter_types\":[\"payment.succeeded\"]}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  echo "endpoint: $EP"

  local SECRET; SECRET=$(curl -s --max-time 20 "$API/webhooks/$EP/secret" \
    -H "Authorization: Bearer $API_KEY" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["secret"])')

  sed -i.bak "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=$URL|" "$ENV_FILE"
  sed -i "s|^DODO_WEBHOOK_SECRET=.*|DODO_WEBHOOK_SECRET=$SECRET|" "$ENV_FILE"
  echo ".env updated (NEXT_PUBLIC_SITE_URL, DODO_WEBHOOK_SECRET) — restart npm run dev"

  sleep 3
  SMOKE_BASE=http://localhost:3000 node scripts/verify-dodo-secret.mjs
  echo "endpoint id (for teardown): $EP" > /tmp/dodo-tunnel-endpoint
  echo "✓ layer-3 loop ready: $URL (restart npm run dev, then pay with 4242 4242 4242 4242 / 06/32 / 123)"
}

down() {
  local API_KEY; API_KEY=$(key DODO_API_KEY)
  local EP; EP=$(grep -o 'ep_[A-Za-z0-9]*' /tmp/dodo-tunnel-endpoint 2>/dev/null || true)
  # fall back: any endpoint whose URL is a trycloudflare tunnel
  if [ -z "$EP" ]; then
    EP=$(curl -s --max-time 20 "$API/webhooks" -H "Authorization: Bearer $API_KEY" \
      | python3 -c 'import json,sys; print(" ".join(w["id"] for w in json.load(sys.stdin)["data"] if "trycloudflare.com" in w["url"]))')
  fi
  for id in $EP; do
    echo "deleting endpoint $id"
    curl -s -X DELETE "$API/webhooks/$id" -H "Authorization: Bearer $API_KEY" -o /dev/null
  done
  pkill -f "cloudflared tunnel --url http://localhost:3000" 2>/dev/null || true
  echo "✓ torn down"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 [up|down]"; exit 1 ;;
esac
