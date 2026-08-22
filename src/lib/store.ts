import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ActivityItem, LeaderboardPage, Listing, SiteStats, TrendingItem } from "@/lib/types";
import { MIN_BID, MAX_BID, PER_PAGE, LAUNCH_ISO } from "@/lib/i18n";
import { getDataFastStats } from "@/lib/datafast";
import type { PlatformFilter, Platform } from "@/lib/platforms";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const MOCK_MODE =
  !SUPABASE_URL || !SUPABASE_ANON || process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export { PER_PAGE };

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!anonClient) anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON!);
  return anonClient;
}
function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE || SUPABASE_ANON!);
  }
  return adminClient;
}

// ───────────────────────────────────────────────────────────
// Mock store: fully self-contained board for dev/demo mode.
// Same rules engine as the SQL layer.
// ───────────────────────────────────────────────────────────
type MockListing = Listing & { clicks_per_hour: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// url, platform, display, description, bid, clicks, clicks/h
const SEED: Array<[string, Platform, string, string, number, number, number]> = [
  ["https://instagram.com/noor.cooks", "instagram", "@noor.cooks", "وصفات بيتية مصرية سهلة كل يوم", 8201, 853, 852],
  ["https://instagram.com/omar.fits", "instagram", "@omar.fits", "تمارين بيتية بدون أجهزة — برنامجك في 20 دقيقة", 6104, 632, 497],
  ["https://tiktok.com/@mona.makes", "tiktok", "@mona.makes", "شغلات يدوية وديكور بيديك", 5888, 10401, 659],
  ["https://instagram.com/layan.art", "instagram", "@layan.art", "رسم ديجيتال وكاليجرافي عربي", 4321, 3714, 669],
  ["https://tiktok.com/@yahya.dubs", "tiktok", "@yahya.dubs", "دبلجة كوميدية للمشاهد المشهورة", 3999, 1122, 547],
  ["https://tiktok.com/@sara.skincare", "tiktok", "@sara.skincare", "روتين عناية بالبشرة للبشرة العربية", 3100, 2533, 244],
  ["https://x.com/arabdevnotes", "x", "@arabdevnotes", "أدوات وأخبار تقنية للمطورين العرب", 2800, 442, 96],
  ["https://instagram.com/khaled.travelz", "instagram", "@khaled.travelz", "رحلات موفرة في الخليج ومصر", 2417, 1917, 130],
  ["https://tiktok.com/@fofo.comedy", "tiktok", "@fofo.comedy", "سكتشات كوميدية عن الحياة اليومية", 1999, 1130, 88],
  ["https://x.com/startupgcc", "x", "@startupgcc", "شركات ناشئة واستثمار في الخليج", 1500, 50, 12],
  ["https://linkedin.com/in/layla-hassan", "linkedin", "Layla Hassan", "Product Manager | الرياض", 1200, 809, 71],
  ["https://chefsouq.com", "website", "chefsouq.com", "كل حاجة للمطبخ بتوصيل لنفس اليوم", 999, 648, 51],
  ["https://instagram.com/bassam.builds", "instagram", "@bassam.builds", "مشاريع DIY بالعربي للأطفال والكبار", 888, 810, 33],
  ["https://launcharabia.com", "website", "launcharabia.com", "دليل إطلاق منتجك الأول بالعربي", 777, 547, 42],
  ["https://x.com/tamergad", "x", "@tamergad", "تقييمات أجهزة وتقنية بالعربي", 666, 4497, 380],
  ["https://tiktok.com/@hind.recipes", "tiktok", "@hind.recipes", "وصفات سريعة في دقيقتين", 555, 669, 45],
  ["https://apps.apple.com/ar/app/wasfati/id1494567890", "app", "وصفاتي", "وصفات عربية خطوة بخطوة", 444, 120, 9],
  ["https://3laam.com", "website", "3laam.com", "محتوى ومقالات عربية مبسطة", 333, 12, 1],
  ["https://play.google.com/store/apps/details?id=com.hogag.app", "app", "حجز ملاعب", "احجز ملعبك مع أصحابك في دقيقة", 222, 8, 1],
  ["https://instagram.com/dina.decor", "instagram", "@dina.decor", "ديكور الدار بأقل تكلفة", 111, 45, 3],
  ["https://tiktok.com/@ziad.guitar", "tiktok", "@ziad.guitar", "تعلم الجيتار من الصفر بالعربي", 55, 21, 2],
];

function mockSeed(): MockListing[] {
  const now = Date.now();
  return SEED.map((s, i) => ({
    id: `seed-${i}`,
    url: s[0],
    platform: s[1],
    target_url: s[0],
    image_url: null,
    display_name: s[2],
    description: s[3],
    bid_amount: s[4],
    clicks: s[5],
    clicks_per_hour: s[6],
    created_at: new Date(now - (i + 1) * 3 * HOUR).toISOString(),
    last_bid_at: new Date(now - (i * 9 + 1) * MINUTE).toISOString(),
  }));
}

const globalStore = globalThis as unknown as {
  __mockListings?: MockListing[];
  __mockActivity?: ActivityItem[];
  __mockActivitySeq?: number;
  __mockVisitors?: number;
  __mockRevenue?: number;
  __mockProcessedOrders?: Set<string>;
  __mockPresence?: Map<string, number>;
};

function mockListings(): MockListing[] {
  if (!globalStore.__mockListings) globalStore.__mockListings = mockSeed();
  return globalStore.__mockListings;
}
function mockActivity(): ActivityItem[] {
  if (!globalStore.__mockActivity) {
    const sorted = sortBoard(mockListings());
    globalStore.__mockActivity = sorted.slice(0, 12).map((l, i) => ({
      id: i + 1,
      display_name: l.display_name,
      amount: l.bid_amount,
      rank: i + 1,
      created_at: new Date(Date.now() - (i + 1) * 90_000).toISOString(),
    }));
    globalStore.__mockActivitySeq = 12;
  }
  return globalStore.__mockActivity;
}
function mockRevenue(): number {
  if (globalStore.__mockRevenue == null) {
    globalStore.__mockRevenue = mockListings().reduce((s, l) => s + l.bid_amount, 0);
  }
  return globalStore.__mockRevenue;
}
function mockProcessed(): Set<string> {
  if (!globalStore.__mockProcessedOrders) globalStore.__mockProcessedOrders = new Set();
  return globalStore.__mockProcessedOrders;
}

function sortBoard(listings: Listing[]): Listing[] {
  // Equal bids: older bid keeps the higher rank.
  return [...listings].sort((a, b) => {
    if (b.bid_amount !== a.bid_amount) return b.bid_amount - a.bid_amount;
    return new Date(a.last_bid_at).getTime() - new Date(b.last_bid_at).getTime();
  });
}

// ───────────────────────────────────────────────────────────
// Public API — used by pages and API routes.
// ───────────────────────────────────────────────────────────

/**
 * Leaderboard page. Ranks are always the listing's GLOBAL rank on the board;
 * the platform filter only narrows which rows are returned.
 */
export async function getLeaderboard(
  page = 1,
  platform: PlatformFilter = "all"
): Promise<LeaderboardPage> {
  let all: Listing[];
  if (MOCK_MODE) {
    all = sortBoard(mockListings());
  } else {
    const { data, error } = await supabase()
      .from("listings")
      .select("*")
      .eq("is_active", true)
      .order("bid_amount", { ascending: false })
      .order("last_bid_at", { ascending: true })
      .limit(5000);
    if (error) throw error;
    all = (data ?? []) as Listing[];
  }

  const ranked = all.map((l, i) => ({ listing: l, rank: i + 1 }));
  const filtered = platform === "all" ? ranked : ranked.filter((r) => r.listing.platform === platform);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), totalPages);
  const pageRows = filtered.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  return {
    listings: pageRows.map((r) => r.listing),
    ranks: pageRows.map((r) => r.rank),
    totalPages,
    total: filtered.length,
    totalAll: all.length,
    topBid: all[0]?.bid_amount ?? 0,
  };
}

