// Accounts & claims data layer (docs/accounts-workflow.md).
// Mirrors store.ts's dual-store pattern: Supabase (Auth + tables) when
// configured, a fully in-memory mock store when keyless. Login is email-code
// only (Supabase Auth OTP in real mode); browsing and paying never require it.

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  ANON_PAYER,
  MOCK_MODE,
  getListingById,
  mockPayments,
  normalizeEmail,
  supabase,
  supabaseAdmin,
  type MockPayment,
} from "@/lib/store";
import { getRanks } from "@/lib/store";
import type { Listing } from "@/lib/types";
import { isPlatform } from "@/lib/platforms";

export { ANON_PAYER, MOCK_MODE };

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export type SessionUser = { id: string; email: string };

export type Profile = {
  id: string;
  public_id: string; // opaque id for public surfaces (/u/[id]) — never the auth uuid
  display_name: string;
  avatar_url: string | null;
  is_public: boolean;
  created_at: string;
};

/** Resolved supporter row — never carries a raw email or an auth uuid. */
export type Supporter = {
  key: string; // opaque per group: "u:" public-id, "c:"/"e:" server-side HMAC (anonymous)
  name: string | null; // null → render as Anonymous
  avatarUrl: string | null;
  isPublic: boolean;
  publicId: string | null; // profiles.public_id (null for anonymous rows)
  total: number;
  firstPaidAt: string;
  isOwner: boolean;
};

/** Internal ranking row: carries the auth uuid for owner-pin + self-rank —
 *  stripped before leaving this module. */
type SupporterGroup = Supporter & { userId: string | null };

export type CardState = {
  supporters: Supporter[];
  owner: { publicId: string | null; name: string | null; isPublic: boolean } | null;
  // Current editable card fields (D6) so the owner editor prefills real
  // values instead of wiping untouched ones.
  card: { description: string | null; imageUrl: string | null } | null;
};

export type PaymentsByCard = {
  listing: Pick<Listing, "id" | "display_name" | "platform" | "image_url" | "target_url" | "url">;
  total: number;
  count: number;
  firstPaidAt: string;
  lastPaidAt: string;
  rank: number | null; // rank on the card's supporters list
};

export type ClaimedCard = {
  listing: Pick<Listing, "id" | "display_name" | "platform" | "image_url">;
  boardRank: number;
  claimedAt: string;
};

// ───────────────────────────────────────────────────────────
// OTP policy (spec: 6-digit code, 10-min expiry, 60s resend, 5 sends/hour)
// ───────────────────────────────────────────────────────────

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
export const MOCK_SESSION_COOKIE = "ob_session";

// Mock-only send log (email → timestamps). Real mode persists its window in
// the otp_rate_limit table (service-role only) so every serverless instance
// shares the same 5/hour + 60s policy; Supabase Auth adds its own limits.
const otpSends = new Map<string, number[]>();

export function normalizePayerEmail(email?: string | null): string {
  return normalizeEmail(email);
}

export function isValidEmail(email: string): boolean {
  // Rejects PostgREST filter syntax (commas, quotes, parens, backslash) and
  // whitespace; apostrophes are allowed (payments filters use .eq(), which
  // URL-encodes values) and exactly one @ plus a dotted domain is required.
  return /^[^\s@,"()\\]+@[^\s@,"()\\]+\.[^\s@,"()\\]{2,}$/.test(email.trim());
}

function defaultDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local ? local.slice(0, 24) : "";
}

// ───────────────────────────────────────────────────────────
// Mock store
// ───────────────────────────────────────────────────────────

type MockUser = Profile & {
  email: string;
  code: string | null;
  codeExpiresAt: number;
  lastSentAt: number;
  attempts: number;
};

const mockGlobal = globalThis as unknown as {
  __obMockUsers?: Map<string, MockUser>;
  __obMockSessions?: Map<string, { userId: string; email: string; expiresAt: number }>;
  __obMockClaims?: Map<string, { user_id: string; created_at: string }>;
};

function mockUsers(): Map<string, MockUser> {
  if (!mockGlobal.__obMockUsers) {
    const users = new Map<string, MockUser>();
    // Demo supporters matching the seeded mock payments (store.ts) so the
    // supporters drawer is demoable keyless. Fictional, mock mode only.
    const demo: Array<[string, string, string, string]> = [
      ["salma@demo.local", "mock-user-salma", "pub-salma", "سلمى"],
      ["yousef@demo.local", "mock-user-yousef", "pub-yousef", "يوسف"],
    ];
    for (const [email, id, publicId, name] of demo) {
      users.set(email, {
        id,
        public_id: publicId,
        email,
        display_name: name,
        avatar_url: null,
        is_public: true,
        created_at: new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
        code: null,
        codeExpiresAt: 0,
        lastSentAt: 0,
        attempts: 0,
      });
    }
    mockGlobal.__obMockUsers = users;
  }
  return mockGlobal.__obMockUsers;
}

