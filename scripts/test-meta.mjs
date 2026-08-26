// Verify platform metadata fetching end-to-end against live upstreams.
//
//   node --experimental-strip-types scripts/test-meta.mjs
//
// Each row prints OK/FAIL (any of title/description/image found), latency,
// and what came back. Latency is bounded by OVERALL_BUDGET_MS (fetch-meta).
import { fetchListingMeta } from "../src/lib/fetch-meta.ts";

const CASES = [
  ["instagram", "https://instagram.com/nasa", "https://www.instagram.com/nasa/"],
  ["instagram", "https://instagram.com/khaby.lame", "https://www.instagram.com/khaby.lame/"],
  ["tiktok", "https://tiktok.com/@khaby.lame", "https://www.tiktok.com/@khaby.lame"],
  ["tiktok", "https://tiktok.com/@nasa", "https://www.tiktok.com/@nasa"],
  ["x", "https://x.com/nasa", "https://x.com/nasa"],
  ["linkedin", "https://linkedin.com/in/satyanadella", "https://www.linkedin.com/in/satyanadella/"],
  ["website", "https://ar.wikipedia.org/wiki/Main_Page", "https://ar.wikipedia.org/wiki/Main_Page"],
  ["app", "https://apps.apple.com/us/app/facebook/id284882215", "https://apps.apple.com/us/app/facebook/id284882215"],
  ["app", "https://play.google.com/store/apps/details?id=com.whatsapp", "https://play.google.com/store/apps/details?id=com.whatsapp"],
];

let fails = 0;
for (const [platform, url, href] of CASES) {
  const t0 = Date.now();
  const meta = await fetchListingMeta(platform, url, href);
  const ms = Date.now() - t0;
  const ok = !!(meta.title || meta.description || meta.image);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${String(ms).padStart(6)}ms  ${platform.padEnd(9)} ${url}\n` +
      `      title=${JSON.stringify(meta.title)}\n` +
      `      image=${meta.image ? meta.image.slice(0, 80) : null}`
  );
}
process.exit(fails ? 1 : 0);