/** Rank map for a set of listings (global rank by bid desc, last_bid_at asc). */
export async function getRanks(ids: string[]): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  if (ids.length === 0) return ranks;
  let all: Listing[];
  if (MOCK_MODE) {
    all = sortBoard(mockListings());
  } else {
    const { data } = await supabase()
      .from("listings")
      .select("id, bid_amount, last_bid_at, is_active")
      .eq("is_active", true)
      .order("bid_amount", { ascending: false })
      .order("last_bid_at", { ascending: true })
      .limit(5000);
    all = (data ?? []) as unknown as Listing[];
  }
  all.forEach((l, i) => ranks.set(l.id, i + 1));
  return ranks;
}

/** The current #1 listing (highest bid, oldest wins ties). */
export async function getTopListing(): Promise<Listing | null> {
  if (MOCK_MODE) return sortBoard(mockListings())[0] ?? null;
  const { data } = await supabase()
    .from("listings")
    .select("*")
    .eq("is_active", true)
    .order("bid_amount", { ascending: false })
    .order("last_bid_at", { ascending: true })
    .limit(1);
  return (data?.[0] as Listing) ?? null;
}

export async function getTrending(limit = 5): Promise<TrendingItem[]> {
  if (MOCK_MODE) {
    return [...mockListings()]
      .sort((a, b) => b.clicks_per_hour - a.clicks_per_hour)
      .slice(0, limit)
      .map((l) => ({
        id: l.id,
        display_name: l.display_name,
        url: l.url,
        clicks_per_hour: l.clicks_per_hour,
      }));
  }
  const since = new Date(Date.now() - HOUR).toISOString();
  const { data } = await supabase()
    .from("clicks")
    .select("listing_id, listings!inner(display_name, url, is_active)")
    .filter("listings.is_active", "eq", true)
    .gte("created_at", since);
  const counts = new Map<string, { name: string; url: string; n: number }>();
  for (const row of (data ?? []) as any[]) {
    const key = row.listing_id;
    const entry = counts.get(key) ?? { name: row.listings.display_name, url: row.listings.url, n: 0 };
    entry.n += 1;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .map(([id, v]) => ({ id, display_name: v.name, url: v.url, clicks_per_hour: v.n }))
    .sort((a, b) => b.clicks_per_hour - a.clicks_per_hour)
    .slice(0, limit);
}

export async function getActivity(limit = 5): Promise<ActivityItem[]> {
  if (MOCK_MODE) {
    return mockActivity().slice(0, limit);
  }
  const { data } = await supabase()
    .from("activity")
    .select("*, listings(image_url, target_url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    amount: row.amount,
    rank: row.rank,
    created_at: row.created_at,
    image_url: row.listings?.image_url ?? null,
    target_url: row.listings?.target_url ?? null,
  }));
}

