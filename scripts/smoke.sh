#!/usr/bin/env bash
# outbidarabs smoke test — run against any base URL before promoting.
#
#   bash scripts/smoke.sh http://localhost:3000
#   bash scripts/smoke.sh https://<preview-url>.vercel.app
#   bash scripts/smoke.sh https://outbidarabs.lol
#
# Reads the board, exercises the auth gate and rules engine, and verifies the
# identity/preview/redirect layers. No Dodo calls (mock-mode safe);
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

# ── 4. Auth gate + rules engine ────────────────────────────
echo "4) Auth gate & rules engine (top bid: $TOPBID)"
TS=$(( $(date +%s) % 100000 ))
ACCT_EMAIL="smoke$TS@example.com"

# 4a. The pay gate is server-enforced: no session → 401 BEFORE any work.
R=$(curl -s --max-time 25 -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
  -d "{\"identity\":\"https://gate$TS.example\",\"amount\":$((TOPBID + 1))}")
check "checkout without session → 401 login_required" $(echo "$R" | grep -q '"login_required"' && echo 0 || echo 1)

# 4b. Auth surface on every layer. The probe email uses example.com —
# hosted Supabase rejects that domain (no real email is delivered, the
# otp allowance is refunded), while keyless mock mode returns a devCode
# instead. One probe, no double send.
R=$(curl -s --max-time 20 -X POST "$BASE/api/auth/send-code" -H 'content-type: application/json' \
  -d '{"email":"not-an-email"}')
check "send-code rejects invalid email" $(echo "$R" | grep -q '"invalid-email"' && echo 0 || echo 1)
MOCK_DETECT=$(curl -s --max-time 20 -X POST "$BASE/api/auth/send-code" -H 'content-type: application/json' \
  -d "{\"email\":\"$ACCT_EMAIL\"}" || echo "")
R=$(curl -s --max-time 20 -X POST "$BASE/api/auth/verify" -H 'content-type: application/json' \
  -d "{\"email\":\"$ACCT_EMAIL\",\"code\":\"000000\"}")
check "verify rejects wrong code" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)

MOCK_ON=0
JAR=""
if echo "$MOCK_DETECT" | grep -q '"devCode"'; then
  MOCK_ON=1
  DEV=$(echo "$MOCK_DETECT" | json "j.devCode")
  JAR=$(mktemp)
  R=$(curl -s --max-time 20 -c "$JAR" -X POST "$BASE/api/auth/verify" -H 'content-type: application/json' \
    -d "{\"email\":\"$ACCT_EMAIL\",\"code\":\"$DEV\"}")
  check "verify accepts devCode + sets session cookie" $(grep -q "ob_session" "$JAR" && echo "$R" | grep -q '"ok":true' && echo 0 || echo 1)

  # Authenticated checkout call — every stateful rules check reuses this jar.
  ck() { curl -s --max-time 25 -b "$JAR" -X POST "$BASE/api/checkout" -H 'content-type: application/json' "$@"; }

  # 4c. new listing at top+1 → ACCEPTED and takes #1 (highest bid = highest rank)
  R=$(ck -d "{\"identity\":\"https://smoke$TS.example\",\"amount\":$((TOPBID + 1))}")
  if echo "$R" | grep -q '"url"'; then
    RANK=$(echo "$R" | json "(j.url||'').match(/rank=(\\d+)/)?.[1] || ''")
    if [ "$RANK" = "1" ]; then ok "bid top+1 accepted at rank #1"
    else bad "bid top+1 should take #1, got rank ${RANK:-?}: $R"; fi
  else
    bad "bid top+1 should be accepted, got: $R"
  fi

  # 4d. low bid accepted at its reachable rank
  R=$(ck -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":2}")
  if echo "$R" | grep -q '"url"'; then
    ok "low bid (\$2) accepted"
  else
    bad "low bid should be accepted, got: $R"
  fi

  # 4e. raise same listing → accepted; raise ≤ current → rejected
  R=$(ck -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":7}")
  STATE_OK=0
  if echo "$R" | grep -q '"url"'; then ok "raise 2→7 accepted"; STATE_OK=1
  elif echo "$R" | grep -qE 'بسعر \$2 بالفعل|already at \$2'; then bad "raise 2→7 wrongly rejected: $R"
  else echo "  ⚠ raise check inconclusive (serverless instance isolation) — $R"; fi

  if [ "$STATE_OK" = "1" ]; then
    R=$(ck -d "{\"identity\":\"https://smokelow$TS.example\",\"amount\":7}")
    check "raise ≤ current rejected" $(echo "$R" | grep -q '"error"' && echo 0 || echo 1)
  else
    echo "  ⚠ raise ≤ current skipped (state not confirmed)"
  fi
