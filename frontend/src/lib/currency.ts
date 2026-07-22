/**
 * Single source of truth for currency formatting.
 * Locked to KES for now; swap CURRENCY/LOCALE to make it configurable later.
 */
const CURRENCY = "KES";
const LOCALE = "en-KE";

const formatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatKes(amount: number): string {
  return formatter.format(amount);
}

/**
 * Final price after any percentage discount.
 *
 * Multiply BEFORE dividing. The obvious `price * (1 - pct/100)` is wrong at the
 * shilling: `1 - 33/100` is 0.6699999999999999 in binary floating point, so a
 * 1,350 item at -33% comes out as 904.4999999999999 and rounds DOWN to 904 —
 * while Postgres, which does this in exact `numeric`, gets 904.5 and rounds UP
 * to 905. The buyer was shown 904 and charged 905.
 *
 * `price * (100 - pct)` stays a whole number (well inside 2^53 at our price
 * ceiling), and dividing that by 100 lands exactly on the .5 boundary when
 * there is one — where JS half-up and Postgres half-away-from-zero agree,
 * because the value is positive. Verified against the live database across 150
 * price/discount/adjustment combinations.
 */
export function discountedPrice(price: number, discountPct: number | null): number {
  if (!discountPct) return price;
  return Math.round((price * (100 - discountPct)) / 100);
}

/**
 * Variant pricing.
 *
 * A product with variants doesn't have "a price" — it has a base price plus a
 * per-size and per-colour adjustment, and what a shopper pays depends on what
 * they picked. Every one of these mirrors a SQL function from migration 0027
 * (effective_price / variant_adj / variant_min_adj) to the shilling. They have
 * to: the browser decides what the shopper is SHOWN and place_order decides
 * what they are CHARGED, and a disagreement between those two is a customer
 * service problem, not a rounding error. Math.round and Postgres round() agree
 * on positive halves, which is what makes that possible.
 */
export type PriceAdjustments = Record<string, number>;

/** The fields any price calculation needs. Product satisfies this. */
export interface Priceable {
  priceKes: number;
  discountPct: number | null;
  sizes: string[] | null;
  colors: string[] | null;
  sizePriceAdj: PriceAdjustments;
  colorPriceAdj: PriceAdjustments;
}

/** effective_price(): base + adjustment, then the discount. Never below zero.
 * Integer-first, for the reason spelled out on discountedPrice above. */
const applyAdj = (price: number, discountPct: number | null, adj: number) =>
  Math.max(0, Math.round(((price + adj) * (100 - (discountPct ?? 0))) / 100));

/** variant_adj(): a missing key — or no choice made — is +0. */
export const variantAdj = (map: PriceAdjustments, key: string | null) =>
  key ? (map[key] ?? 0) : 0;

/** variant_min_adj(): cheapest adjustment across the options actually offered. */
const minAdj = (map: PriceAdjustments, options: string[] | null) =>
  options?.length ? Math.min(...options.map((o) => map[o] ?? 0)) : 0;

const maxAdj = (map: PriceAdjustments, options: string[] | null) =>
  options?.length ? Math.max(...options.map((o) => map[o] ?? 0)) : 0;

/** What a fully-specified selection costs — the number the buyer is charged. */
export function variantPrice(p: Priceable, size: string | null, color: string | null): number {
  return applyAdj(
    p.priceKes,
    p.discountPct,
    variantAdj(p.sizePriceAdj, size) + variantAdj(p.colorPriceAdj, color),
  );
}

/** The cheapest this product can be bought for — what the grid sorts and the
 * price filter compares on, server-side and here. */
export const minVariantPrice = (p: Priceable) =>
  applyAdj(p.priceKes, p.discountPct, minAdj(p.sizePriceAdj, p.sizes) + minAdj(p.colorPriceAdj, p.colors));

export const maxVariantPrice = (p: Priceable) =>
  applyAdj(p.priceKes, p.discountPct, maxAdj(p.sizePriceAdj, p.sizes) + maxAdj(p.colorPriceAdj, p.colors));

/** True when variants genuinely differ in price, so a single figure would lie. */
export const hasPriceRange = (p: Priceable) => minVariantPrice(p) !== maxVariantPrice(p);

/**
 * The price to SHOW mid-selection. A dimension the shopper hasn't chosen yet
 * contributes its cheapest option, so the figure only ever climbs as they
 * choose — quoting the base price and then revising upward reads as a
 * bait-and-switch, even when it isn't one.
 */
export function priceForSelection(
  p: Priceable,
  size: string | null,
  color: string | null,
): number {
  return applyAdj(
    p.priceKes,
    p.discountPct,
    (size ? variantAdj(p.sizePriceAdj, size) : minAdj(p.sizePriceAdj, p.sizes)) +
      (color ? variantAdj(p.colorPriceAdj, color) : minAdj(p.colorPriceAdj, p.colors)),
  );
}

/** The pre-discount equivalent of priceForSelection, for the struck-through
 * "was" figure — it has to move with the variant too, or a discounted XL shows
 * the base product's old price crossed out. */
export function listPriceForSelection(
  p: Priceable,
  size: string | null,
  color: string | null,
): number {
  return applyAdj(
    p.priceKes,
    null,
    (size ? variantAdj(p.sizePriceAdj, size) : minAdj(p.sizePriceAdj, p.sizes)) +
      (color ? variantAdj(p.colorPriceAdj, color) : minAdj(p.colorPriceAdj, p.colors)),
  );
}
