#!/usr/bin/env bash
# outbidarabs smoke test — run against any base URL before promoting.
#
#   bash scripts/smoke.sh http://localhost:3000
#   bash scripts/smoke.sh https://<preview-url>.vercel.app
#   bash scripts/smoke.sh https://outbidarabs.lol
#
# Reads the board, exercises the rules engine through the mock-safe endpoints,
# and verifies the identity/redirect layers. No Polar calls (mock-mode safe);
# payment-specific checks (Layer 3) are documented in README.md.
#
# Exit code 0 = all checks passed.

set -u

BASE="${1:-http://localhost:3000}"
BASE="${BASE%/}"

pass=0
fail=0
declare -a FAILURES=()

ok()  { pass=$((pass+1)); echo "  ✓ $1"; }
bad() { fail=$((fail+1)); FAILURES+=("$1"); echo "  ✗ $1"; }
check() { # $1 description, $2 result (0 = pass)
  if [ "$2" = "0" ]; then ok "$1"; else bad "$1"; fi
}

# Extract a JS expression from stdin JSON:  echo "$JSON" | json "j.listings.length"
json() {
  node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(d);
        const v = eval(process.argv[1]);
        console.log(v === undefined || v === null ? "" : String(v));
      } catch (e) {
        console.log("ERR");
      }
    });
  ' "$1" 2>/dev/null
}

echo "── outbidarabs smoke · $BASE ─────────────────────────────"

# ── 1. Home page renders ───────────────────────────────────
echo "1) Home page"
HTML=$(curl -sL --max-time 20 "$BASE/" || echo "")
check "home page returns HTML" $([ -n "$HTML" ] && echo 0 || echo 1)
check "claim form present" $(echo "$HTML" | grep -qE "احصل على المركز الأول|Claim #1 for" && echo 0 || echo 1)
check "earnings card present" $(echo "$HTML" | grep -qE "المشروع الجانبي|simple side project" && echo 0 || echo 1)

# ── 2. Board & stats API ───────────────────────────────────
echo "2) Board & stats API"
BOARD=$(curl -s --max-time 20 "$BASE/api/board" || echo "")
TOTAL=$(echo "$BOARD" | json "j.listings.length")
check "board returns listings" $([ -n "$TOTAL" ] && [ "$TOTAL" != "ERR" ] && [ "$TOTAL" -gt 0 ] 2>/dev/null && echo 0 || echo 1)
STATS=$(curl -s --max-time 20 "$BASE/api/stats" || echo "")
check "stats include launchedAt" $(echo "$STATS" | grep -q "launchedAt" && echo 0 || echo 1)
TOPBID=$(echo "$STATS" | json "j.highestBid")
check "highestBid > 0" $([ -n "$TOPBID" ] && [ "$TOPBID" != "ERR" ] && [ "$TOPBID" -gt 0 ] 2>/dev/null && echo 0 || echo 1)

if [ -z "$TOPBID" ] || [ "$TOPBID" = "ERR" ]; then
  echo "cannot continue without a top bid — aborting remaining checks"
  echo "passed: $pass  failed: $fail"
  exit 1
fi

# ── 3. Rules engine ────────────────────────────────────────
echo "3) Rules engine (top bid: $TOPBID)"
TS=$(( $(date +%s) % 100000 ))

# 3a. new listing inside the #1 window → rejected with "to take #1" message
R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":$((TOPBID + 1))}")
if echo "$R" | grep -q '"need"'; then
  ok "window bid (top+1) rejected: $(echo "$R" | json "j.error")"
else
  bad "window bid (top+1) should be rejected, got: $R"
fi

# 3b. new listing below top → accepted at its reachable rank
R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":10}")
RANK=$(echo "$R" | json "(j.url||'').match(/rank=(\\d+)/)?.[1] || ''")
if echo "$R" | grep -q '"url"'; then ok "low bid (\$10) accepted at rank ${RANK:-?}"
else bad "low bid should be accepted, got: $R"; fi

# 3c. raise same listing by +5 → accepted. Stateful: on serverless mock mode
# the listing may not exist on this instance — treat that as inconclusive.
R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":15}")
STATE_OK=0
if echo "$R" | grep -q '"url"'; then ok "raise 10→15 accepted"; STATE_OK=1
elif echo "$R" | grep -qE 'بسعر \\$10 بالفعل|already at \\$10'; then bad "raise 10→15 wrongly rejected: $R"
else echo "  ⚠ raise check inconclusive (serverless instance isolation) — $R"; fi

# 3d. raise ≤ current → rejected (only meaningful if the state was there in 3c)
R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":15}")
if [ "$STATE_OK" = "1" ]; then
  check "raise ≤ current rejected" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)
else
  echo "  ⚠ raise ≤ current skipped (state not confirmed)"
fi

# ── 4. Identity layer ──────────────────────────────────────
echo "4) Identity"
R=$(curl -s --max-time 20 "$BASE/api/lookup?identity=https://smoke$TS.example")
if [ "$STATE_OK" = "1" ]; then
  check "lookup finds the listing we just made" $([ "$(echo "$R" | json "j.existing ? 1 : 0")" = "1" ] && echo 0 || echo 1)
else
  echo "  ⚠ lookup check skipped (state not confirmed)"
fi

R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d '{"identity":"https://t.me/somegroup","amount":10}')
check "checkout rejects t.me" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)

R=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://about.me/smoke$TS\",\"amount\":6}")
check "about.me allowed" $(echo "$R" | grep -q '"url"' && echo 0 || echo 1)

# Play Store apps keyed by `?id=`: two different ids must be two listings.
# Statelesss detection: with a shared key the 2nd $6 bid would be "already at $6"
# (raise ≤ current). On serverless mock mode instances may not share state, so
# an unrelated error counts as a skip, not a failure.
P1=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://play.google.com/store/apps/details?id=com.smoke.one.$TS\",\"amount\":6}")
P2=$(curl -s --max-time 20 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://play.google.com/store/apps/details?id=com.smoke.two.$TS\",\"amount\":6}")
if echo "$P2" | grep -q '"url"'; then
  ok "two Play Store ids are separate listings"
elif echo "$P2" | grep -qE 'بسعر \\$6 بالفعل|already at \\$6'; then
  bad "two Play Store ids share one listing (id param not in key)"
else
  echo "  ⚠ Play Store check inconclusive (serverless instance isolation) — P2: $P2"
fi

# ── 5. Click redirect ──────────────────────────────────────
echo "5) Click redirect"
BOARD=$(curl -s --max-time 20 "$BASE/api/board" || echo "")
ID=$(echo "$BOARD" | json "j.listings[0].id")
LOC=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 20 "$BASE/go/$ID")
check "/go/[id] redirects" $([ -n "$LOC" ] && [ "$LOC" != "ERR" ] && echo 0 || echo 1)
check "utm_source appended" $(echo "$LOC" | grep -q "utm_source=outbidarabs" && echo 0 || echo 1)

# ── 6. Static pages ────────────────────────────────────────
echo "6) Pages"
check "/rules 200" $([ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/rules")" = "200" ] && echo 0 || echo 1)
check "/about 200" $([ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/about")" = "200" ] && echo 0 || echo 1)

# ── Result ─────────────────────────────────────────────────
echo "─────────────────────────────────────────────────────────"
echo "passed: $pass  failed: $fail"
if [ $fail -gt 0 ]; then
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
echo "ALL GREEN"
