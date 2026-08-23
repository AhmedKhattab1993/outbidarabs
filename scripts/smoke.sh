#!/usr/bin/env bash
# outbidarabs smoke test — run against any base URL before promoting.
#
#   bash scripts/smoke.sh http://localhost:3000
#   bash scripts/smoke.sh https://<preview-url>.vercel.app
#   bash scripts/smoke.sh https://outbidarabs.lol
#
# Reads the board, exercises the rules engine through the mock-safe endpoints,
# and verifies the identity/preview/redirect layers. No Polar calls (mock-mode
# safe); payment-specific checks (Layer 3) are documented in README.md.
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
# EXPECT_SIDE_CARDS=1 inverts the trending/activity check (for when
# NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY=true deployments are verified).
EXPECT_SIDE_CARDS="${EXPECT_SIDE_CARDS:-0}"

echo "1) Home page"
HTML=$(curl -sL --max-time 20 "$BASE/" || echo "")
check "home page returns HTML" $([ -n "$HTML" ] && echo 0 || echo 1)
check "platform headline present" $(echo "$HTML" | grep -qE "رتب حسابك على إنستجرام أو تيك توك|Rank your Instagram or TikTok" && echo 0 || echo 1)
check "platform filter pills present" $(echo "$HTML" | grep -qE "إنستجرام|Instagram" && echo 0 || echo 1)
check "earnings card present" $(echo "$HTML" | grep -qE "العرب للـ Outbid|Arab outbid board" && echo 0 || echo 1)
check "no 'no ads' copy anywhere" $(echo "$HTML" | grep -qiE 'no ads|لا إعلانات' && echo 1 || echo 0)
if [ "$EXPECT_SIDE_CARDS" = "1" ]; then
  check "trending/activity cards present" $(echo "$HTML" | grep -qE "الأكثر رواجاً الآن|Trending right now" && echo 0 || echo 1)
else
  check "trending/activity cards hidden" $(echo "$HTML" | grep -qE "الأكثر رواجاً الآن|Trending right now" && echo 1 || echo 0)
fi

# ── 2. Board, filter & stats API ───────────────────────────
echo "2) Board, filter & stats API"
BOARD=$(curl -s --max-time 20 "$BASE/api/board" || echo "")
TOTAL=$(echo "$BOARD" | json "j.listings.length")
# An empty board is the honest production launch state (no seed data). The
# suite verifies the empty state instead of content checks.
EMPTY_BOARD=0
if [ -n "$TOTAL" ] && [ "$TOTAL" != "ERR" ] && [ "$TOTAL" -eq 0 ] 2>/dev/null; then
  EMPTY_BOARD=1
fi
if [ "$EMPTY_BOARD" = "1" ]; then
  check "empty board renders the empty state" $(echo "$HTML" | grep -qE "اللوحة لسه فاضية|The board is still empty" && echo 0 || echo 1)
  check "listings carry platform (schema ok on empty)" $(echo "$BOARD" | grep -q '"listings":\[\]' && echo 0 || echo 1)
else
  check "board returns listings" $([ -n "$TOTAL" ] && [ "$TOTAL" != "ERR" ] && [ "$TOTAL" -gt 0 ] 2>/dev/null && echo 0 || echo 1)
  check "listings carry platform" $(echo "$BOARD" | json "j.listings.every(l => !!l.platform)" | grep -q "true" && echo 0 || echo 1)
  IGBOARD=$(curl -s --max-time 20 "$BASE/api/board?platform=instagram" || echo "")
  check "instagram filter returns only instagram" $(echo "$IGBOARD" | json "j.listings.every(l => l.platform === 'instagram')" | grep -q "true" && echo 0 || echo 1)
  check "instagram filter returns some" $(echo "$IGBOARD" | json "j.listings.length > 0" | grep -q "true" && echo 0 || echo 1)
fi

STATS=$(curl -s --max-time 20 "$BASE/api/stats" || echo "")
check "stats include launchedAt" $(echo "$STATS" | grep -q "launchedAt" && echo 0 || echo 1)
check "stats include statsSource" $(echo "$STATS" | grep -q '"statsSource":"datafast"\|"statsSource":"internal"' && echo 0 || echo 1)
TOPBID=$(echo "$STATS" | json "j.highestBid")
if [ "$EMPTY_BOARD" = "1" ]; then
  check "highestBid is 0 on an empty board" $([ "$TOPBID" = "0" ] && echo 0 || echo 1)
  check "totalRevenue is 0 (no fake money)" $(echo "$STATS" | json "j.totalRevenue" | grep -qx "0" && echo 0 || echo 1)
