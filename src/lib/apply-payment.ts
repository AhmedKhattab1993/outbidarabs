// Shared payment-apply logic for the Dodo Payments webhook.
// A webhook's only job: verify the event, extract metadata, and call this.

import { applyPaidListing, getListingByUrl } from "@/lib/store";
import { isPlatform } from "@/lib/platforms";

export type CheckoutMetadata = Record<string, string>;

/**
 * Apply a paid checkout from its metadata (attached at checkout creation).
 *
 * Race safety: the board may have moved between checkout creation and the
 * webhook. The payer paid `charge` to reach `amount` — if the listing's
 * current bid is already ≥ amount, the payment still buys exactly that raise:
 * current_bid + charge.
 */
export async function applyPaidCheckout(
  metadata: CheckoutMetadata,
  orderId: string
): Promise<{ ok: boolean; reason?: string }> {
  const identityUrl = metadata.identity_url;
  const amount = parseInt(String(metadata.amount ?? "0"), 10);
  const charge = parseInt(String(metadata.charge ?? "0"), 10) || amount;
  if (!identityUrl || !amount) {
    console.error("payment webhook missing metadata", orderId, metadata);
    return { ok: false, reason: "missing-metadata" };
  }

  const current = await getListingByUrl(identityUrl);
  let effectiveAmount = amount;
  if (current && amount <= current.bid_amount) {
    effectiveAmount = current.bid_amount + charge;
  }

  const result = await applyPaidListing({
    url: identityUrl,
    platform: isPlatform(metadata.platform) ? metadata.platform : undefined,
    displayName: metadata.display_name ?? identityUrl,
    description: metadata.description || null,
    imageUrl: metadata.image_url || null,
    targetUrl: metadata.target_url || null,
    amount: effectiveAmount,
    orderId,
  });

  if (!result.ok) console.error("payment apply failed", orderId, result.reason);
  return { ok: result.ok, reason: result.ok ? undefined : result.reason };
}
