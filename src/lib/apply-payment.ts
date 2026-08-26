// Shared payment-apply logic for the Dodo Payments webhook.
// A webhook's only job: verify the event, extract metadata, and call this.

import { applyPaidListing, getListingByUrl } from "@/lib/store";
import { isPlatform } from "@/lib/platforms";
import { normalizeEmail } from "@/lib/store";

export type CheckoutMetadata = Record<string, string>;

export type PaymentAttribution = {
  /** Verified payer email from the Dodo payment payload. */
  payerEmail?: string | null;
  /** Session user id set at checkout creation when the payer was logged in. */
  userId?: string | null;
};

/** Extract the payer email from a payment.succeeded payload (best effort). */
export function payerEmailFromPayload(data: Record<string, unknown>): string | null {
  const customer = data.customer as { email?: string | null } | null | undefined;
  return normalizeEmail(customer?.email) || null;
}

/** Extract a valid uuid user id from checkout metadata (server-set, trusted). */
export function userIdFromMetadata(metadata: CheckoutMetadata): string | null {
  const raw = metadata.user_id ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

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
  orderId: string,
  attribution: PaymentAttribution = {}
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
    payerEmail: attribution.payerEmail ?? (normalizeEmail(metadata.email) || null),
    userId: attribution.userId ?? null,
  });

  if (!result.ok) console.error("payment apply failed", orderId, result.reason);
  return { ok: result.ok, reason: result.ok ? undefined : result.reason };
}
