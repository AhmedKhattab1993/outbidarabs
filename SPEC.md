# SPEC — outbidarabs v1.1 refinement + promotion

Status: draft for review · Scope: 5 changes + full promotion runbook.
All findings below are verified against the current code on `main` (`cc9dcd4`), the live
site (`https://outbidarabs.lol`), the Vercel project env vars, and the official
DataFast docs (fetched 2026‑see git log).

---

## 0. Investigation summary (evidence)

| # | Topic | Verified finding |
|---|---|---|
| 1 | "No ads" copy | 7 occurrences across 5 files (i18n, about, layout metadata, README) |
| 2 | Stats pill ≠ DataFast | **Vercel `DATAFAST_TOKEN` / `DATAFAST_WEBSITE_ID` / `NEXT_PUBLIC_DATAFAST_WEBSITE_ID` all contain the share-key blob `eyJ2IjoidjIi…`** (visible via `vercel env ls`), not an API token / website id. Server-side DataFast fetch 401s → silently returns `null` → pill falls back to internal counters. Live proof: `GET /api/stats` → `{"online":0,"visitors":2}` (internal counters), while the pill links to the real DataFast dashboard (`datafa.st/share/6a8989e679468443a99eb8af`). The client SDK also can't init (`NEXT_PUBLIC_DATAFAST_WEBSITE_ID` wrong → the `dfid_…` tracking id is missing), so DataFast itself under‑counts. One code bug too: `overview?period=all` is not a valid DataFast param (docs: omit `startAt`/`endAt` for all‑time) |
| 3 | Polar × DataFast | Official doc: pass `datafast_visitor_id` + `datafast_session_id` **cookies** as Polar checkout `metadata`; DataFast auto‑attributes revenue, no webhook needed. The DataFast web SDK (already installed, `datafast@3.0.18`) does set these as real cookies. Polar is already connected in DataFast settings (user‑confirmed) |
| 4 | Violations | `identity.ts` only blocks NSFW + chat links + shorteners. No illegal-content filter (drugs, weapons, fraud, gambling…). Rules page (i18n `rulesCan3`) mentions sexual content only |
| 5 | Story | About page, earnings card, metadata still narrate outbid.lol's story verbatim ("started as a simple side project", "A few crazy things that happened since then", "Same rules. Same idea."). New story: same product, inspired by outbid.lol, built for the Arab world |
| 6 | Trending/Activity cards | «الأكثر رواجاً الآن» + «آخر النشاطات» are fully implemented (`TrendingCard`/`ActivityCard`, `/api/board?section=…`, realtime) but must not be visible at launch — hide behind a flag, keep every line of the implementation for re-enabling later |

Changes 1 & 5 touch the same strings — implement together (see §5).

---

## 1. Change 1 — Remove all "no ads" references

**Goal:** stop promising "no ads" (may add ads in the future). Remove the reference
everywhere; keep the rest of each sentence intact.

### Files & exact edits

| File | Current | New |
|---|---|---|
| `src/lib/i18n.ts` `rulesIntro` (ar) | `لا إعلانات، لا مفاتيح API، ولا مشاركة أرباح.` | `لا مفاتيح API ولا مشاركة أرباح.` |
| `src/lib/i18n.ts` `rulesIntro` (en) | `There are no ads, no API keys, and no revenue share.` | `No API keys, no revenue share.` |
| `src/app/layout.tsx` `metadata.description` | `…No ads, no API keys, no revenue sharing. Just outbid your competition.` | `…No API keys, no revenue sharing. Just outbid your competition.` |
| `src/app/layout.tsx` `openGraph.description` | `No ads, no API keys, no revenue sharing. Just outbid…` | `No API keys, no revenue sharing. Just outbid…` |
| `src/app/about/page.tsx` `metadata.description` | `لا إعلانات، لا مفاتيح API، ولا مشاركة أرباح — الترتيب هو السعر.` | `لا مفاتيح API ولا مشاركة أرباح — الترتيب هو السعر.` |
| `src/app/about/about-client.tsx` L45/L61 | "لا إعلانات، لا مفاتيح API…" / "no ads, no API keys…" | rewritten wholesale by Change 5 — must not reintroduce the ads clause |
| `README.md` L7 | `No ads, no accounts, no revenue share.` | `No accounts, no revenue share.` |