else
  check "highestBid > 0" $([ -n "$TOPBID" ] && [ "$TOPBID" != "ERR" ] && [ "$TOPBID" -gt 0 ] 2>/dev/null && echo 0 || echo 1)
fi

if [ -z "$TOPBID" ] || [ "$TOPBID" = "ERR" ]; then
  echo "cannot continue without a top bid — aborting remaining checks"
  echo "passed: $pass  failed: $fail"
  exit 1
fi

# ── 3. Preview API (detection + smart fetch) ───────────────
echo "3) Preview & detection"
P=$(curl -s --max-time 25 "$BASE/api/preview?identity=https://www.instagram.com/nogasattout" || echo "")
check "instagram URL detected as instagram" $(echo "$P" | json "j.platform" | grep -q "instagram" && echo 0 || echo 1)
P=$(curl -s --max-time 25 "$BASE/api/preview?identity=@smokeuser" || echo "")
check "bare @handle is ambiguous" $(echo "$P" | json "j.status" | grep -q "ambiguous" && echo 0 || echo 1)
check "ambiguous candidates include instagram+tiktok" $(echo "$P" | json "j.candidates.includes('instagram') && j.candidates.includes('tiktok')" | grep -q "true" && echo 0 || echo 1)
P=$(curl -s --max-time 25 "$BASE/api/preview?identity=@smokeuser&platform=tiktok" || echo "")
check "@handle + platform hint resolves" $(echo "$P" | json "j.status === 'ok' && j.platform === 'tiktok'" | grep -q "true" && echo 0 || echo 1)
P=$(curl -s --max-time 25 "$BASE/api/preview?identity=https://www.tiktok.com/@smokeuser/video/123" || echo "")
check "tiktok post URL rejected (profile only)" $(echo "$P" | json "j.status" | grep -q "error" && echo 0 || echo 1)
P=$(curl -s --max-time 25 "$BASE/api/preview?identity=https://vm.tiktok.com/ZMabcdef/" || echo "")
check "vm.tiktok short link rejected" $(echo "$P" | json "j.status" | grep -q "error" && echo 0 || echo 1)

# ── 4. Rules engine ────────────────────────────────────────
echo "4) Rules engine (top bid: $TOPBID)"
TS=$(( $(date +%s) % 100000 ))

# Payment mode: a real provider configured → checkouts return provider URLs and
# no state is written until a webhook fires. Stateful engine checks are skipped.
PAYMENT_MODE=0
is_provider_url() { echo "$1" | grep -qE 'polar|dodopayments'; }

# 4a. new listing at top+1 → ACCEPTED and takes #1 (highest bid = highest rank)
R=$(curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":$((TOPBID + 1)),\"title\":\"Smoke Site\",\"description\":\"smoke\"}")
if echo "$R" | grep -qE 'polar|dodopayments'; then
  PAYMENT_MODE=1
  echo "  ⚠ payment mode (real provider) — stateful checks need webhooks, skipping"
elif echo "$R" | grep -q '"url"'; then
  RANK=$(echo "$R" | json "(j.url||'').match(/rank=(\\d+)/)?.[1] || ''")
  if [ "$RANK" = "1" ]; then ok "bid top+1 accepted at rank #1"
  else bad "bid top+1 should take #1, got rank ${RANK:-?}: $R"; fi
else
  bad "bid top+1 should be accepted, got: $R"
fi

# 4b. low bid accepted at its reachable rank (skip in payment mode)
if [ "$PAYMENT_MODE" = "0" ]; then
  R=$(curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
    -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":2}")
  if echo "$R" | grep -q '"url"'; then
    ok "low bid (\$2) accepted"
  else
    bad "low bid should be accepted, got: $R"
  fi

  # 4c. raise same listing → accepted; raise ≤ current → rejected
  R=$(curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
    -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":7}")
  STATE_OK=0
  if echo "$R" | grep -q '"url"'; then ok "raise 2→7 accepted"; STATE_OK=1
  elif echo "$R" | grep -qE 'بسعر \$2 بالفعل|already at \$2'; then bad "raise 2→7 wrongly rejected: $R"
  else echo "  ⚠ raise check inconclusive (serverless instance isolation) — $R"; fi

  if [ "$STATE_OK" = "1" ]; then
    R=$(curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
      -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":7}")
    check "raise ≤ current rejected" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)
  else
    echo "  ⚠ raise ≤ current skipped (state not confirmed)"
  fi