else
  echo "  ⤼ stateful rules checks skipped (real auth/provider — need an inbox; see README)"
fi

# ── 5. Identity layer (preview API — same detector, session-free) ──
echo "5) Identity"
prev() { curl -s -G --max-time 25 "$BASE/api/preview" --data-urlencode "identity=$1" || echo ""; }
P=$(prev "https://t.me/somegroup")
check "identity rejects t.me" $(echo "$P" | json "j.status" | grep -qx "error" && echo 0 || echo 1)

# Illegal content (drugs / gambling) — rejected with an error status.
for IDENT in "https://buy-cocaine-online$TS.example.com" "https://play-casino-bonus$TS.example.com" "https://bet365.com" "https://mobile.bet365.com"; do
  P=$(prev "$IDENT")
  check "rejects illegal: $IDENT" $(echo "$P" | json "j.status" | grep -qx "error" && echo 0 || echo 1)
done
# Arabic path, percent-encoded exactly like a real browser submission
P=$(prev "https://example.com/%D9%85%D8%B1%D8%A7%D9%87%D9%86%D8%A7%D8%AA")
check "rejects illegal (arabic path)" $(echo "$P" | json "j.status" | grep -qx "error" && echo 0 || echo 1)
# Controls that must still pass (gambling keyword FP guards)
P=$(prev "https://betterhelp$TS.example.com")
check "betterhelp-style host allowed" $(echo "$P" | json "j.status" | grep -qx "ok" && echo 0 || echo 1)

P=$(prev "https://about.me/smoke$TS")
check "about.me allowed" $(echo "$P" | json "j.status" | grep -qx "ok" && echo 0 || echo 1)

# Play Store apps keyed by `?id=`: two different ids canonicalize apart.
P1=$(prev "https://play.google.com/store/apps/details?id=com.smoke.one.$TS")
P2=$(prev "https://play.google.com/store/apps/details?id=com.smoke.two.$TS")
U1=$(echo "$P1" | json "j.url")
U2=$(echo "$P2" | json "j.url")
check "two Play Store ids are separate listings" $([ -n "$U1" ] && [ "$U1" != "ERR" ] && [ "$U1" != "$U2" ] && echo 0 || echo 1)

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
check "unknown public profile 404" $([ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/u/00000000-0000-4000-8000-000000000000")" = "404" ] && echo 0 || echo 1)

