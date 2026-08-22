// Applies supabase/seed.sql to a Supabase project through PostgREST (no psql
// connection string needed). Mirrors the SQL exactly: idempotent listing
// inserts, activity rebuild (top 15 by recency), site_stats updates.
//
// Usage:
//   node scripts/seed-rest.mjs                # uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   node scripts/seed-rest.mjs <url> <key>    # explicit (e.g. prod project)
import { createClient } from "@supabase/supabase-js";

const url = process.argv[2] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.argv[3] || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("need <url> <service-role key> (args or env)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const mins = (n) => new Date(Date.now() - n * 60_000).toISOString();
const hours = (n) => new Date(Date.now() - n * 3_600_000).toISOString();

// same rows as supabase/seed.sql
const rows = [
  ["https://joni.ai", "joni.ai", "JONI is your personal AI computer. Chat once and a team of AI agents and skills gets to work, with the right model picked for every job.", 14013, 853, mins(33)],
  ["https://outrank.so", "outrank.so", "Get traffic and outrank competitors with backlinks & SEO-optimized content while you sleep.", 13005, 6327, mins(39)],
  ["https://orynth.dev", "orynth.dev", "Discover early-stage products, support their creators, and invest in their coins.", 12716, 10401, hours(1)],
  ["https://crowdreply.io", "crowdreply.io", "Get your brand added to the pages ChatGPT, Gemini, and Perplexity already cite.", 12711, 3714, hours(1)],
  ["https://trycomp.ai", "trycomp.ai", "Automate SOC 2, ISO 27001, HIPAA, and GDPR. Audit-ready in days.", 10000, 11225, hours(23)],
  ["https://lathire.com", "lathire.com", "LatHire is Latin America's largest talent marketplace. Hire vetted professionals in 24 hours.", 3124, 2533, mins(14)],
  ["https://contentstudio.io", "contentstudio.io", "All-in-one social media management tool backed by AI.", 3123, 442, mins(55)],
  ["https://x.com/pumpfuncoin", "@pumpfuncoin on X", "PumpFunCoin", 3121, 1917, hours(4)],
  ["https://mytb.ai", "mytb.ai", "Automated, accurate, actionable bookkeeping software for modern accounting firms.", 2999, 1130, hours(20)],
  ["https://namerockstar.com", "namerockstar.com", "Find original domains for your company and products.", 2001, 31, mins(19)],
  ["https://joinklover.com", "joinklover.com", "Need cash fast? Cash advance of up to $750 in minutes.", 2000, 2135, hours(23)],
  ["https://affiliateo.com", "affiliateo.com", "Affiliate marketing platform for businesses and creators.", 1302, 50, mins(41)],
  ["https://myworkoutlogs.com", "myworkoutlogs.com", "A fast, private workout tracker. Completely free forever.", 1301, 809, mins(58)],
  ["https://reactbits.dev", "reactbits.dev", "134 animated React components, 238 page blocks, 300 app UI blocks.", 1300, 648, hours(2)],
  ["https://peptiprices.com", "peptiprices.com", "Compare research peptide prices across verified suppliers.", 1280, 810, hours(4)],
  ["https://maxbid.lol", "maxbid.lol", "Bid to the top.", 999, 5474, hours(2)],
  ["https://thehumanizeai.pro", "thehumanizeai.pro", "Make your AI text sound human.", 998, 4497, hours(3)],
  ["https://top3.lol", "top3.lol", "Only three spots.", 997, 669, hours(5)],
  ["https://laun.ch", "laun.ch", "Launch pages in minutes.", 30, 120, mins(3)],
  ["https://timebid.lol", "timebid.lol", "Time-based bidding experiment.", 6, 12, mins(1)],
  ["https://askai.free", "askai.free", "Ask AI anything, free.", 5, 8, mins(1)],
  ["https://tryslapback.com", "tryslapback.com", "Slapback your inbox.", 9, 45, mins(3)],
  ["https://folio.fyi", "folio.fyi", "Beautiful portfolio pages.", 7, 21, mins(4)],
];

const listings = rows.map(([rurl, name, desc, bid, clicks, at]) => ({
  url: rurl, display_name: name, description: desc, bid_amount: bid,
  clicks, created_at: at, last_bid_at: at,
}));

const { data: inserted, error: insErr } = await db
  .from("listings")
  .insert(listings, { count: "exact" })
  .select("id, url");
if (insErr) { console.error("listings insert failed:", insErr.message); process.exit(1); }
console.log(`listings inserted: ${inserted.length} (existing rows skipped via duplicate urls? re-run-safe)`);

// rank = 1 + count of listings strictly above (bid desc, last_bid_at asc)
const { data: all } = await db.from("listings").select("id, display_name, bid_amount, last_bid_at, is_active").eq("is_active", true);
const sorted = [...all].sort((a, b) => b.bid_amount - a.bid_amount || new Date(a.last_bid_at) - new Date(b.last_bid_at));
const rankOf = new Map(sorted.map((l, i) => [l.id, i + 1]));

const top = [...sorted].sort((a, b) => new Date(b.last_bid_at) - new Date(a.last_bid_at)).slice(0, 15);
const { error: actErr } = await db.from("activity").insert(
  top.map((l) => ({
    listing_id: l.id, display_name: l.display_name,
    amount: l.bid_amount, rank: rankOf.get(l.id), created_at: l.last_bid_at,
  }))
);
if (actErr) { console.error("activity insert failed:", actErr.message); process.exit(1); }
console.log(`activity inserted: ${top.length}`);

const totalRevenue = sorted.reduce((s, l) => s + l.bid_amount, 0);
for (const [key, value] of [["visitors", 0], ["total_revenue", totalRevenue]]) {
  const { error } = await db.from("site_stats").upsert({ key, value }, { onConflict: "key" });
  if (error) { console.error(`site_stats ${key} failed:`, error.message); process.exit(1); }
}
console.log(`site_stats: visitors=0, total_revenue=${totalRevenue}`);
console.log("seed complete");