function mockSessions(): Map<string, { userId: string; email: string; expiresAt: number }> {
  if (!mockGlobal.__obMockSessions) mockGlobal.__obMockSessions = new Map();
  return mockGlobal.__obMockSessions;
}

function mockClaims(): Map<string, { user_id: string; created_at: string }> {
  if (!mockGlobal.__obMockClaims) mockGlobal.__obMockClaims = new Map();
  return mockGlobal.__obMockClaims;
}

function mockUserById(id: string): MockUser | null {
  for (const u of mockUsers().values()) if (u.id === id) return u;
  return null;
}

function mockUserByPublicId(publicId: string): MockUser | null {
  for (const u of mockUsers().values()) if (u.public_id === publicId) return u;
  return null;
}

/** Mock-payment layers (mock mode + Layer 2): retag the browser's anonymous
 *  payments with a real email the user just typed (mirrors Dodo telling us
 *  the payer's email). Mock mode mutates the in-memory twin; Layer 2 (real
 *  Supabase + mock payments) writes the same retag to the real tables. */
export async function mockTagPayerEmail(from: string, to: string): Promise<void> {
  const src = normalizePayerEmail(from);
  const dst = normalizePayerEmail(to);
  if (!src || !dst || src === dst) return;
  if (MOCK_MODE) {
    for (const p of mockPayments()) {
      if (p.payer_email === src && !p.user_id) p.payer_email = dst;
    }
    return;
  }
  const { error } = await supabaseAdmin()
    .from("payments")
    .update({ payer_email: dst })
    .eq("payer_email", src)
    .is("user_id", null);
  if (error) console.error("payer retag failed", src, error.message);
}

// ───────────────────────────────────────────────────────────
// Auth: send code / verify / session
// ───────────────────────────────────────────────────────────

export type SendResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "invalid-email" | "rate-limited" | "cooldown" | "send-failed"; retryAfterSec?: number };

export async function sendLoginCode(emailRaw: string): Promise<SendResult> {
  const email = normalizePayerEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, reason: "invalid-email" };
  return MOCK_MODE ? sendLoginCodeMock(email) : sendLoginCodeReal(email);
}

/** Mock limiter: in-memory window (single keyless dev instance). */
function checkMockAllowance(email: string): { ok: true } | { ok: false; reason: "rate-limited" | "cooldown"; retryAfterSec?: number } {
  const now = Date.now();
  const sends = (otpSends.get(email) ?? []).filter((t) => now - t < 3_600_000);
  if (sends.length >= MAX_SENDS_PER_HOUR) {
    otpSends.set(email, sends);
    return { ok: false, reason: "rate-limited", retryAfterSec: Math.ceil((3_600_000 - (now - sends[0])) / 1000) };
  }
  const user = mockUsers().get(email);
  if (user && user.lastSentAt && now - user.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown", retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - (now - user.lastSentAt)) / 1000) };
  }
  sends.push(now);
  otpSends.set(email, sends);
  return { ok: true };
}

/** Real-mode limiter: DB-backed window in otp_rate_limit (service-role only),
 *  shared across serverless instances. The window/cooldown/increment/reset
 *  logic runs inside the consume_otp_allowance RPC so concurrent sends can't
 *  both read sends=0 — the UPDATE (with the expired-window reset) is atomic
 *  in SQL. A DB failure fails OPEN — Supabase Auth's own send limits remain
 *  the hard backstop. */
async function consumeOtpAllowance(email: string): Promise<{ ok: true } | { ok: false; reason: "rate-limited" | "cooldown"; retryAfterSec?: number }> {
  const { data, error } = await supabaseAdmin().rpc("consume_otp_allowance", {
    p_email: email,
    p_max_sends: MAX_SENDS_PER_HOUR,
    p_window_sec: 3_600,
    p_cooldown_sec: RESEND_COOLDOWN_MS / 1000,
  });
  if (error) {
    console.error("otp rate limit rpc failed", email, error.message);
    return { ok: true };
  }
  const r = data as { allowed?: boolean; reason?: "rate-limited" | "cooldown"; retry_after_sec?: number };
  if (r?.allowed) return { ok: true };
  return {
    ok: false,
    reason: r?.reason === "cooldown" ? "cooldown" : "rate-limited",
    retryAfterSec: Math.max(1, r?.retry_after_sec ?? 60),
  };
}