function mockOnline(): number {
  return 300 + Math.floor(1200 * (0.5 + 0.5 * Math.sin(Date.now() / 60_000))) + Math.floor(Math.random() * 200);
}

export async function getStats(): Promise<SiteStats> {
  // Real analytics numbers (DataFast) when configured — the pill and about
  // page display these; fall back to our own counters otherwise.
  const df = await getDataFastStats();
  if (MOCK_MODE) {
    const all = mockListings();
    const sorted = sortBoard(all);
    return {
      online: df?.online ?? mockOnline(),
      visitors: df?.visitors ?? 1_085_026 + (globalStore.__mockVisitors ?? 0),
      totalRevenue: mockRevenue(),
      listingCount: all.length,
      highestBid: sorted[0]?.bid_amount ?? 0,
      highestBidder: sorted[0]?.display_name ?? null,
      launchedAt: LAUNCH_ISO,
      statsSource: df ? "datafast" : "internal",
    };
  }
  const [statsRes, topRes, countRes, onlineRes] = await Promise.all([
    supabase().from("site_stats").select("key, value"),
    supabase()
      .from("listings")
      .select("bid_amount, display_name")
      .eq("is_active", true)
      .order("bid_amount", { ascending: false })
      .limit(1),
    supabase().from("listings").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin().rpc("count_online").maybeSingle(),
  ]);
  const stats = new Map((statsRes.data ?? []).map((s: any) => [s.key, Number(s.value)]));
  const internalOnline = onlineRes.data != null ? Number(onlineRes.data) : 0;
  return {
    online: df?.online ?? internalOnline,
    visitors: df?.visitors ?? (stats.get("visitors") ?? 0),
    totalRevenue: stats.get("total_revenue") ?? 0,
    listingCount: countRes.count ?? 0,
    highestBid: topRes.data?.[0]?.bid_amount ?? 0,
    highestBidder: topRes.data?.[0]?.display_name ?? null,
    launchedAt: LAUNCH_ISO,
    statsSource: df ? "datafast" : "internal",
  };
}

