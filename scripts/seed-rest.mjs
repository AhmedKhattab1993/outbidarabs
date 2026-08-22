// Applies the platform-focused seed board to a Supabase project through
// PostgREST (no psql connection string needed). Mirrors supabase/seed.sql.
//
// Usage:
//   node scripts/seed-rest.mjs                # uses SUPABASE_URL + SERVICE_ROLE_KEY
//   node scripts/seed-rest.mjs <url> <key>    # explicit (e.g. prod project)
//   node scripts/seed-rest.mjs --fresh ...    # delete existing listings first
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const positional = args.filter((a) => !a.startsWith("--"));
const url = positional[0] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = positional[1] || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("need <url> <service-role key> (args or env)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const mins = (n) => new Date(Date.now() - n * 60_000).toISOString();
const hours = (n) => new Date(Date.now() - n * 3_600_000).toISOString();

// url, platform, display, description, bid, clicks, last_bid_at
const rows = [
  ["https://instagram.com/noor.cooks", "instagram", "@noor.cooks", "وصفات بيتية مصرية سهلة كل يوم", 8201, 853, mins(33)],
  ["https://instagram.com/omar.fits", "instagram", "@omar.fits", "تمارين بيتية بدون أجهزة — برنامجك في 20 دقيقة", 6104, 6327, mins(39)],
  ["https://tiktok.com/@mona.makes", "tiktok", "@mona.makes", "شغلات يدوية وديكور بيديك", 5888, 10401, hours(1)],
  ["https://instagram.com/layan.art", "instagram", "@layan.art", "رسم ديجيتال وكاليجرافي عربي", 4321, 3714, hours(1)],
  ["https://tiktok.com/@yahya.dubs", "tiktok", "@yahya.dubs", "دبلجة كوميدية للمشاهد المشهورة", 3999, 11225, hours(23)],
  ["https://tiktok.com/@sara.skincare", "tiktok", "@sara.skincare", "روتين عناية بالبشرة للبشرة العربية", 3100, 2533, mins(14)],
  ["https://x.com/arabdevnotes", "x", "@arabdevnotes", "أدوات وأخبار تقنية للمطورين العرب", 2800, 442, mins(55)],
  ["https://instagram.com/khaled.travelz", "instagram", "@khaled.travelz", "رحلات موفرة في الخليج ومصر", 2417, 1917, hours(4)],
  ["https://tiktok.com/@fofo.comedy", "tiktok", "@fofo.comedy", "سكتشات كوميدية عن الحياة اليومية", 1999, 1130, hours(20)],
  ["https://x.com/startupgcc", "x", "@startupgcc", "شركات ناشئة واستثمار في الخليج", 1500, 50, mins(19)],
  ["https://linkedin.com/in/layla-hassan", "linkedin", "Layla Hassan", "Product Manager | الرياض", 1200, 809, mins(41)],
  ["https://chefsouq.com", "website", "chefsouq.com", "كل حاجة للمطبخ بتوصيل لنفس اليوم", 999, 648, hours(2)],
  ["https://instagram.com/bassam.builds", "instagram", "@bassam.builds", "مشاريع DIY بالعربي للأطفال والكبار", 888, 810, hours(4)],
  ["https://launcharabia.com", "website", "launcharabia.com", "دليل إطلاق منتجك الأول بالعربي", 777, 5474, hours(2)],
  ["https://x.com/tamergad", "x", "@tamergad", "تقييمات أجهزة وتقنية بالعربي", 666, 4497, hours(3)],
  ["https://tiktok.com/@hind.recipes", "tiktok", "@hind.recipes", "وصفات سريعة في دقيقتين", 555, 669, hours(5)],
  ["https://apps.apple.com/ar/app/wasfati/id1494567890", "app", "وصفاتي", "وصفات عربية خطوة بخطوة", 444, 120, mins(3)],
  ["https://3laam.com", "website", "3laam.com", "محتوى ومقالات عربية مبسطة", 333, 12, mins(1)],
  ["https://play.google.com/store/apps/details?id=com.hogag.app", "app", "حجز ملاعب", "احجز ملعبك مع أصحابك في دقيقة", 222, 8, mins(1)],
  ["https://instagram.com/dina.decor", "instagram", "@dina.decor", "ديكور الدار بأقل تكلفة", 111, 45, mins(3)],
  ["https://tiktok.com/@ziad.guitar", "tiktok", "@ziad.guitar", "تعلم الجيتار من الصفر بالعربي", 55, 21, mins(4)],
];

if (fresh) {
  // FK cascades wipe clicks/activity rows tied to the old board.
  const { error: delErr } = await db.from("listings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) { console.error("fresh delete failed:", delErr.message); process.exit(1); }
  console.log("fresh: existing listings deleted");
}

const listings = rows.map(([rurl, platform, name, desc, bid, clicks, at]) => ({
  url: rurl, platform, display_name: name, description: desc, bid_amount: bid,
  clicks, created_at: at, last_bid_at: at,
}));

const { data: inserted, error: insErr } = await db
  .from("listings")
  .upsert(listings, { onConflict: "url", ignoreDuplicates: true })
  .select("id, url");
if (insErr) { console.error("listings insert failed:", insErr.message); process.exit(1); }
console.log(`listings on board: ${inserted.length}`);

// rank = 1 + position of the listing (bid desc, last_bid_at asc)
const { data: all } = await db.from("listings").select("id, display_name, bid_amount, last_bid_at, is_active").eq("is_active", true);
const sorted = [...all].sort((a, b) => b.bid_amount - a.bid_amount || new Date(a.last_bid_at) - new Date(b.last_bid_at));
const rankOf = new Map(sorted.map((l, i) => [l.id, i + 1]));

await db.from("activity").delete().neq("id", 0);
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
for (const [key, value] of [["total_revenue", totalRevenue]]) {
  const { error } = await db.from("site_stats").upsert({ key, value }, { onConflict: "key" });
  if (error) { console.error(`site_stats ${key} failed:`, error.message); process.exit(1); }
}
console.log(`site_stats: total_revenue=${totalRevenue}`);
console.log("seed complete");