/** Best-effort refund of a consumed OTP slot after a hard send failure
 *  (non-rate-limit): transient Supabase outages must not burn the 5/hour
 *  quota. Failure to refund is logged and swallowed — it must never mask
 *  the send-failed result. */
async function refundOtpAllowance(email: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("refund_otp_allowance", { p_email: email });
  if (error) console.error("otp rate limit refund failed", email, error.message);
}

async function sendLoginCodeMock(email: string): Promise<SendResult> {
  const allowance = checkMockAllowance(email);
  if (!allowance.ok) return allowance;
  const now = Date.now();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const existing = mockUsers().get(email);
  const base: MockUser = existing ?? {
    id: `mock-user-${crypto.randomUUID().slice(0, 8)}`,
    public_id: `pub-${crypto.randomUUID().slice(0, 12)}`,
    email,
    display_name: defaultDisplayName(email),
    avatar_url: null,
    is_public: true,
    created_at: new Date().toISOString(),
    code: null,
    codeExpiresAt: 0,
    lastSentAt: 0,
    attempts: 0,
  };
  mockUsers().set(email, { ...base, code, codeExpiresAt: now + CODE_TTL_MS, lastSentAt: now, attempts: 0 });
  // Mock mode surfaces the code in the UI — dev/demo only (MOCK_MODE gated).
  return { ok: true, devCode: code };
}

async function sendLoginCodeReal(email: string): Promise<SendResult> {
  const allowance = await consumeOtpAllowance(email);
  if (!allowance.ok) return allowance;
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    // Supabase rate limiting vs a real send failure (bad domain, provider
    // outage) — the UI treats send-failed like a network error (retryable).
    const isRate = error.status === 429 || /rate|limit|too many/i.test(error.message);
    console.error("otp send failed", email, error.message);
    // A hard failure consumed a quota slot for a code that never went out —
    // give it back (best-effort) so retries during an outage aren't locked
    // out by our own 5/hour cap (Supabase's limits stay the real bound).
    if (!isRate) await refundOtpAllowance(email);
    return { ok: false, reason: isRate ? "rate-limited" : "send-failed" };
  }
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; user: SessionUser; mockToken?: string }
  | { ok: false; reason: "invalid-code" | "invalid-email" };

export async function verifyLoginCode(
  emailRaw: string,
  code: string
): Promise<VerifyResult> {
  const email = normalizePayerEmail(emailRaw);
  if (!isValidEmail(email) || !/^\d{6}$/.test(code.trim())) {
    return { ok: false, reason: "invalid-code" };
  }

  if (MOCK_MODE) {
    const user = mockUsers().get(email);
    if (!user || !user.code || Date.now() > user.codeExpiresAt) {
      return { ok: false, reason: "invalid-code" };
    }
    if (user.attempts >= MAX_VERIFY_ATTEMPTS) {
      user.code = null;
      return { ok: false, reason: "invalid-code" };
    }
    if (user.code !== code.trim()) {
      user.attempts += 1;
      return { ok: false, reason: "invalid-code" };
    }
    user.code = null; // single use
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    mockSessions().set(token, { userId: user.id, email, expiresAt: Date.now() + SESSION_TTL_MS });
    await backfillPayments(email, user.id);
    return { ok: true, user: { id: user.id, email }, mockToken: token };
  }

  const sb = await serverSupabase();
  const { data, error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: "email" });
  if (error || !data.user?.email) return { ok: false, reason: "invalid-code" };
  const user: SessionUser = { id: data.user.id, email: data.user.email };
  await ensureProfile(user.id, user.email);
  await backfillPayments(user.email, user.id);
  return { ok: true, user };
}