export async function bumpVisitors(): Promise<number> {
  if (MOCK_MODE) {
    globalStore.__mockVisitors = (globalStore.__mockVisitors ?? 0) + 1;
    return globalStore.__mockVisitors;
  }
  const { data, error } = await supabaseAdmin().rpc("bump_stat", { p_key: "visitors" }).maybeSingle();
  if (error || data == null) {
    await supabaseAdmin()
      .from("site_stats")
      .upsert({ key: "visitors", value: 1 }, { onConflict: "key", ignoreDuplicates: false });
    return 1;
  }
  return Number(data);
}

/** Presence heartbeat: registers a browser session and returns the online count. */
export async function heartbeat(sessionId: string): Promise<number> {
  if (MOCK_MODE) {
    if (!globalStore.__mockPresence) globalStore.__mockPresence = new Map();
    globalStore.__mockPresence.set(sessionId, Date.now());
    const live = [...globalStore.__mockPresence.values()].filter(
      (t) => Date.now() - t < 90_000
    ).length;
    return mockOnline() + live;
  }
  const { data, error } = await supabaseAdmin()
    .rpc("heartbeat", { p_session: sessionId })
    .maybeSingle();
  if (error || data == null) return 0;
  return Number(data);
}

export async function getListingByUrl(url: string): Promise<Listing | null> {
  if (MOCK_MODE) {
    return mockListings().find((l) => l.url === url) ?? null;
  }
  const { data } = await supabase().from("listings").select("*").eq("url", url).maybeSingle();
  return (data as Listing) ?? null;
}

/** Registers a click and returns the click-through href. */
export async function registerClick(id: string): Promise<string | null> {
  if (MOCK_MODE) {
    const l = mockListings().find((x) => x.id === id);
    if (!l) return null;
    l.clicks += 1;
    l.clicks_per_hour += 1;
    return l.target_url || l.url;
  }
  await supabaseAdmin().rpc("register_click", { p_listing: id });
  const { data } = await supabase().from("listings").select("url, target_url").eq("id", id).single();
  return data?.target_url || data?.url || null;
}

async function addRevenue(db: SupabaseClient, delta: number): Promise<void> {
  if (delta <= 0) return;
  const { error } = await db.rpc("add_stat", { p_key: "total_revenue", p_delta: delta }).maybeSingle();
  if (error) console.error("add_stat failed", error.message);
}

export type ApplyResult =
  | { ok: true; listing: Listing; isNew: boolean; paidDelta: number; rank: number; duplicate?: boolean }
  | { ok: false; reason: "too-low" | "below-current" | "over-max" };

/**
 * Apply a completed payment. Rules (spec: highest total bid = highest rank):
 *  - any bid above the current top takes #1 (no artificial window)
 *  - new listing: $1–$999,999
 *  - raise: new total must be > current bid; payer pays only the difference
 *  - rank is recomputed and the activity feed gets a new row
 *  - idempotent per order/checkout id (webhooks can fire twice: confirmed + succeeded)
 */
