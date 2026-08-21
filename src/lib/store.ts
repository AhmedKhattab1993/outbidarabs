import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ActivityItem, LeaderboardPage, Listing, SiteStats, TrendingItem } from "@/lib/types";
import { MIN_BID, MAX_BID } from "@/lib/i18n";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const MOCK_MODE =
  !SUPABASE_URL || !SUPABASE_ANON || process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export const PER_PAGE = 15;

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

const SEED: Array<[string, string, string, number, number, number]> = [
  // url, display, description, bid, clicks, clicks/h
  ["https://joni.ai", "joni.ai", "JONI is your personal AI computer. Chat once and a team of AI agents and skills gets to work, with the right model picked for every job.", 14013, 853, 852],
  ["https://outrank.so", "outrank.so", "Get traffic and outrank competitors with backlinks & SEO-optimized content while you sleep.", 13005, 6327, 4497],
  ["https://orynth.dev", "orynth.dev", "Discover early-stage products, support their creators, and invest in their coins.", 12716, 10401, 659],
  ["https://crowdreply.io", "crowdreply.io", "Get your brand added to the pages ChatGPT, Gemini, and Perplexity already cite.", 12711, 3714, 669],
  ["https://trycomp.ai", "trycomp.ai", "Automate SOC 2, ISO 27001, HIPAA, and GDPR. Audit-ready in days.", 10000, 11225, 5474],
  ["https://lathire.com", "lathire.com", "Hire vetted tech and generalist professionals in as little as 24 hours, for up to 80% less.", 3124, 2533, 244],
  ["https://contentstudio.io", "contentstudio.io", "All-in-one social media management tool backed by AI.", 3123, 442, 96],
  ["https://x.com/PumpFunCoin", "PumpFunCoin on X", "PumpFunCoin", 3121, 1917, 130],
  ["https://mytb.ai", "mytb.ai", "Automated, accurate, actionable bookkeeping for modern accounting firms.", 2999, 1130, 88],
  ["https://namerockstar.com", "namerockstar.com", "Find original domains for your company and products.", 2001, 31, 4],
  ["https://joinklover.com", "joinklover.com", "Cash advance of up to $750 in minutes.", 2000, 2135, 210],
  ["https://affiliateo.com", "affiliateo.com", "Affiliate marketing platform for businesses and creators.", 1302, 50, 12],
  ["https://myworkoutlogs.com", "myworkoutlogs.com", "A fast, private workout tracker. Free forever.", 1301, 809, 71],
  ["https://reactbits.dev", "reactbits.dev", "134 animated React components, 238 page blocks, 300 app UI blocks.", 1300, 648, 51],
  ["https://peptiprices.com", "peptiprices.com", "Compare research peptide prices across verified suppliers.", 1280, 810, 33],
  ["https://maxbid.lol", "maxbid.lol", "Bid to the top.", 999, 5474, 420],
  ["https://thehumanizeai.pro", "thehumanizeai.pro", "Make your AI text sound human.", 998, 4497, 380],
  ["https://top3.lol", "top3.lol", "Only three spots.", 997, 669, 45],
  ["https://laun.ch", "laun.ch", "Launch pages in minutes.", 30, 120, 9],
  ["https://timebid.lol", "timebid.lol", "Time-based bidding experiment.", 6, 12, 1],
  ["https://askai.free", "askai.free", "Ask AI anything, free.", 5, 8, 1],
  ["https://tryslapback.com", "tryslapback.com", "Slapback your inbox.", 9, 45, 3],
  ["https://folio.fyi", "folio.fyi", "Beautiful portfolio pages.", 7, 21, 2],
];

function mockSeed(): MockListing[] {
  const now = Date.now();
  return SEED.map((s, i) => ({
    id: `seed-${i}`,
    url: s[0],
    display_name: s[1],
    description: s[2],
    bid_amount: s[3],
    clicks: s[4],
    clicks_per_hour: s[5],
    created_at: new Date(now - (i + 1) * 3 * HOUR).toISOString(),
    last_bid_at: new Date(now - (i * 9 + 1) * MINUTE).toISOString(),
  }));
}