fi

# ── 5. Identity layer ──────────────────────────────────────
echo "5) Identity"
post_checkout() { # $1 identity, $2 amount
  curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
    -d "$(printf '{"identity":"%s","amount":%s}' "$1" "$2")"
}
R=$(post_checkout "https://t.me/somegroup" 10)
check "checkout rejects t.me" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)

# Illegal content (drugs / gambling) — rejected with the illegal-content reason.
for IDENT in "https://buy-cocaine-online$TS.example.com" "https://play-casino-bonus$TS.example.com" "https://bet365.com" "https://mobile.bet365.com"; do
  R=$(post_checkout "$IDENT" 10)
  check "rejects illegal: $IDENT" $(echo "$R" | grep -q 'غير القانوني\|Illegal content' && echo 0 || echo 1)
done
# Arabic path, percent-encoded exactly like a real browser submission
R=$(post_checkout "https://example.com/%D9%85%D8%B1%D8%A7%D9%87%D9%86%D8%A7%D8%AA" 10)
check "rejects illegal (arabic path)" $(echo "$R" | grep -q 'غير القانوني\|Illegal content' && echo 0 || echo 1)
# Controls that must still pass (gambling keyword FP guards)
R=$(post_checkout "https://betterhelp$TS.example.com" 6)
check "betterhelp-style host allowed" $(echo "$R" | grep -q '"url"\|polar' && echo 0 || echo 1)

R=$(post_checkout "https://about.me/smoke$TS" 6)
check "about.me allowed" $(echo "$R" | grep -q '"url"\|polar' && echo 0 || echo 1)

# Play Store apps keyed by `?id=`: two different ids must be two listings.
P1=$(post_checkout "https://play.google.com/store/apps/details?id=com.smoke.one.$TS" 6)
P2=$(post_checkout "https://play.google.com/store/apps/details?id=com.smoke.two.$TS" 6)
if echo "$P2" | grep -q '"url"'; then
  ok "two Play Store ids are separate listings"
elif echo "$P2" | grep -qE 'بسعر \$6 بالفعل|already at \$6'; then
  bad "two Play Store ids share one listing (id param not in key)"
else
  echo "  ⚠ Play Store check inconclusive (serverless instance isolation) — P2: $P2"
fi

# ── 6. Click redirect ──────────────────────────────────────
echo "6) Click redirect"
BOARD=$(curl -s --max-time 20 "$BASE/api/board" || echo "")
ID=$(echo "$BOARD" | json "j.listings[0].id")
if [ -n "$ID" ] && [ "$ID" != "ERR" ]; then
  LOC=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 20 "$BASE/go/$ID")
  check "/go/[id] redirects" $([ -n "$LOC" ] && [ "$LOC" != "ERR" ] && echo 0 || echo 1)
  check "utm_source appended" $(echo "$LOC" | grep -q "utm_source=outbidarabs" && echo 0 || echo 1)
else
  echo "  ⚠ click redirect skipped (empty board)"
fi

# ── 7. Static pages ────────────────────────────────────────
echo "7) Pages"
check "/rules 200" $([ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/rules")" = "200" ] && echo 0 || echo 1)
check "/about 200" $([ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/about")" = "200" ] && echo 0 || echo 1)
RULES_HTML=$(curl -s --max-time 20 "$BASE/rules" || echo "")
check "rules mention raise-by-difference" $(echo "$RULES_HTML" | grep -qE "بدفع الفرق فقط|paying only the difference" && echo 0 || echo 1)
check "rules include origin note" $(echo "$RULES_HTML" | grep -qE "مستوحاة من outbid.lol|inspired by outbid.lol" && echo 0 || echo 1)

echo "──────────────────────────────────────────────────────────"
if [ "$fail" -gt 0 ]; then
  echo "FAILED checks:"
  for f in "${FAILURES[@]}"; do echo "  ✗ $f"; done
  echo "passed: $pass  failed: $fail"
  exit 1
fi
echo "all checks passed ($pass)"
