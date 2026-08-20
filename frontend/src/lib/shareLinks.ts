import type { ShareChannel } from "@/types";

/**
 * The absolute form of a share code (migration 0052).
 *
 * Short by design and it has to stay that way: WhatsApp Status carries no
 * tappable links, so a seller's audience reads this off a screen and types it.
 * `pulseshop.space/s/K3QF9` is 24 characters and survives that; the same
 * destination as a product URL with a tracking tail does not.
 */
export const shareUrl = (
  code: string,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
) => `${origin}/s/${code}`;

/**
 * Mint (or re-fetch) a share link and return its URL, falling back to the
 * plain destination when the caller can't have one.
 *
 * Two callers can't: a shopper sharing someone else's product, and anyone at
 * all when the RPC fails. Both must still get a working link — the share sheet
 * exists to spread the product, and refusing to share because the attribution
 * layer is unavailable would trade the whole point for the bookkeeping.
 *
 * `isOwner` is passed rather than derived here because the caller already
 * knows: the product page has resolved both the session and the merchant, and
 * asking the server again would be a round trip to learn what is already on
 * screen.
 */
export async function shareableUrl(
  ensure: (productId: string | null, channel: ShareChannel, label?: string) => Promise<string>,
  opts: { isOwner: boolean; productId: string | null; channel: ShareChannel; fallbackUrl: string },
): Promise<string> {
  if (!opts.isOwner) return opts.fallbackUrl;
  try {
    const code = await ensure(opts.productId, opts.channel);
    return shareUrl(code);
  } catch {
    return opts.fallbackUrl;
  }
}