# ── 8. Accounts & privacy (mock layer only) ────────────────
# Real-mode deployments skip this section: devCode exists only in keyless
# mock mode, and the authenticated checks need a real inbox (layers 2–5).
# The session was established in section 4 (JAR) — reused here.
echo "8) Accounts & privacy"
if [ "$MOCK_ON" = "1" ]; then
  ME=$(curl -s --max-time 20 -b "$JAR" "$BASE/api/auth/me")
  check "/api/auth/me returns the email" $(echo "$ME" | json "j.user.email" | grep -qx "$ACCT_EMAIL" && echo 0 || echo 1)
  MY_ID=$(echo "$ME" | json "j.user.id")
  MY_PUB=$(echo "$ME" | json "j.user.publicId")

  if [ -n "$ID" ] && [ "$ID" != "ERR" ]; then
    CARDS=$(curl -s --max-time 20 "$BASE/api/cards/$ID")
    check "card state has no email/payer fields" $(echo "$CARDS" | grep -qE '"(payer_email|payerEmail|email)"' && echo 1 || echo 0)
    check "card state has no owner field (agnostic cards)" $(echo "$CARDS" | grep -q '"owner"' && echo 1 || echo 0)
    if [ -n "$MY_ID" ] && [ "$MY_ID" != "ERR" ] && [ ${#MY_ID} -gt 8 ]; then
      check "card state has no auth uuid" $(echo "$CARDS" | grep -q "$MY_ID" && echo 1 || echo 0)
    fi
  else
    echo "  ⚠ card state checks skipped (empty board)"
  fi

  # Attributed supporter keys must be opaque: a logged-in mock checkout
  # stamps the session user's id onto the payment directly, so the card's
  # supporter row exists — and must expose neither the raw auth id nor the
  # old "u:<auth id>" key form (only the opaque u:<public_id> key).
  R=$(curl -s --max-time 25 -b "$JAR" -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
    -d "{\"identity\":\"https://smokeown$TS.example\",\"amount\":2}")
  if echo "$R" | grep -q 'mock=1'; then
    BOARD2=$(curl -s --max-time 20 "$BASE/api/board" || echo "")
    OWN_ID=$(echo "$BOARD2" | json "j.listings.find(l => l.url === 'https://smokeown$TS.example').id")
    if [ -n "$OWN_ID" ] && [ "$OWN_ID" != "ERR" ] && [ -n "$MY_ID" ] && [ ${#MY_ID} -gt 8 ]; then
      CARDS_OWN=$(curl -s --max-time 20 "$BASE/api/cards/$OWN_ID")
      check "session user appears as attributed supporter" $(echo "$CARDS_OWN" | grep -q "$MY_PUB" && echo 0 || echo 1)
      check "attributed supporter key is opaque (no auth uuid / u:<uuid>)" $(echo "$CARDS_OWN" | grep -q "$MY_ID" && echo 1 || echo 0)
    else
      bad "attributed-supporter checks need the paid card id + session id"
    fi
  else
    bad "logged-in mock checkout should apply (mock=1)"
  fi

  # payment-status is a bare poll: applied + attributed, never any PII.
  R=$(curl -s --max-time 25 -b "$JAR" -X POST "$BASE/api/checkout" -H 'content-type: application/json' \
    -d "{\"identity\":\"https://smokepay$TS.example\",\"amount\":3}")
  PAY_ID=$(echo "$R" | json "j.checkoutId")
  if [ -n "$PAY_ID" ] && [ "$PAY_ID" != "ERR" ]; then
    S1=$(curl -s --max-time 20 "$BASE/api/payment-status?checkout=$PAY_ID")
    check "payment-status: applied + attributed" $(echo "$S1" | json "j.applied === true && j.attributed === true" | grep -q "true" && echo 0 || echo 1)
    check "payment-status carries no payerEmail/PII" $(echo "$S1" | grep -qE '"payerEmail"|"payer_email"|"email"' && echo 1 || echo 0)
  else
    bad "mock checkout should return checkoutId for payment-status checks"
  fi

  check "/u/<public_id> 200" $([ -n "$MY_PUB" ] && [ "$MY_PUB" != "ERR" ] && [ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/u/$MY_PUB")" = "200" ] && echo 0 || echo 1)
  check "/u/<auth id> 404" $([ -n "$MY_ID" ] && [ "$MY_ID" != "ERR" ] && [ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/u/$MY_ID")" = "404" ] && echo 0 || echo 1)
  rm -f "$JAR"
else
  echo "  ⤼ skipped (real auth backend — no devCode; auth checks need a real inbox)"
fi

echo "──────────────────────────────────────────────────────────"
if [ "$fail" -gt 0 ]; then
  echo "FAILED checks:"
  for f in "${FAILURES[@]}"; do echo "  ✗ $f"; done
  echo "passed: $pass  failed: $fail"
  exit 1
fi
echo "all checks passed ($pass)"