const globalStore = globalThis as unknown as {
  __mockListings?: MockListing[];
  __mockActivity?: ActivityItem[];
  __mockActivitySeq?: number;
  __mockVisitors?: number;
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

export async function getLeaderboard(page = 1): Promise<LeaderboardPage> {
  if (MOCK_MODE) {
    const all = sortBoard(mockListings().filter((l) => (l as MockListing).url !== ""));
    const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const p = Math.min(Math.max(1, page), totalPages);
    return {
      listings: all.slice((p - 1) * PER_PAGE, p * PER_PAGE),
      totalPages,
      topBid: all[0]?.bid_amount ?? 0,
    };
  }
  const { data, error } = await supabase()
    .from("listings")
    .select("*")
    .eq("is_active", true)
    .order("bid_amount", { ascending: false })
    .order("last_bid_at", { ascending: true })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (error) throw error;
  const countRes = await supabase()
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  const count = countRes.count ?? PER_PAGE;
  const topRes = await supabase()
    .from("listings")
    .select("bid_amount")
    .eq("is_active", true)
    .order("bid_amount", { ascending: false })
    .limit(1);
  return {
    listings: (data ?? []) as Listing[],
    totalPages: Math.max(1, Math.ceil(count / PER_PAGE)),
    topBid: topRes.data?.[0]?.bid_amount ?? 0,
  };
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
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ActivityItem[];
}

export async function getStats(): Promise<SiteStats> {
  if (MOCK_MODE) {
    const all = mockListings();
    const sorted = sortBoard(all);
    return {
      online: 300 + Math.floor(1200 * (0.5 + 0.5 * Math.sin(Date.now() / 60_000))) + Math.floor(Math.random() * 200),
      visitors: 1_085_026 + (globalStore.__mockVisitors ?? 0),
      totalRevenue: all.reduce((s, l) => s + l.bid_amount, 0),
      listingCount: all.length,
      highestBid: sorted[0]?.bid_amount ?? 0,
      highestBidder: sorted[0]?.display_name ?? null,
    };
  }
  const [statsRes, aggRes, topRes, countRes] = await Promise.all([
    supabase().from("site_stats").select("key, value"),
    supabase().from("listings").select("bid_amount").eq("is_active", true),
    supabase()
      .from("listings")
      .select("bid_amount, display_name")
      .eq("is_active", true)
      .order("bid_amount", { ascending: false })
      .limit(1),
    supabase().from("listings").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const stats = new Map((statsRes.data ?? []).map((s: any) => [s.key, s.value]));
  const revenue = (aggRes.data ?? []).reduce((s: number, l: any) => s + l.bid_amount, 0);
  return {
    online: 0, // computed client-side via realtime presence
    visitors: stats.get("visitors") ?? 0,
    totalRevenue: revenue,
    listingCount: countRes.count ?? 0,
    highestBid: topRes.data?.[0]?.bid_amount ?? 0,
    highestBidder: topRes.data?.[0]?.display_name ?? null,
  };
}

export async function bumpVisitors(): Promise<number> {
  if (MOCK_MODE) {
    globalStore.__mockVisitors = (globalStore.__mockVisitors ?? 0) + 1;
    return globalStore.__mockVisitors;
  }
  const { data, error } = await supabaseAdmin().rpc("bump_stat", { key: "visitors" }).maybeSingle();
  if (error || data == null) {
    await supabaseAdmin()
      .from("site_stats")
      .upsert({ key: "visitors", value: 1 }, { onConflict: "key", ignoreDuplicates: false });
    return 1;
  }
  return Number(data);
}

export async function getListingByUrl(url: string): Promise<Listing | null> {
  if (MOCK_MODE) {
    return mockListings().find((l) => l.url === url) ?? null;
  }
  const { data } = await supabase().from("listings").select("*").eq("url", url).maybeSingle();
  return (data as Listing) ?? null;
}

export async function registerClick(id: string): Promise<string | null> {
  if (MOCK_MODE) {
    const l = mockListings().find((x) => x.id === id);
    if (!l) return null;
    l.clicks += 1;
    l.clicks_per_hour += 1;
    return l.url;
  }
  await supabaseAdmin().rpc("register_click", { p_listing: id });
  const { data } = await supabase().from("listings").select("url").eq("id", id).single();
  return data?.url ?? null;
}

export type ApplyResult =
  | { ok: true; listing: Listing; isNew: boolean; paidDelta: number; rank: number }
  | { ok: false; reason: "too-low" | "below-current" | "over-max" };

/**
 * Apply a completed payment. Rules:
 *  - new listing: bid must be >= $5 (MAX_BID cap)
 *  - raise: new total must be > current bid; payer pays the difference
 *  - rank is recomputed and the activity feed gets a new row
 */
export async function applyPaidListing(params: {
  url: string;
  displayName: string;
  description?: string | null;
  amount: number;
  orderId: string;
}): Promise<ApplyResult> {
  const { url, displayName, description, amount, orderId } = params;
  if (amount > MAX_BID) return { ok: false, reason: "over-max" };
  if (amount < MIN_BID) return { ok: false, reason: "too-low" };

  if (MOCK_MODE) {
    const list = mockListings();
    const existing = list.find((l) => l.url === url);
    const nowIso = new Date().toISOString();
    let listing: MockListing;
    let isNew = false;
    if (existing) {
      if (amount <= existing.bid_amount) return { ok: false, reason: "below-current" };
      const delta = amount - existing.bid_amount;
      existing.bid_amount = amount;
      existing.last_bid_at = nowIso;
      if (description) existing.description = description;
      listing = existing;
      pushMockActivity(existing, list, nowIso);
      return { ok: true, listing, isNew: false, paidDelta: delta, rank: rankOf(existing, list) };
    }
    isNew = true;
    listing = {
      id: `mock-${Date.now()}`,
      url,
      display_name: displayName,
      description: description ?? null,
      bid_amount: amount,
      clicks: 0,
      clicks_per_hour: 0,
      created_at: nowIso,
      last_bid_at: nowIso,
    };
    list.push(listing);
    pushMockActivity(listing, list, nowIso);
    return { ok: true, listing, isNew, paidDelta: amount, rank: rankOf(listing, list) };
  }

  const db = supabaseAdmin();
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
    return { ok: true, listing: updated, isNew: false, paidDelta: delta, rank };
  }

  const { data: created, error } = await db
    .from("listings")
    .insert({
      url,
      display_name: displayName,
      description: description ?? null,
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
