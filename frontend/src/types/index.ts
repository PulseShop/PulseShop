export type StockStatus = "available" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  /**
   * URL segment under the shop handle — `/gaminghq/30-inch-gaming-monitor`.
   *
   * Generated from the name on insert and then FROZEN: renaming a product must
   * not change its URL, because by then that URL is in WhatsApp threads, search
   * results and order confirmations. The seller can change it deliberately, and
   * the UI warns them what that costs. See migration 0028.
   */
  slug: string;
  sku: string;
  category: string;
  priceKes: number;
  discountPct: number | null;
  stockQty: number;
  status: StockStatus;
  images: string[];
  sizes: string[] | null;
  /** Colours the seller offers. Null/empty = this product has no colour choice. */
  colors: string[] | null;
  /**
   * Per-option price adjustments in KES, keyed by size/colour name, added to
   * priceKes before the discount. A name that isn't a key is +0, so the common
   * "one price for everything" product carries two empty objects. See
   * lib/currency.ts variantPrice() and migration 0027.
   */
  sizePriceAdj: Record<string, number>;
  colorPriceAdj: Record<string, number>;
  rating: number;
  reviewCount: number;
  summary: string | null;
  description: string;
  /** Seller-authored search-result snippet. Null/empty means lib/seo.ts
   * generates one from the summary, description or price. */
  metaDescription: string | null;
  createdAt: string;

  /** Handle of the shop that owns this product (for public consumer routing). */
  shopSlug?: string;
}

/** One written review shown on a product page (from product_reviews(), migration
 * 0029) — deliberately carries no user_id, only what's safe to render publicly. */
export interface ProductReview {
  stars: number;
  comment: string;
  reviewerName: string | null;
  createdAt: string;
}

/** One review row on the merchant-facing Reviews page — unlike ProductReview
 *  (public, one product, text-only), this carries which product it's for and
 *  includes star-only ratings with no written comment. */
export interface MerchantReviewItem {
  productId: string;
  productName: string;
  image: string;
  stars: number;
  comment: string | null;
  reviewerName: string | null;
  createdAt: string;
}

export interface MerchantReviewsSummary {
  avgRating: number;
  totalReviews: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  items: MerchantReviewItem[];
  totalCount: number;
}

/** One day of the followers chart. `followers` is a true running total (the
 * baseline plus every gain/loss up to and including this day), not a
 * point-in-time snapshot — so it correctly shows churn, not just growth. */
export interface FollowerSeriesPoint {
  date: string;
  followers: number;
  gained: number;
  lost: number;
}

export interface FollowerSeries {
  /** Net followers as of the day before the series starts. */
  baseline: number;
  days: FollowerSeriesPoint[];
}

/** A product thumbnail carried inline on a shop-directory row. */
export interface ShopPreview {
  id: string;
  name: string;
  slug: string;
  image: string;
}

/** How a shop's customers receive their orders (migration 0031). */
export type Fulfillment = "pickup" | "delivery" | "both";

/**
 * Seller-controlled shop status (migration 0032), replacing the old isOnline
 * boolean:
 *  - "open"    normal — listed everywhere, checkout allowed.
 *  - "closed"  temporary break — still listed and browsable, checkout blocked.
 *  - "closing" winding down — hidden from search/directory/sitemap, storefront
 *              404s. Existing orders keep working.
 */
export type ShopStatus = "open" | "closed" | "closing";

export interface Merchant {
  id: string;
  name: string;
  handle: string;
  bio: string;
  location: string;
  avatarUrl: string;
  bannerUrl: string;
  shopStatus: ShopStatus;
  /**
   * Pickup, delivery, or both. Optional because the shop-directory rows on
   * /shops don't carry it (the card doesn't show it) — read it as `?? "both"`.
   * The full getShop/getMerchant reads always populate it.
   */
  fulfillment?: Fulfillment;
  /** Search & sharing, set by the seller. Both may be empty, in which case
   * lib/seo.ts generates a title/description from the shop's own data. */
  tagline: string;
  metaDescription: string;
  stats: { products: number; orders: number; followers: number; rating: number };
  contacts: { whatsapp: string; instagram: string; facebook: string };
  /**
   * Up to 3 recent products, present only on rows from the shop directory. The
   * discover list used to fetch each shop's ENTIRE catalogue just to render
   * these three thumbnails; the directory RPC now embeds them.
   */
  previews?: ShopPreview[];
}

/**
 * One page of a server-paginated list. `total` is the size of the full result
 * set (after filtering), not of `items` — it's what drives "page 3 of 12" and
 * the load-more cutoff.
 */
export interface Paged<T> {
  items: T[];
  total: number;
}

/** The filter aggregates a product list needs but can't derive from one page. */
export interface ShopFacets {
  categories: string[];
  /** Every size/colour offered anywhere in the catalogue — the filter's options.
   * Returned alphabetically; run sizes through sortSizes() before rendering. */
  sizes: string[];
  colors: string[];
  priceCeiling: number;
  total: number;
  available: number;
  low: number;
  out: number;
}

/** The merchant analytics dashboard, computed server-side by merchant_analytics(). */
export interface Analytics {
  revenue: number;
  aov: number;
  orderCount: number;
  paidCount: number;
  pendingCount: number;
  topProducts: { name: string; units: number; revenue: number; image: string }[];
  channels: Record<OrderChannel, number>;
  /** `date` is an ISO calendar day in the caller's timezone. */
  days: { date: string; total: number }[];
  lowStock: { id: string; name: string; stockQty: number; status: StockStatus }[];
  lowStockCount: number;
}