export async function applyPaidListing(params: {
  url: string;
  platform?: Platform;
  displayName: string;
  description?: string | null;
  imageUrl?: string | null;
  targetUrl?: string | null;
  amount: number; // intended new total bid
  orderId: string;
}): Promise<ApplyResult> {
  const { url, platform, displayName, description, imageUrl, targetUrl, amount, orderId } = params;
  if (amount > MAX_BID) return { ok: false, reason: "over-max" };
  if (amount < MIN_BID) return { ok: false, reason: "too-low" };

  if (MOCK_MODE) {
    if (mockProcessed().has(orderId)) return { ok: true, listing: null as unknown as Listing, isNew: false, paidDelta: 0, rank: 0, duplicate: true };
    mockProcessed().add(orderId);
    const list = mockListings();
    const existing = list.find((l) => l.url === url);
    const nowIso = new Date().toISOString();
    if (existing) {
      if (amount <= existing.bid_amount) return { ok: false, reason: "below-current" };
      const delta = amount - existing.bid_amount;
      existing.bid_amount = amount;
      existing.last_bid_at = nowIso;
      if (description) existing.description = description;
      if (targetUrl) existing.target_url = targetUrl;
      if (imageUrl) existing.image_url = imageUrl;
      globalStore.__mockRevenue = mockRevenue() + delta;
      pushMockActivity(existing, list, nowIso);
      return { ok: true, listing: existing, isNew: false, paidDelta: delta, rank: rankOf(existing, list) };
    }
    const listing: MockListing = {
      id: `mock-${Date.now()}`,
      url,
      platform: platform ?? "website",
      target_url: targetUrl ?? url,
      image_url: imageUrl ?? null,
      display_name: displayName,
      description: description ?? null,
      bid_amount: amount,
      clicks: 0,
      clicks_per_hour: 0,
      created_at: nowIso,
      last_bid_at: nowIso,
    };
    list.push(listing);
    globalStore.__mockRevenue = mockRevenue() + amount;
    pushMockActivity(listing, list, nowIso);
    return { ok: true, listing, isNew: true, paidDelta: amount, rank: rankOf(listing, list) };
  }

  const db = supabaseAdmin();

  // Idempotency: a checkout can fire both `confirmed` and `succeeded` webhooks.
  const { data: claimed } = await db
    .from("processed_checkouts")
    .insert({ checkout_id: orderId })
    .select("checkout_id")
    .maybeSingle();
  if (!claimed) {
    // Already processed — return the current state as a duplicate success.
    const { data: cur } = await db.from("listings").select("*").eq("url", url).maybeSingle();
    if (cur) {
      return { ok: true, listing: cur as Listing, isNew: false, paidDelta: 0, rank: await computeRank(db, cur.id), duplicate: true };
    }
    return { ok: false, reason: "below-current" };
  }

  const { data: existing } = await db.from("listings").select("*").eq("url", url).maybeSingle();
  const nowIso = new Date().toISOString();

  if (existing) {
    if (amount <= existing.bid_amount) return { ok: false, reason: "below-current" };
    const delta = amount - existing.bid_amount;
    const { data: updated, error } = await db
      .from("listings")
      .update({
        bid_amount: amount,
        description: description ?? existing.description,
        target_url: targetUrl ?? existing.target_url,
        image_url: imageUrl ?? existing.image_url,
        last_bid_at: nowIso,
        updated_at: nowIso,
        polar_order_id: orderId,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    const rank = await computeRank(db, updated.id);
    await db.from("activity").insert({
      listing_id: updated.id,
      display_name: updated.display_name,
      amount,
      rank,
    });
    await addRevenue(db, delta);
    return { ok: true, listing: updated, isNew: false, paidDelta: delta, rank };
  }

  const { data: created, error } = await db
    .from("listings")
    .insert({
      url,
      platform: platform ?? "website",
      display_name: displayName,
      description: description ?? null,
      target_url: targetUrl ?? url,
      image_url: imageUrl ?? null,
      bid_amount: amount,
      polar_order_id: orderId,
    })
    .select()
    .single();
  if (error) throw error;
  const rank = await computeRank(db, created.id);
  await db.from("activity").insert({
    listing_id: created.id,
    display_name: created.display_name,
    amount,
    rank,
  });
  await addRevenue(db, amount);
  return { ok: true, listing: created, isNew: true, paidDelta: amount, rank };
}

function rankOf(target: Listing, all: Listing[]): number {
  const sorted = sortBoard(all);
  return sorted.findIndex((l) => l.id === target.id) + 1;
}

function pushMockActivity(listing: Listing, all: Listing[], nowIso: string) {
  const seq = (globalStore.__mockActivitySeq ?? 0) + 1;
  globalStore.__mockActivitySeq = seq;
  mockActivity().unshift({
    id: seq,
    display_name: listing.display_name,
    amount: listing.bid_amount,
    rank: rankOf(listing, all),
    created_at: nowIso,
    image_url: listing.image_url ?? null,
    target_url: listing.target_url || listing.url,
  });
}

async function computeRank(db: SupabaseClient, id: string): Promise<number> {
  const { data } = await db.rpc("listing_rank", { target: id }).maybeSingle();
  if (data != null) return Number(data);
  const { data: all } = await db
    .from("listings")
    .select("id, bid_amount, last_bid_at")
    .eq("is_active", true);
  const sorted = sortBoard((all ?? []) as Listing[]);
  return sorted.findIndex((l) => l.id === id) + 1;
}
