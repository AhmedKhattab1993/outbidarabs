import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentity } from "@/lib/identity";
import { getListingByUrl, getTopListing } from "@/lib/store";
import { isPlatform } from "@/lib/platforms";

export const dynamic = "force-dynamic";

// Live lookup used by the claim form while typing: detects an existing
// listing (→ "Pay $N more" flow) and returns the current #1 context.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platformHint = isPlatform(searchParams.get("platform"))
    ? (searchParams.get("platform") as never)
    : undefined;
  const identity = normalizeIdentity(searchParams.get("identity") ?? "", platformHint);
  if (!identity.ok) return NextResponse.json({ existing: null, topBid: 0, topUrl: null });

  const [existing, top] = await Promise.all([
    getListingByUrl(identity.url),
    getTopListing(),
  ]);
  return NextResponse.json({
    existing: existing
      ? {
          url: existing.url,
          display_name: existing.display_name,
          bid_amount: existing.bid_amount,
          platform: existing.platform,
        }
      : null,
    topBid: top?.bid_amount ?? 0,
    topUrl: top?.url ?? null,
  });
}