### Rules
- Only the ads clause is removed. "No API keys / no revenue share / no accounts" stay.
- Grep gate in the PR checklist: `grep -ri "لا إعلانات\|no ads\|ad-free\|إعلانات" src/ README.md`
  must return **zero** UI-facing hits.
- No new "ad-free" promises anywhere in future copy (note in `README.md` style section).

### Acceptance
- [ ] Zero ads references in `src/`, `README.md` (grep above clean)
- [ ] Rules page (AR + EN), About metadata, homepage OG description render without the clause
- [ ] `bash scripts/smoke.sh` still passes (no smoke check depends on the ads text)

---

## 2. Change 2 — Stats pill must mirror DataFast

**Goal:** when a visitor clicks «شاهد الإحصائيات ←» and lands on the DataFast share
dashboard, the numbers they saw in the pill match what DataFast shows. DataFast
becomes the single source of truth when configured; internal counters are only a
fallback.

### 2a. Fix the environment (root cause — do this first)

The Vercel variables were pasted from the share URL instead of the API values:

| Var | Current (wrong) | Correct value | Where to get it |
|---|---|---|---|
| `DATAFAST_TOKEN` | `eyJ2IjoidjIi…` share blob | `df_…` website API key (preferred) or `dft_…` account token with `analytics:read` | DataFast → Website settings → API (or `datafast websites apikeys create`) |
| `DATAFAST_WEBSITE_ID` | `eyJ2IjoidjIi…` | mongo-style website id (the share id is `6a8989e679468443a99eb8af` — likely the same; verify via `datafast websites list`) | DataFast dashboard / CLI |
| `NEXT_PUBLIC_DATAFAST_WEBSITE_ID` | `eyJ2IjoidjIi…` | `dfid_…` tracking id from the website's script snippet | DataFast → Website → script/SDK config |
| `NEXT_PUBLIC_ANALYTICS_URL` | ✅ already correct (`https://datafa.st/share/6a8989e679468443a99eb8af`) | keep | — |