/** Create the profile row on first login (idempotent). */
async function ensureProfile(userId: string, email: string): Promise<void> {
  if (MOCK_MODE) return; // mock profiles exist from sendLoginCode
  const { error } = await supabaseAdmin()
    .from("profiles")
    .upsert({ id: userId, display_name: defaultDisplayName(email) }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.error("profile upsert failed", userId, error.message);
}

/** Attribution backfill: the verified code proves email ownership, so claim
 *  every anonymous payment with that payer_email. */
export async function backfillPayments(email: string, userId: string): Promise<void> {
  const norm = normalizePayerEmail(email);
  if (MOCK_MODE) {
    for (const p of mockPayments()) {
      if (!p.user_id && p.payer_email === norm) p.user_id = userId;
    }
    return;
  }
  const { error } = await supabaseAdmin()
    .from("payments")
    .update({ user_id: userId })
    .eq("payer_email", norm)
    .is("user_id", null);
  if (error) console.error("payments backfill failed", userId, error.message);
}

/** Cookie session for route handlers: @supabase/ssr client (real mode).
 *  In mock mode the mock session cookie is handled by the routes. */
export async function serverSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components can't set cookies — refresh happens in routes.
          }
        },
      },
    }
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (MOCK_MODE) {
    const token = (await cookies()).get(MOCK_SESSION_COOKIE)?.value;
    if (!token) return null;
    const s = mockSessions().get(token);
    if (!s || s.expiresAt < Date.now()) return null;
    return { id: s.userId, email: s.email };
  }
  try {
    const { data } = await (await serverSupabase()).auth.getUser();
    if (!data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (MOCK_MODE) {
    const token = (await cookies()).get(MOCK_SESSION_COOKIE)?.value;
    if (token) mockSessions().delete(token);
    return;
  }
  try {
    await (await serverSupabase()).auth.signOut();
  } catch {
    /* best effort */
  }
}

// ───────────────────────────────────────────────────────────
// Profiles
// ───────────────────────────────────────────────────────────

const PROFILE_SELECT = "id, public_id, display_name, avatar_url, is_public, created_at";

export async function getProfile(userId: string): Promise<Profile | null> {
  if (MOCK_MODE) {
    const u = mockUserById(userId);
    if (!u) return null;
    return { id: u.id, public_id: u.public_id, display_name: u.display_name, avatar_url: u.avatar_url, is_public: u.is_public, created_at: u.created_at };
  }
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/** Resolve a profile by its opaque public id (/u/[id] surfaces). */
export async function getProfileByPublicId(publicId: string): Promise<Profile | null> {
  if (MOCK_MODE) {
    const u = mockUserByPublicId(publicId);
    if (!u) return null;
    return { id: u.id, public_id: u.public_id, display_name: u.display_name, avatar_url: u.avatar_url, is_public: u.is_public, created_at: u.created_at };
  }
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("public_id", publicId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export async function updateProfile(
  userId: string,
  patch: { display_name?: string; is_public?: boolean }
): Promise<Profile | null> {
  const update: Record<string, unknown> = {};
  if (patch.display_name !== undefined) update.display_name = patch.display_name.trim().slice(0, 40);
  if (patch.is_public !== undefined) update.is_public = !!patch.is_public;
  if (Object.keys(update).length === 0) return getProfile(userId);

  if (MOCK_MODE) {
    for (const u of mockUsers().values()) {
      if (u.id === userId) {
        if (typeof update.display_name === "string") u.display_name = update.display_name;
        if (typeof update.is_public === "boolean") u.is_public = update.is_public;
        return getProfile(userId);
      }
    }
    return null;
  }
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();
  if (error) {
    console.error("profile update failed", userId, error.message);
    return null;
  }
  return data as Profile;
}

// ───────────────────────────────────────────────────────────
// Claims (one owner per card)
// ───────────────────────────────────────────────────────────

export type ClaimOutcome =
  | { ok: true; owner: { userId: string } }
  | { ok: false; reason: "already-claimed"; owner: { userId: string; name: string | null } }
  | { ok: false; reason: "not-found" };

export async function getClaim(listingId: string): Promise<{ userId: string; createdAt: string } | null> {
  if (MOCK_MODE) {
    const c = mockClaims().get(listingId);
    return c ? { userId: c.user_id, createdAt: c.created_at } : null;
  }
  const { data } = await supabaseAdmin()
    .from("claims")
    .select("user_id, created_at")
    .eq("listing_id", listingId)
    .maybeSingle();
  return data ? { userId: (data as any).user_id, createdAt: (data as any).created_at } : null;
}

export async function createClaim(listingId: string, userId: string): Promise<ClaimOutcome> {
  if (MOCK_MODE) {
    if (!(await mockListingsInclude(listingId))) return { ok: false, reason: "not-found" };
    const existing = mockClaims().get(listingId);
    if (existing) {
      if (existing.user_id === userId) return { ok: true, owner: { userId } };
      return {
        ok: false,
        reason: "already-claimed",
        owner: { userId: existing.user_id, name: mockUserById(existing.user_id)?.display_name ?? null },
      };
    }
    mockClaims().set(listingId, { user_id: userId, created_at: new Date().toISOString() });
    return { ok: true, owner: { userId } };
  }

  // Insert with ignore-duplicates, then read back: a race between two claims
  // resolves to whoever inserted first (listing_id is the PK).
  const { error } = await supabaseAdmin()
    .from("claims")
    .insert({ listing_id: listingId, user_id: userId });
  if (error) {
    if (error.code === "23505") {
      const claim = await getClaim(listingId);
      if (claim) {
        if (claim.userId === userId) return { ok: true, owner: { userId } };
        const ownerProfile = await getProfile(claim.userId);
        return {
          ok: false,
          reason: "already-claimed",
          owner: { userId: claim.userId, name: ownerProfile?.is_public ? ownerProfile.display_name || null : null },
        };
      }
    }
    console.error("claim insert failed", listingId, error.message);
    return { ok: false, reason: "not-found" };
  }
  return { ok: true, owner: { userId } };
}

async function mockListingsInclude(id: string): Promise<boolean> {
  return (await getListingById(id)) != null;
}

// ───────────────────────────────────────────────────────────
// Supporters (ranked per card: total paid desc, earliest first)
// ───────────────────────────────────────────────────────────

// Anonymous-supporter keys (D8): a plain hash of the email would be
// offline-verifiable — anyone could hash a guessed email and match a
// supporter row. HMAC with a server-only secret keeps the grouping
// semantics (same email + card → same key, so totals still collapse and the
// login backfill still merges rows) without being client-verifiable.
function anonKeySecret(): string {
  return (
    process.env.ACCOUNTS_HASH_SECRET ||
    // Stable dev fallbacks — production sets ACCOUNTS_HASH_SECRET.
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "outbidarabs-dev-anon-key"
  );
}

function anonSupporterKey(listingId: string, email: string): string {
  const hmac = createHmac("sha256", anonKeySecret())
    .update(`${listingId}|${normalizePayerEmail(email)}`)
    .digest("hex");
  return `e:${hmac.slice(0, 12)}`;
}

/** Public key for an attributed (user) row: the opaque public_id when a
 *  profile exists, else a stable HMAC over the auth id — the raw auth uuid
 *  must never appear on a public surface (mock + real share this path). */
function userSupporterKey(userId: string, profile: Profile | null): string {
  if (profile) return `u:${profile.public_id}`;
  const hmac = createHmac("sha256", anonKeySecret()).update(`user:${userId}`).digest("hex");
  return `u:${hmac.slice(0, 12)}`;
}

/** Sentinel (no-email) payments: one supporter row per payment — keyed by an
 *  HMAC of the checkout id (same opacity rules as the email key; the raw
 *  checkout id never appears in a public payload either). */
function checkoutAnonKey(listingId: string, checkoutId: string): string {
  const hmac = createHmac("sha256", anonKeySecret())
    .update(`${listingId}|c:${checkoutId}`)
    .digest("hex");
  return `c:${hmac.slice(0, 12)}`;
}

type RawPayment = Pick<MockPayment, "checkout_id" | "listing_id" | "user_id" | "payer_email" | "amount" | "created_at">;

/** Internal grouping key (module-private; mirrors supporters_view). User
 *  rows group by auth uuid — the PUBLIC key is rewritten in rankGroups'
 *  map step (userSupporterKey) so `u:<auth uuid>` never leaves this module.
 *  No-email (sentinel) payments group per payment, everything else by email
 *  HMAC. */
function paymentGroupKey(listingId: string, r: RawPayment): string {
  if (r.user_id) return `u:${r.user_id}`;
  if (normalizeEmail(r.payer_email) === ANON_PAYER) return checkoutAnonKey(listingId, r.checkout_id);
  return anonSupporterKey(listingId, r.payer_email);
}

/** Shared ranking: group payments by identity, total desc, earliest first,
 *  owner pinned to the top when they've paid. Private profiles → anonymous. */
function rankGroups(
  listingId: string,
  rows: RawPayment[],
  profiles: Map<string, Profile>,
  ownerUserId: string | null
): SupporterGroup[] {
  const groups = new Map<string, { userId: string | null; total: number; firstPaidAt: string }>();
  for (const r of rows) {
    const key = paymentGroupKey(listingId, r);
    const g = groups.get(key) ?? { userId: r.user_id ?? null, total: 0, firstPaidAt: r.created_at };
    g.total += r.amount;
    if (r.created_at < g.firstPaidAt) g.firstPaidAt = r.created_at;
    groups.set(key, g);
  }

  const supporters: SupporterGroup[] = [...groups.entries()]
    .sort(([, a], [, b]) => (b.total !== a.total ? b.total - a.total : a.firstPaidAt.localeCompare(b.firstPaidAt)))
    .map(([key, g]) => {
      const profile = g.userId ? profiles.get(g.userId) ?? null : null;
      return {
        // Public key: opaque for user rows (never the auth uuid); anonymous
        // keys are already opaque from paymentGroupKey.
        key: g.userId ? userSupporterKey(g.userId, profile) : key,
        name: profile?.is_public ? profile.display_name || null : null,
        avatarUrl: profile?.is_public ? profile.avatar_url : null,
        isPublic: profile?.is_public ?? false,
        publicId: profile?.public_id ?? null,
        userId: g.userId,
        total: g.total,
        firstPaidAt: g.firstPaidAt,
        isOwner: !!g.userId && g.userId === ownerUserId,
      };
    });

  // Owner pins to the top when they've paid (spec flow 3).
  if (ownerUserId) {
    const idx = supporters.findIndex((s) => s.userId === ownerUserId);
    if (idx > 0) {
      const [owner] = supporters.splice(idx, 1);
      owner.isOwner = true;
      supporters.unshift(owner);
    }
  }
  return supporters;
}

/** Single-card ranking (card drawer). Public shape — auth uuids stripped. */
async function rankSupporters(
  listingId: string,
  rows: RawPayment[],
  ownerUserId: string | null
): Promise<SupporterGroup[]> {
  const profiles = await profilesByIds([...new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x))]);
  return rankGroups(listingId, rows, profiles, ownerUserId);
}

/** Profiles for a set of auth ids — one query (mock: in-memory scan). */
async function profilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const profiles = new Map<string, Profile>();
  if (ids.length === 0) return profiles;
  if (MOCK_MODE) {
    for (const id of ids) {
      const u = mockUserById(id);
      if (u) {
        profiles.set(u.id, { id: u.id, public_id: u.public_id, display_name: u.display_name, avatar_url: u.avatar_url, is_public: u.is_public, created_at: u.created_at });
      }
    }
    return profiles;
  }
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", ids);
  for (const p of (data ?? []) as Profile[]) profiles.set(p.id, p);
  return profiles;
}

/** Strip the internal auth uuid before a supporter list leaves the module. */
const toPublicSupporters = (groups: SupporterGroup[]): Supporter[] =>
  groups.map(({ userId: _userId, ...pub }) => pub);

/** Bulk ranking (profile page): one payments query + one profiles query for
 *  many cards — replaces the per-card getCardState loop (N+1). */
async function rankSupportersBulk(
  rowsByListing: Map<string, RawPayment[]>,
  ownersByListing: Map<string, string>
): Promise<Map<string, SupporterGroup[]>> {
  const userIds = new Set<string>();
  for (const rows of rowsByListing.values()) for (const r of rows) if (r.user_id) userIds.add(r.user_id);
  const profiles = await profilesByIds([...userIds]);
  const out = new Map<string, SupporterGroup[]>();
  for (const [listingId, rows] of rowsByListing) {
    out.set(listingId, rankGroups(listingId, rows, profiles, ownersByListing.get(listingId) ?? null));
  }
  return out;
}

export async function getCardState(listingId: string): Promise<CardState> {
  const [claim, listing] = await Promise.all([getClaim(listingId), getListingById(listingId)]);
  const card = listing
    ? { description: listing.description ?? null, imageUrl: listing.image_url ?? null }
    : null;
  const ownerProfile = claim ? await getProfile(claim.userId) : null;
  const owner = claim
    ? {
        publicId: ownerProfile?.public_id ?? null,
        name: ownerProfile?.is_public ? ownerProfile.display_name || null : null,
        isPublic: ownerProfile?.is_public ?? false,
      }
    : null;

  const rows = await fetchCardPayments(listingId);
  return {
    supporters: toPublicSupporters(await rankSupporters(listingId, rows, claim?.userId ?? null)),
    owner,
    card,
  };
}

/** Payments for one card, oldest first (both stores, same shape). */
async function fetchCardPayments(listingId: string): Promise<RawPayment[]> {
  if (MOCK_MODE) {
    return mockPayments()
      .filter((p) => p.listing_id === listingId)
      .map(({ checkout_id, listing_id, user_id, payer_email, amount, created_at }) => ({ checkout_id, listing_id, user_id, payer_email, amount, created_at }));
  }
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("checkout_id, listing_id, user_id, payer_email, amount, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) console.error("payments fetch failed", listingId, error.message);
  return (data ?? []) as unknown as RawPayment[];
}

/** Internal single-card ranking (self-rank lookups need the group key,
 *  which the public CardState shape strips). */
async function getCardGroups(listingId: string): Promise<SupporterGroup[]> {
  const [rows, claim] = await Promise.all([fetchCardPayments(listingId), getClaim(listingId)]);
  return rankSupporters(listingId, rows, claim?.userId ?? null);
}

// ───────────────────────────────────────────────────────────
// Profile views: payments grouped per card + claims
// ───────────────────────────────────────────────────────────

type ListingLite = PaymentsByCard["listing"];

async function listingsByIds(ids: string[]): Promise<Map<string, ListingLite>> {
  const map = new Map<string, ListingLite>();
  if (ids.length === 0) return map;
  if (MOCK_MODE) {
    for (const id of ids) {
      const l = await getListingById(id);
      if (l) map.set(id, pickListingLite(l));
    }
    return map;
  }
  const { data } = await supabaseAdmin()
    .from("listings")
    .select("id, display_name, platform, image_url, target_url, url")
    .in("id", ids);
  for (const l of (data ?? []) as any[]) {
    map.set(l.id, {
      id: l.id,
      display_name: l.display_name,
      platform: isPlatform(l.platform) ? l.platform : "website",
      image_url: l.image_url ?? null,
      target_url: l.target_url ?? null,
      url: l.url,
    });
  }
  return map;
}

function pickListingLite(l: Listing): ListingLite {
  return {
    id: l.id,
    display_name: l.display_name,
    platform: l.platform,
    image_url: l.image_url ?? null,
    target_url: l.target_url ?? null,
    url: l.url,
  };
}

/** Payments grouped per card with the user's rank on each card's list. */
export async function getPaymentsByCard(userId: string, email: string): Promise<PaymentsByCard[]> {
  let rows: Array<{ checkout_id: string; listing_id: string; amount: number; created_at: string }>;
  if (MOCK_MODE) {
    rows = mockPayments()
      .filter((p) => p.user_id === userId || (!p.user_id && p.payer_email === normalizePayerEmail(email)))
      .map(({ checkout_id, listing_id, amount, created_at }) => ({ checkout_id, listing_id, amount, created_at }));
  } else {
    // user_id covers backfilled + logged-in payments; the email arm catches
    // anything the backfill missed (e.g. a race right after verify). Two
    // plain .eq() queries (never a .or() string filter — the email would be
    // interpolated into PostgREST filter syntax), unioned by unique
    // checkout_id; an empty email matches nothing and is skipped entirely
    // (same semantics as the previous empty-string arm).
    const select = "checkout_id, listing_id, amount, created_at";
    const normalized = normalizePayerEmail(email);
    const [byUser, byEmail] = await Promise.all([
      supabaseAdmin()
        .from("payments")
        .select(select)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1000),
      normalized
        ? supabaseAdmin()
            .from("payments")
            .select(select)
            .eq("payer_email", normalized)
            .order("created_at", { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: null }),
    ]);
    const seen = new Set<string>();
    rows = [];
    for (const r of [...((byUser.data ?? []) as any[]), ...((byEmail.data ?? []) as any[])]) {
      if (seen.has(r.checkout_id)) continue;
      seen.add(r.checkout_id);
      rows.push(r);
    }
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // No payments → nothing to batch (and .in() with an empty list is a
  // guaranteed-failing query — listingsByIds guards the same case).
  if (rows.length === 0) return [];

  const listings = await listingsByIds([...new Set(rows.map((r) => r.listing_id))]);
  const byCard = new Map<string, { total: number; count: number; first: string; last: string }>();
  for (const r of rows) {
    const g = byCard.get(r.listing_id) ?? { total: 0, count: 0, first: r.created_at, last: r.created_at };
    g.total += r.amount;
    g.count += 1;
    if (r.created_at < g.first) g.first = r.created_at;
    if (r.created_at > g.last) g.last = r.created_at;
    byCard.set(r.listing_id, g);
  }

  const out: PaymentsByCard[] = [];
  // Ranks: mock keeps the trivial per-card loop; real mode does one bulk pass
  // (one payments query + one claims query over the user's cards) instead of
  // a getCardState call per card (N+1).
  let ranks: Map<string, number | null>;
  if (MOCK_MODE) {
    ranks = new Map();
    for (const listingId of byCard.keys()) {
      const groups = await getCardGroups(listingId);
      const rank = groups.findIndex((s) => s.userId === userId) + 1;
      ranks.set(listingId, rank > 0 ? rank : null);
    }
  } else {
    const listingIds = [...byCard.keys()];
    const [allPayments, claimRows] = await Promise.all([
      supabaseAdmin()
        .from("payments")
        .select("checkout_id, listing_id, user_id, payer_email, amount, created_at")
        .in("listing_id", listingIds)
        .order("created_at", { ascending: true })
        .limit(5000),
      supabaseAdmin().from("claims").select("listing_id, user_id").in("listing_id", listingIds),
    ]);
    const rowsByListing = new Map<string, RawPayment[]>();
    for (const r of (allPayments.data ?? []) as unknown as RawPayment[]) {
      const list = rowsByListing.get(r.listing_id) ?? [];
      list.push(r);
      rowsByListing.set(r.listing_id, list);
    }
    const ownersByListing = new Map<string, string>();
    for (const c of (claimRows.data ?? []) as Array<{ listing_id: string; user_id: string }>) {
      ownersByListing.set(c.listing_id, c.user_id);
    }
    const groupsByListing = await rankSupportersBulk(rowsByListing, ownersByListing);
    ranks = new Map();
    for (const listingId of listingIds) {
      const groups = groupsByListing.get(listingId) ?? [];
      const rank = groups.findIndex((s) => s.userId === userId) + 1;
      ranks.set(listingId, rank > 0 ? rank : null);
    }
  }

  for (const [listingId, g] of byCard) {
    const listing = listings.get(listingId);
    if (!listing) continue; // listing deleted → cascade removed payments (real); mock keeps rows only for live listings
    out.push({ listing, total: g.total, count: g.count, firstPaidAt: g.first, lastPaidAt: g.last, rank: ranks.get(listingId) ?? null });
  }
  return out.sort((a, b) => b.total - a.total || a.lastPaidAt.localeCompare(b.lastPaidAt));
}

export async function getClaimedCards(userId: string): Promise<ClaimedCard[]> {
  let claimRows: Array<{ listing_id: string; created_at: string }>;
  if (MOCK_MODE) {
    claimRows = [...mockClaims().entries()]
      .filter(([, c]) => c.user_id === userId)
      .map(([listing_id, c]) => ({ listing_id, created_at: c.created_at }));
  } else {
    const { data } = await supabaseAdmin()
      .from("claims")
      .select("listing_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    claimRows = (data ?? []) as any[];
  }
  if (claimRows.length === 0) return [];

  const listings = await listingsByIds(claimRows.map((c) => c.listing_id));
  const ranks = await getRanks(claimRows.map((c) => c.listing_id));
  const out: ClaimedCard[] = [];
  for (const c of claimRows) {
    const listing = listings.get(c.listing_id);
    if (!listing) continue;
    out.push({ listing, boardRank: ranks.get(c.listing_id) ?? 0, claimedAt: c.created_at });
  }
  return out;
}

/** Public profile page data — resolved by the opaque public id (/u/[id]);
 *  null when private or missing (→ 404). */
export async function getPublicProfile(
  publicId: string
): Promise<{ profile: Profile; cards: PaymentsByCard[]; claims: ClaimedCard[] } | null> {
  const profile = await getProfileByPublicId(publicId);
  if (!profile || !profile.is_public) return null;
  // Empty email arm: the public page must not expose email-matched rows
  // beyond the user's own attributed payments — user_id matches only.
  const [cards, claims] = await Promise.all([
    getPaymentsByCard(profile.id, ""),
    getClaimedCards(profile.id),
  ]);
  return { profile, cards, claims };
}

// ───────────────────────────────────────────────────────────
// Owner card edits (D6: description + image only; URL immutable)
// ───────────────────────────────────────────────────────────

export const MAX_CARD_DESCRIPTION = 280;

export async function ownerUpdateListing(
  listingId: string,
  ownerUserId: string,
  patch: { description?: string | null; image_url?: string | null }
): Promise<Listing | null> {
  const claim = await getClaim(listingId);
  if (!claim || claim.userId !== ownerUserId) return null;

  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) {
    update.description = patch.description ? patch.description.trim().slice(0, MAX_CARD_DESCRIPTION) : null;
  }
  if (patch.image_url !== undefined) {
    const url = patch.image_url?.trim() ?? "";
    if (url && !/^https?:\/\/.+/i.test(url)) return null;
    update.image_url = url ? url.slice(0, 480) : null;
  }
  if (Object.keys(update).length === 0) return null;

  if (MOCK_MODE) {
    const l = await getListingById(listingId);
    if (!l) return null;
    if ("description" in update) l.description = update.description as string | null;
    if ("image_url" in update) l.image_url = update.image_url as string | null;
    return l;
  }
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .update(update)
    .eq("id", listingId)
    .select("*")
    .single();
  if (error) {
    console.error("owner listing update failed", listingId, error.message);
    return null;
  }
  return data as Listing;
}
