/**
 * "N+ bought in past month" — the recent-demand line on a product tile.
 *
 * Two rules, both deliberate.
 *
 * The threshold. Below it the line is not shown at all, because a small number
 * is worse than no number: "3+ bought in past month" reads as nobody is buying
 * this, which is exactly the wrong thing to print next to an Add to Cart button.
 * Social proof only works upward.
 *
 * The rounding. The figure is always rounded DOWN to a round number and shown
 * with a "+", so it never overstates. 137 becomes "100+", 1,940 becomes "1K+".
 * Beyond being the convention shoppers already read this way, it keeps the badge
 * from being a live counter of a seller's exact sales.
 */

/**
 * Below this many units in the last 30 days, no badge.
 *
 * Worth knowing before tuning: this is a per-PRODUCT count, not per shop. A
 * single listing moving 100 units in a month is a serious seller, so on a
 * typical PulseShop catalogue this badge will be rare by design. Lower it to
 * ~20 if the intent is for it to appear on a shop's genuine best-sellers rather
 * than only on outliers.
 */
export const SOLD_BADGE_MIN = 100;

/** True when this product has moved enough for the badge to say so. */
export const showsSoldBadge = (sold: number | undefined): sold is number =>
  sold !== undefined && sold > SOLD_BADGE_MIN;

/** 137 -> "100+", 1_940 -> "1K+", 5_400 -> "5K+". Always rounds down. */
export function soldLabel(sold: number): string {
  if (sold >= 1000) return `${Math.floor(sold / 1000)}K+`;
  return `${Math.floor(sold / 100) * 100}+`;
}