Apply for **both** Production and Preview (staging site has its own DataFast website
or shares this one — decide; recommend one website for prod, a second for staging so
numbers don't mix; then staging gets its own `dfid_` + share URL).

```bash
vercel env rm DATAFAST_TOKEN production preview      # repeat for the other two vars
vercel env add DATAFAST_TOKEN                        # paste df_… ; target: production+preview
vercel env add DATAFAST_WEBSITE_ID
vercel env add NEXT_PUBLIC_DATAFAST_WEBSITE_ID
bash scripts/deploy.sh && bash scripts/deploy.sh prod   # env changes require redeploy
```

### 2b. Fix `src/lib/datafast.ts` to match the real API

Verified against `https://datafa.st/docs/api/website/analytics/{realtime,overview}.md`:

1. **Overview call:** remove the invalid `period=all` param — all-time = omit
   `startAt`/`endAt`. Add `fields=visitors,pageviews` to shrink the payload.
2. **Realtime call:** add `fields=visitors`.
3. **Token-type awareness:** if token starts with `df_` → omit `websiteId` (the key
   implies the website; passing it may error). If `dft_` → require `websiteId`.
4. **Envelope check:** success responses are `{ "status": "success", "data": [ … ] }` —
   check `status` explicitly, keep the 4s timeout and 60s cache.
5. Log fetch failures once per warm instance (`console.warn("datafast fetch failed", path, status)`)
   so silent nulls are visible in Vercel logs.

### 2c. Make the pill show exactly what DataFast says (`online-pill.tsx` + `/api/visit`)

- Remove the `s.online > 0` / `s.visitors > 0` guards — if DataFast says 0, show 0
  (today a zero can never replace a stale non-zero).
- `/api/stats` and `/api/visit` responses gain `"statsSource": "datafast" | "internal"`
  so the mismatch is debuggable from the outside (`curl /api/stats | jq .statsSource`).
- When `statsSource === "datafast"`: `online` = DataFast realtime (visitors active in
  the last **10 minutes** — DataFast's window), `visitors` = DataFast all-time. The
  internal heartbeat (90s window) keeps running but is used only for the fallback and
  stays internal — never mixed into the DataFast numbers.
- Copy note (AR): «متصل الآن» remains correct for the 10‑min realtime window; no
  wording change needed.

### Acceptance
- [ ] `curl https://outbidarabs.lol/api/stats` → `statsSource:"datafast"`, and
      `visitors` equals the DataFast dashboard's all-time visitors
- [ ] Pill "online" equals DataFast's realtime tab within one cache window (≤ ~90s:
      60s server cache + 30s poll)
- [ ] With DataFast unreachable (token removed locally), pill falls back to internal
      counters and keeps working (no 0/NaN)
- [ ] smoke.sh: add check — `/api/stats` returns numeric `online`/`visitors` (already
      exists) and a valid `statsSource`

---

## 3. Change 3 — Polar checkout × DataFast revenue attribution

**Goal:** attribute every paid bid to its marketing channel in DataFast, per
<https://datafa.st/docs/polar-checkout-api>. Prerequisite already done: Polar is
connected in DataFast (user‑confirmed). **No webhook, no new env vars.**

### Implementation — `src/app/api/checkout/route.ts`

The DataFast SDK sets first-party cookies `datafast_visitor_id` and
`datafast_session_id` (verified in `datafast/dist/web/index.js`). Pass them into the
Polar checkout metadata:

```ts
// inside the real-Polar branch, before polar.checkouts.create:
const dfVisitor = req.cookies.get("datafast_visitor_id")?.value;
const dfSession = req.cookies.get("datafast_session_id")?.value;
// Polar rejects empty-string metadata values — only send non-empty keys
if (dfVisitor) metadata.datafast_visitor_id = dfVisitor;
if (dfSession) metadata.datafast_session_id = dfSession;
```

Notes:
- Route handler already has `req: NextRequest` — `req.cookies` needs no extra plumbing.
- Mock-payment path is untouched (no Polar checkout exists there).
- Keep `trackEvent("checkout_started")` on the client. **Do not** call the SDK's
  client-side `trackPayment` for Polar purchases — with the Polar integration active
  that would double-count revenue in DataFast (their troubleshooting has a
  "duplicate payments" page). Leave `trackPayment` in `analytics.ts` unused for now.

### Verification (Layer 3, sandbox)
1. Open the site with `?utm_source=test` from a clean browser, start a sandbox checkout.
2. In the Polar sandbox dashboard, open the checkout → metadata must contain both ids.
3. Complete payment with the test card → within minutes the DataFast dashboard shows
   the revenue **with referrer/campaign attribution** (check Revenue tab, filter by
   the `test` source).
4. Confirm no duplicate revenue row (integration import only, no client event).

### Acceptance
- [ ] Sandbox checkout metadata carries `datafast_visitor_id` + `datafast_session_id`
- [ ] DataFast revenue attributed (channel/country visible) for a sandbox payment
- [ ] Production: first real payment appears once (not twice) in DataFast revenue

---

## 4. Change 4 — Extend forbidden content beyond sexual to illegal content

**Goal:** reject listings for illegal content — narcotics/drugs, gambling & betting,
weapons, fraud, counterfeit, stolen accounts/cards, etc. — in addition to existing
NSFW/chat/shortener rules. (These are legally risky in every Arab jurisdiction; sexual
content stays as-is.) **Gambling is blocked regardless of licensing** — even licensed
global operators are illegal or highly restricted across nearly all target Arab
markets, and listing them = promotion.

### `src/lib/identity.ts`

Add alongside `NSFW_PATTERN` / `NSFW_ARABIC` (word-boundary for Latin, substring for
Arabic — same convention, with the same false-positive care):

```ts
// Illegal content: narcotics, gambling, weapons, fraud, counterfeit, stolen goods/accounts.
const ILLEGAL_PATTERN =
  /\b(drugs?|narco|narcotics?|cocaine|heroin|crack|meth(?:amphetamine)?|khat|cannabis|weed4sale|darkweb|onion-market|casino|gambling|betting|sportsbook|bookmaker|poker|lottery|jackpot|roulette|craps|baccarat|slot-?machines?|online-?slots?|arms4sale|weapons?|gun4sale|rifle4sale|counterfeit|forged?(?:-| )?(?:documents?|ids?|passports?|licenses?|banknotes?|money)|carding|stolen(?:-| )?(?:accounts?|cards?)|ccdump|fullz|humantrafficking)\b/i;
const ILLEGAL_ARABIC = [
  "مخدرات", "حشيش", "بانجو", "أفيون", "افيون", "هيروين", "كوكايين", "ترامادول",
  "كبتاجون", "استروكس", "شابو", "كازينو", "قمار", "مقامرة", "مراهنة", "مراهنات",
  "يانصيب", "روليت", "لوتو", "سلاح للبيع", "أسلحة للبيع", "اسلحة للبيع",
  "تزوير", "عملة مزيفة", "حسابات مسروقة", "بطاقات مسروقة", "احتيال إلكتروني",
];

// Major gambling operators targeting the Arab market — matched with the existing
// hostMatches() helper (exact host + subdomains). The keyword patterns cannot catch
// these: "bet365"/"1xbet" are single words, and \bbet\b is deliberately NOT in the
// pattern (it would block e.g. bet.com — Paramount's BET network). Extend as brands
// and mirrors appear.
const GAMBLING_HOSTS = [
  "1xbet.com", "bet365.com", "melbet.com", "linebet.com", "mostbet.com",
  "betway.com", "unibet.com", "bwin.com", "dafabet.com", "w88.com", "fun88.com",
  "stanleybet.com", "fonbet.com", "betfinal.com",
];
```

- New rejection reason `"illegal"`; checks run after the NSFW check on
  `${u.hostname}${u.pathname}` (same `checkable` string), in order:
  1. `GAMBLING_HOSTS` via existing `hostMatches()` (exact host / subdomain)
  2. `ILLEGAL_PATTERN` (word-boundary) on host + path
  3. `ILLEGAL_ARABIC` substring on host + path
- False-positive guards (keep as code comments):
  - `betting` — yes; bare `bet`/`bets` — no (bet.com = BET TV network; "betterhelp",
    "alphabet" would trip)
  - `lottery` — yes; bare `lotto` — no (Lotto sportswear brand); Arabic "لوتو" covers
    regional usage
  - bare `slots` — no (calendar/scheduling apps use "slots"); only `slot-machines` /
    `online-slots`
  - `casino`/`poker`/`jackpot` — near-unambiguous at a word boundary, accepted risk
  - Known gap: concatenated compounds ("arabcasino.com", "888casino.com") evade
    `\b` boundaries — the brand list + manual takedown (`is_active = false`) are the
    backstop
- `identityErrorMessages`: add
  `illegal: { ar: "المحتوى غير القانوني ممنوع (مخدرات، قمار، أسلحة، احتيال…)", en: "Illegal content is not allowed (drugs, gambling, weapons, fraud…)" }`.
- The pattern list is a **denylist, not moderation** — document in code comment and
  rules page that listings may be removed manually (`listings.is_active = false`).

### Rules page copy — `src/lib/i18n.ts`

- `rulesCan3` (ar): `الروابط لمحتوى جنسي أو غير قانوني ممنوعة — إباحية، مخدرات، قمار ومراهنات، أسلحة، تزوير، احتيال أو حسابات مسروقة: لا مكان لها على اللوحة.`
- `rulesCan3` (en): `Links to sexual or illegal content are not allowed — porn, drugs, gambling and betting, weapons, counterfeit documents, fraud, or stolen accounts do not belong on the board.`
- (Optional) split into two bullets `rulesCan3` / `rulesCan3b` — keep one bullet to
  avoid renumbering the page.

### Tests — `scripts/smoke.sh` (§4 identity checks)

Add mock-mode rejections (expect HTTP 400 with the new message):
`https://buy-cocaine-online.example.com`, `https://play-casino-bonus.example.com`,
`https://bet365.com` (plus a subdomain, e.g. `https://mobile.bet365.com`),
`example.com/مخدرات`, `example.com/مراهنات`, and controls that must still pass:
`https://coffee.shop` and `https://betterhelp.com` ("bet…" substring, not "betting"
at a word boundary).

### Acceptance
- [ ] Drug/weapon/fraud URLs (EN + AR) rejected with the new message; innocent
      look-alikes pass
- [ ] Gambling rejected both ways: keyword (`play-casino-bonus…`, `مراهنات`) and
      brand-host (`bet365.com` incl. subdomain); `betterhelp.com` still passes
- [ ] Rules page (AR + EN) states the extended policy
- [ ] smoke.sh green, including the new identity cases

---

## 5. Change 5 — Rewrite the story: from "clone copy" to "inspired by outbid.lol"

**Goal:** the product is the same mechanic, openly credited: *inspired by outbid.lol,
built as the Arab-world edition*. Remove the copied narrative that reads as if we are
outbid.lol ("started as a simple side project", "A few crazy things that happened",
"The board is still here. Same rules. Same idea.").

### `src/app/about/about-client.tsx` — new narrative (AR example)

- Keep: launch sentence, milestones list (they're data-driven), footer credit
  `مستوحاة من outbid.lol`.
- Replace the three story paragraphs with (AR):

  > «شاهدنا <outbid.lol> وتابعنا كيف تحولت فكرة بسيطة — الترتيب هو السعر — إلى سباق
  > مفتوح. أعجبتنا الفكرة كثيراً، فقررنا نبني نسختنا العربية منها: نفس القواعد، نفس
  > الشفافية، لكن بالعربية وبواجهة RTL ودفع يعمل مع بطاقات المنطقة — لرواد الأعمال
  > والمبدعين في مصر والسعودية والإمارات والكويت وقطر والبحرين والأردن والمغرب وكل
  > العالم العربي. هذه ليست ترجمة؛ إنها اللوحة العربية للـ Outbid.»

  and the closing line: «الترتيب هو السعر — لا شيء غير ذلك.»
- EN mirror: "We watched outbid.lol turn 'rank is the bid' into an open race — and we
  loved the idea enough to build the Arab-world edition: same rules, same
  transparency, Arabic-first, RTL, payments that work with regional cards… This is
  not a translation; it is the Arab outbid board."
- Remove `t.crazyThings` phrasing → `أبرز الأرقام منذ الإطلاق:` / `By the numbers since launch:`.

### `src/lib/i18n.ts`

| Key | Now | New |
|---|---|---|
| `earningsPrefix/Highlight/Suffix` | «هذا المشروع الجانبي البسيط جنى…» / "This simple side project made…" | «لوحة العرب للـ Outbid جنّت…» / "The Arab outbid board has made…" |
| `crazyThings` | «بعض الأشياء المجنونة…» | «أبرز الأرقام منذ الإطلاق:» |
| `inspiredBy` | keep (already correct credit) | keep |

⚠️ **smoke.sh dependency:** the earnings-card check greps
`"المشروع الجانبي|simple side project"` — update the pattern in the same commit
(e.g. `"لوحة العرب|Arab outbid board"`).

### `src/app/layout.tsx` + `src/app/about/page.tsx` metadata

- description (both): «أول لوحة عربية للـ Outbid — مستوحاة من outbid.lol. الترتيب هو السعر.» /
  "The Arab-world outbid leaderboard — inspired by outbid.lol. Rank is the bid." (+ Change 1 removes the ads clause here).

### `README.md`

- L5–7: replace "An Arab-world clone of outbid.lol" with "Inspired by
  [outbid.lol](https://outbid.lol) — the Arab-world edition of the live pay-to-rank
  leaderboard." (keep the mechanics description; drop "No ads" per Change 1).

### Launch date truthfulness

`LAUNCH_ISO` defaults to `2025-08-21T20:00:00Z` (the reference's date, hardcoded in
`i18n.ts`). During promotion set `NEXT_PUBLIC_LAUNCH_DATE` (Production) to the **real**
go-live timestamp so "since its launch" durations and the earnings card are honest.

### Acceptance
- [ ] About (AR + EN) tells the inspired-by story; no "simple side project / crazy
      things / same idea" remnants
- [ ] Earnings card copy updated + smoke.sh pattern updated
- [ ] outbid.lol is credited with a link on the About page and footer
- [ ] `NEXT_PUBLIC_LAUNCH_DATE` set to the real launch date on Production

---

## 6. Change 6 — Hide «الأكثر رواجاً الآن» + «آخر النشاطات» (keep implementation)

**Goal:** the two side cards (Trending / Latest activity) must not render on the
homepage at launch, but the whole implementation stays in the codebase and keeps
collecting data — re-enabling later must be a config change, not a code change.

### Mechanism — one env flag, default hidden

`NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY` — `"true"` shows the cards; unset or any other
value hides them. **Default (unset) = hidden**, so any future deploy without the var
stays hidden. One flag covers both cards (they render as a 2-column pair); split into
`…_TRENDING` / `…_ACTIVITY` later only if they should return separately.

Why a flag instead of deleting: (a) re-enable = set env + redeploy, zero code edits;
(b) staging can show them for QA while production stays hidden.

### `src/app/page.tsx` (server — skip the work, don't just hide it)

```ts
const showSideCards = process.env.NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY === "true";
const [board, trending, activity, stats, top] = await Promise.all([
  getLeaderboard(page),
  showSideCards ? getTrending(5) : Promise.resolve([]),
  showSideCards ? getActivity(5) : Promise.resolve([]),
  getStats(),
  getTopListing(),
]);
// …pass showSideCards to <HomeClient>
```

Hidden ≠ "fetch then don't render": the two Supabase queries are skipped entirely on
every homepage render (faster TTFB, fewer DB round-trips).

### `src/components/home-client.tsx` (client)

- Accept a `showSideCards: boolean` prop (server-computed — not re-read from env in
  the bundle; keeps one source of truth and makes it prop-testable).
- Conditionally render the **entire** grid wrapper (`div.mb-6.grid …` containing
  `<TrendingCard>` + `<ActivityCard>`) — no empty box, no orphaned `mb-6` gap between
  the claim form and the leaderboard.
- In `refresh()`: only fetch `/api/board?section=trending` + `?section=activity` when
  the flag is on; hidden refreshes hit just `/api/board?page=…` + `/api/stats`
  (halves the payload of the 12s poll / realtime refresh).
- Realtime subscriptions stay unchanged — `listings` + `activity` table subscriptions
  remain as-is (board refreshes still needed; the `activity` subscription is harmless
  and part of the intact implementation).

### Explicitly untouched (the "keep implementation" part)

- `TrendingCard`, `ActivityCard`, `ShowMore` in `src/components/boards-cards.tsx`
- `/api/board?section=trending|activity` endpoints and `getTrending`/`getActivity`
  in `src/lib/store.ts`
- i18n keys (`trending`, `clicksPerHour`, `latestActivity`, `showMore`, `at`, time-ago)
- Click tracking (`/go/[id]` + `clicks` table) — keeps collecting the data that feeds
  Trending, so when the card returns it has history from day one

### Config & docs

- `.env.example`: document `NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY` with the default-hidden
  note.
- Vercel: leave **unset** in Production and Preview at launch (see env matrix, §7).
- `README.md`: add the flag to the env-var documentation.

### `scripts/smoke.sh`

Mode-aware check: default run asserts the section headings are **absent** from the
homepage HTML ("الأكثر رواجاً الآن|Trending right now"); `EXPECT_SIDE_CARDS=1`
inverts it to assert presence — so the same script stays correct after re-enabling.

### Acceptance
- [ ] Homepage (AR + EN) shows neither card; no empty grid or spacing gap where they sat
- [ ] Network tab while hidden: zero requests to `?section=trending|activity`
      (initial load + a poll/realtime cycle), and server skips both DB queries
- [ ] Flag `"true"` locally: both cards render with live data and realtime updates —
      no other code change needed
- [ ] `EXPECT_SIDE_CARDS=1` smoke variant green with the flag on; default smoke green hidden

---

## 7. Full promotion & deployment runbook

Nothing reaches `outbidarabs.lol` without the previous layer green. Smoke suite gates
every promotion: `bash scripts/smoke.sh <base-url>`.

### Layer matrix

| Layer | Target | What these changes add/verify |
|---|---|---|
| 1. Local mock | `npm run dev` | new copy (1,5), illegal-content rejections (4), DataFast client code paths (2b — with fake token: must fall back cleanly), Polar cookie passthrough compiles (3), side-cards hidden by default + visible with flag on (6) |
| 2. Local full-stack | Supabase CLI + `ALLOW_MOCK_PAYMENTS=true` | schema unchanged (no migration for this release); identity rejections against the real checkout route; rules-engine regression via smoke.sh |
| 3. Payments | Polar sandbox + tunnel | Change 3 verification steps (§3), incl. metadata ids + DataFast attribution + no duplicate revenue |
| 4. Vercel preview | `bash scripts/deploy.sh` → staging alias | **DataFast env fix (§2a) for Preview**, statsSource=datafast on staging, full smoke suite |
| 5. Production | `bash scripts/deploy.sh prod` | §2a env fix for Production, `NEXT_PUBLIC_LAUNCH_DATE`, real-money test + refund, post-deploy verification below |

### Env matrix (Vercel, after this release)

| Var | Production | Preview (staging) |
|---|---|---|
| `NEXT_PUBLIC_MOCK_MODE` | `false` (Polar prod keys now exist — verify!) | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | prod project | staging project |
| `POLAR_ACCESS_TOKEN` / `POLAR_PRODUCT_ID` / `POLAR_WEBHOOK_SECRET` / `POLAR_ENVIRONMENT=production` | prod | sandbox |
| `NEXT_PUBLIC_SITE_URL` | `https://outbidarabs.lol` | `https://staging.outbidarabs.lol` |
| `DATAFAST_TOKEN` | `df_…` (website key) | staging's own `df_…` |
| `DATAFAST_WEBSITE_ID` | prod website id (verify: `6a8989e679468443a99eb8af`) | staging website id |
| `NEXT_PUBLIC_DATAFAST_WEBSITE_ID` | prod `dfid_…` | staging `dfid_…` |
| `NEXT_PUBLIC_ANALYTICS_URL` | `https://datafa.st/share/6a8989e679468443a99eb8af` (already correct) | staging share URL |
| `NEXT_PUBLIC_LAUNCH_DATE` | real launch ISO | any |
| `NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY` | **unset** (cards hidden) | **unset** (set `true` here first when re-enabling, verify, then promote to Production) |

### Go-live sequence (one-time, ordered)

1. **Branch & implement** all 5 changes on one branch (`feat/v1.1-refinements`).
2. **Layer 1–2** locally: `npm run dev` + local Supabase; run updated smoke.sh → green.
3. **DataFast setup (one-time):**
   - Create website API key(s): DataFast → Website settings → API (`df_…`), or
     `npx @datafast/cli` (npm i -g) → `datafast websites apikeys create`.
   - Confirm website ids: `datafast websites list` (server id) + website script
     snippet (`dfid_…` tracking id). Create the staging website if not present.
   - Confirm Polar is connected (Integrations → Polar — user says done) and revenue
     attribution is enabled.
4. **Layer 3 (payments):** tunnel local (or preview) → sandbox webhook
   `https://<tunnel>/api/webhooks/polar` → run §3 verification → also
   `node scripts/simulate-webhook.mjs …` for signature/idempotency regression.
5. **Fix Vercel envs (§2a + matrix above)** — remove the three wrong `eyJ…` values,
   add correct ones, Production **and** Preview. Set `NEXT_PUBLIC_MOCK_MODE=false`
   (Production) and `NEXT_PUBLIC_LAUNCH_DATE`.
6. **Layer 4:** `bash scripts/deploy.sh` (preview → staging alias) → smoke staging →
   verify `curl https://staging.outbidarabs.lol/api/stats` → `statsSource:"datafast"`,
   pill matches DataFast dashboard; sandbox purchase shows attribution.
7. **Layer 5 (production):**
   ```bash
   bash scripts/smoke.sh https://staging.outbidarabs.lol   # final gate
   bash scripts/deploy.sh prod
   bash scripts/smoke.sh https://outbidarabs.lol
   ```
8. **First real payment test:** place a $1 listing on production with a real card,
   verify: listing applied once, `processed_checkouts` +1, `total_revenue` +$1,
   DataFast shows the revenue attributed, then refund from the Polar dashboard and
   deactivate the test listing (`is_active=false`) if desired.
9. **Post-deploy monitoring (first 48h):** `/api/stats` sanity twice a day; Vercel
   logs for `datafast fetch failed` / `polar webhook apply failed`; Polar payments vs
   board rows parity; DataFast revenue vs `total_revenue` parity.

### Rollback
- App: `vercel ls` → `vercel alias set <last-good-url> outbidarabs.lol`.
- Env: `vercel env rm` the bad value + re-add previous (redeploy after).
- No DB migrations in this release → no SQL rollback needed.
- DataFast integration is passive metadata — reverting the deploy removes it; already
  attributed revenue is unaffected.

---

## 8. Out-of-scope / follow-ups

- Re-enable the trending/activity cards: set `NEXT_PUBLIC_SHOW_TRENDING_ACTIVITY=true`
  on Preview (staging) first, verify with `EXPECT_SIDE_CARDS=1 bash scripts/smoke.sh`,
  then set on Production and redeploy. No code changes required.
- Ads model (explicitly deferred; just removed references).
- Arabic NSFW/illegal pattern lists and the `GAMBLING_HOSTS` brand list will need
  curation over time (mirrors and new brands are whack-a-mole) — consider moving to
  a Supabase-backed denylist editable without deploys.
- DataFast custom goals (e.g., `checkout_started` as a conversion goal) — nice-to-have
  once attribution is live.
- Alerts (uptime/revenue anomaly) — currently manual monitoring only.