export type OrderChannel = "whatsapp" | "instagram" | "facebook" | "direct";
export type PaymentMethod = "mpesa" | "paypal";
export type PaymentStatus = "idle" | "pending" | "paid" | "failed";

/**
 * A seller-created discount code (migration 0035). Never stacks with a
 * product's own discountPct — the better of the two applies at checkout, not
 * both.
 */
export interface DiscountCode {
  id: string;
  code: string;
  percentOff: number;
  startsAt: string;
  expiresAt: string;
  /** null = uncapped total redemptions. Independent of the one-per-buyer rule,
   * which always applies regardless of this. */
  maxRedemptions: number | null;
  redemptionCount: number;
  appliesTo: "all" | "selected";
  /** Product ids the code applies to. Only meaningful (and only populated by
   * the adapter) when appliesTo === "selected". */
  productIds: string[];
  active: boolean;
  createdAt: string;
}

/** The buyer-facing effect of applying a code, computed before the order is
 * placed. Advisory only — place_order re-validates and re-computes this
 * itself, and its answer is the one that's actually charged. */
export interface DiscountPreview {
  valid: boolean;
  /** Deliberately the SAME generic string for every failure reason — see the
   * comment on place_order's discount handling for why. */
  reason: string | null;
  percentOff: number | null;
  discountKes: number;
  /** Estimated post-discount total. Ignores variant price adjustments; null
   * when invalid. */
  newTotal: number | null;
}

/**
 * What every order submission must carry, on top of the order itself.
 *
 * `idempotencyKey` is minted once per checkout ATTEMPT and replayed on retry:
 * the server returns the ORIGINAL order for a key it has already seen, so a
 * double-tap or an auto-retry cannot buy the same thing twice. (Before this,
 * two identical requests produced two orders and two stock decrements.) Mint it
 * where the attempt begins — a fresh key per request would defeat the point.
 *
 * `captchaToken` is a Turnstile token. Order placement is captcha-gated because
 * placing an order decrements stock before anyone has paid, and the endpoint is
 * reachable by anyone holding the (public) anon key. Undefined when no site key
 * is configured, exactly as on the auth forms.
 */
export interface OrderSubmission {
  idempotencyKey: string;
  captchaToken?: string;
}

export interface OrderDraft extends OrderSubmission {
  productId: string;
  size: string | null;
  color: string | null;
  qty: number;
  customer: { name: string; phone: string; notes: string };
  channel: OrderChannel;
  payment: null | { method: PaymentMethod; status: PaymentStatus };
}

/** A multi-item order from the cart checkout. All items belong to one shop. */
export interface CartOrderDraft extends OrderSubmission {
  shopSlug: string;
  items: { productId: string; size: string | null; color: string | null; qty: number }[];
  customer: { name: string; phone: string; notes: string };
  channel: OrderChannel;
  payment: null | { method: PaymentMethod; status: PaymentStatus };
  /** A code the buyer applied at checkout. Validated and applied server-side
   * in place_order — never trusted for the actual charge. */
  discountCode?: string | null;
}

export interface Favorite {
  productId: string;
  addedAt: string;
}

export interface CartItem {
  productId: string;
  /** Handle of the shop the product belongs to — the cart is one shop at a time. */
  shopSlug: string;
  name: string;
  image: string;
  /** Discounted unit price captured when the item was added. */
  unitPrice: number;
  /** The chosen variant. Both null when the product offers no choice — together
   * with productId they identify the cart LINE, so Red-M and Blue-M are two
   * lines rather than one (see the cart_items primary key, migration 0026). */
  size: string | null;
  color: string | null;
  qty: number;
  /** Stock at add-time — used to cap the quantity stepper. */
  stockQty: number;
}

/** One line of a placed order, as the merchant sees it in their dashboard. */
export interface OrderLine {
  productName: string;
  image: string;
  size: string | null;
  color: string | null;
  qty: number;
  unitPriceKes: number;
  lineTotalKes: number;
}

/**
 * What placing an order returns to the buyer: the human reference plus the
 * secret access key. The key is what lets that buyer (and only that buyer)
 * look their order up later — persist it with the local order record.
 */
export interface PlacedOrderRef {
  reference: string;
  accessToken: string;
}

/**
 * A placed order as the BUYER sees it — their own order, read back either from
 * their signed-in history (RLS-scoped to customer_id) or via the secret-key
 * lookup. Deliberately carries no merchant-internal ids.
 */
export interface MyOrder {
  id: string;
  reference: string;
  channel: OrderChannel;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  subtotalKes: number;
  totalKes: number;
  /** The code applied at checkout, if any — null on every order placed before
   * discount codes existed, or with no code applied. */
  discountCode: string | null;
  discountKes: number;
  placedAt: string;
  /** Present when read from signed-in history (joined); empty on guest lookup. */
  shopName?: string;
  shopSlug?: string;
  items: OrderLine[];
}

/** A placed order with its line items, scoped to the receiving merchant. */
export interface MerchantOrder {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  channel: OrderChannel;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  subtotalKes: number;
  totalKes: number;
  discountCode: string | null;
  discountKes: number;
  placedAt: string;
  items: OrderLine[];
}

export type AccountType = "merchant" | "shopper";

/** The signed-in user's session identity. Shoppers have no shop — empty strings. */
export interface AuthUser {
  id: string;
  email: string;
  accountType: AccountType;
  shopName: string;
  shopSlug: string;
}

export interface PaymentResult {
  status: "paid" | "failed";
  reference: string;
}
