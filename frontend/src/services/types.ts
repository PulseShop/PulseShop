import type { ProductCsvInput } from "@/lib/productCsv";
import type {
  AdminInvoice,
  AdminPayment,
  AdminPlacement,
  AdminProductHit,
  AdminShop,
  AdminTopProduct,
  BillingSummary,
  InvoiceInput,
  PaymentInput,
  RepeatCustomerRate,
  RevenuePoint,
  SocialLinks,
  Analytics,
  AuthUser,
  BannerProduct,
  CartItem,
  CartOrderDraft,
  CategoryShowcase,
  DiscountCode,
  DiscountPreview,
  FollowerSeries,
  Fulfillment,
  GroupBuy,
  MerchantGroupBuy,
  Merchant,
  PlacementInput,
  Plan,
  MerchantOrder,
  MerchantReviewsSummary,
  MyOrder,
  OrderDraft,
  Paged,
  PaymentResult,
  PaymentStatus,
  PcSpecs,
  PhoneSpecs,
  PlacedOrderRef,
  PlatformStats,
  GrowthPoint,
  Product,
  ProductReview,
  ProductType,
  ShareChannel,
  ShareLink,
  ShareTarget,
  ShopFacets,
  ShopStatus,
} from "@/types";

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Thrown by signup() / signupShopper() when Supabase requires the user to
 * confirm their email before a session exists (signUp() returns a user but a
 * null session). Callers must not treat this as a live login.
 */
export class EmailConfirmationRequiredError extends Error {
  constructor(public readonly email: string) {
    super("Email confirmation required before signing in");
    this.name = "EmailConfirmationRequiredError";
  }
}

/** The shop-profile fields, shared by full email/password signup and the
 * post-Google "set up your shop" onboarding step (which has no email/password
 * of its own — the account already exists). */
export interface ShopDetailsInput {
  shopName: string;
  shopSlug: string;
  city: string;
  socials: { whatsapp: string; instagram: string; facebook: string };
}

export interface SignupInput extends ShopDetailsInput {
  email: string;
  password: string;
}

/** Shopper signup — no shop, just an identity for following/favorites. */
export interface ShopperSignupInput {
  name: string;
  email: string;
  password: string;
}

/**
 * The buyer's personal profile — the details checkout asks for every time,
 * kept on the account so they only get typed once. Lives in auth user
 * metadata, NOT the merchants table: shoppers have no row there, and this is
 * private to the account (metadata is only readable with the user's own JWT),
 * unlike a merchant profile which is deliberately public.
 */
export interface ShopperProfile {
  name: string;
  phone: string;
  /** Free-text delivery address — landmark directions are the norm here, so
   * no structured fields. */
  address: string;
}

/**
 * Auth for both account types. The mock accepts anything and fabricates a
 * session; the real adapter (services/api/auth) wires these to Supabase Auth.
 *
 * `captchaToken` is a Turnstile token, and it is optional because the CAPTCHA is
 * only active when VITE_TURNSTILE_SITE_KEY is set (see lib/captcha.ts). Supabase
 * verifies it server-side — passing a token the client made up gets rejected
 * there, which is the entire point.
 */
export interface AuthService {
  login(creds: Credentials, captchaToken?: string): Promise<AuthUser>;
  signup(input: SignupInput, captchaToken?: string): Promise<AuthUser>;
  signupShopper(input: ShopperSignupInput, captchaToken?: string): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Change the signed-in user's account email. */
  updateEmail(email: string): Promise<void>;
  /** Sends a password-reset email. Captcha-gated too — an un-gated reset
   * endpoint is a free way to burn a project's email quota. */
  resetPassword(email: string, captchaToken?: string): Promise<void>;
  /**
   * Sets a new password for the current session. The recovery link from
   * resetPassword() establishes that session, so this is what actually completes
   * the forgot-password flow — without it the emailed link leads nowhere.
   */
  updatePassword(password: string): Promise<void>;
  /** The signed-in user's personal profile (name/phone/address). */
  getProfile(): Promise<ShopperProfile>;
  /** Replace the signed-in user's personal profile. */
  updateProfile(profile: ShopperProfile): Promise<void>;
}

/** Editable merchant/shop profile fields. All optional — patch semantics. */
export interface MerchantUpdate {
  name?: string;
  handle?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  shopStatus?: ShopStatus;
  /** How customers receive orders: "pickup" | "delivery" | "both". */
  fulfillment?: Fulfillment;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  /** Search & sharing. One short phrase for what the shop sells; goes in the
   * <title> after the shop name. Capped at 60 chars by the DB. */
  tagline?: string;
  /** The snippet under the title in a search result. Capped at 160. Blank means
   * "generate one from the shop's own data" — see lib/seo.ts shopSeo(). */
  metaDescription?: string;
}

export interface ProductInput {
  name: string;
  /**
   * URL segment. Omit on create and the database derives it from the name.
   * Sending it on update CHANGES the product's public URL and breaks every
   * existing link to it, so only the SEO panel ever sets this, and only after
   * the seller confirms.
   */
  slug?: string;
  metaDescription?: string | null;
  sku: string;
  category: string;
  priceKes: number;
  discountPct: number | null;
  stockQty: number;
  images: string[];
  /** See Product.imageAlts. Sent positionally alongside `images`; omit to leave
   * unchanged on update. */
  imageAlts?: string[];
  sizes: string[] | null;
  colors: string[] | null;
  sizePriceAdj: Record<string, number>;
  colorPriceAdj: Record<string, number>;
  /** See Product.colorImages. Omit to leave unchanged on update. */
  colorImages?: Record<string, string>;
  /** Omit all three to leave a product 'general' (the default). Set AT MOST
   * ONE of phoneSpecs/pcSpecs, matching productType — both write the same
   * `specs` column, so sending both means the second one silently wins. */
  productType?: ProductType;
  phoneSpecs?: PhoneSpecs;
  pcSpecs?: PcSpecs;
  summary: string | null;
  description: string;
}

/**
 * Server-side filter + sort + page for a product list. Every field is passed as
 * a bound RPC parameter (see migration 0022) — none of it is interpolated into
 * a PostgREST filter string, so a search term containing the filter language's
 * own syntax (`,` `(` `)` `"`) is just a search term.
 *
 * Filtering has to happen server-side for pagination to mean anything: filter
 * on the client and you are only ever filtering the page you happen to hold.
 */
export interface ProductQuery {
  /** 1-based. */
  page?: number;
  pageSize?: number;
  search?: string;
  /** "All" (or omitted) = every category. */
  category?: string;
  /** "in-stock" = anything not out of stock. */
  status?: "all" | "in-stock" | "available" | "low" | "out";
  /**
   * The price range, in whole shillings, compared against the LOWEST variant
   * price after discount. Either end may be null for "no bound", so `minPrice`
   * alone is "anything from X up" and the pair is a band.
   *
   * A range rather than a ceiling alone (migration 0048): "under 5,000" buries
   * someone shopping the 3,000–5,000 shelf under every cheap accessory on the
   * platform, which is the same as having no filter.
   */
  minPrice?: number | null;
  maxPrice?: number | null;
  /**
   * Match products available in ANY of these sizes/colours (array overlap, not
   * containment) — a shopper asking for "M or L" wants both, not products that
   * stock both. Empty or omitted = no constraint.
   */
  sizes?: string[];
  colors?: string[];
  /** Only products whose average rating is at least this (1–5). Omitted/null =
   * no rating constraint. Products with no reviews (rating 0) never match a set
   * value. */
  minRating?: number | null;
  /** Structured Phone/PC spec filters (migration 0038). All optional.
   * `productType` narrows to just phones or PCs; `ramMin`/`storageMin` match
   * the generated ram_gb/storage_gb columns (`>=`); `conditions` matches any of
   * the given phone conditions. */
  productType?: "phone" | "pc";
  ramMin?: number | null;
  storageMin?: number | null;
  conditions?: string[];
  sort?: "newest" | "price-asc" | "price-desc";
}

/** 1-based page request for the simple lists (shops, orders). */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** A page of the shop directory, optionally narrowed by the universal search on
 * /shops. Same reasoning as ProductQuery: the term is a bound RPC parameter, and
 * the search must run server-side or it would only ever see the loaded page. */
export interface ShopQuery extends PageQuery {
  /** Matches a shop's name, handle, bio or location. Empty = the whole directory. */
  search?: string;
}

/** Outcome of a bulk CSV import, split by what each row turned out to be:
 * a row whose SKU the shop already had is an update, a new SKU is a create. */
export interface ProductImportResult {
  created: number;
  updated: number;
}

/** Confirmation that an over-limit export was queued as an email, and where to. */
export interface ProductExportEmailResult {
  /** The shop owner's account email, so the UI can say where it went. */
  email: string;
  /** Products written into the emailed file. */
  count: number;
}

export interface ProductService {
  getMerchant(): Promise<Merchant>;
  updateMerchant(patch: MerchantUpdate): Promise<Merchant>;
  /** The signed-in merchant's own catalogue. */
  listProducts(query?: ProductQuery): Promise<Paged<Product>>;
  getProduct(id: string): Promise<Product | null>;
  /**
   * Public: a product by its canonical URL pair. This is how every product page
   * loads now; getProduct(id) survives only to resolve legacy /product/:id
   * links into a redirect.
   */
  getProductBySlug(shopSlug: string, productSlug: string): Promise<Product | null>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  /** Public: look up a shop by its handle/slug. Null when no such shop. */
  getShop(slug: string): Promise<Merchant | null>;
  /** Public: products for a given shop. */
  listShopProducts(merchantId: string, query?: ProductQuery): Promise<Paged<Product>>;
  /** Public: products across EVERY shop — the product half of the universal
   * search on /shops. Same filters and paging as the shop-scoped list. */
  searchProducts(query?: ProductQuery): Promise<Paged<Product>>;
  /**
   * Public: one product from each registered shop, for the marketplace banner
   * (migration 0046). Every shop gets a slot regardless of plan; the selection
   * rotates hourly so a quiet shop is not permanently crowded out once there
   * are more shops than slots. Each item carries `shopSlug` and `shopName`.
   */
  listShopFeatures(limit?: number): Promise<Product[]>;
  /**
   * Public: the products a seller has PAID to put on the marketplace banner
   * (migration 0048). Returned newest first and already filtered to the live
   * window by RLS. Each item carries the placement's optional `headline`, which
   * is the banner copy the seller bought; null falls back to the product name.
   *
   * Separate from listShopFeatures() rather than merged into it because the two
   * are different products: one is bought, the other is the free rotation every
   * registered shop gets. The page shows paid slots first and fills the rest
   * from the rotation, which is only expressible if they arrive apart.
   */
  listBannerPlacements(limit?: number): Promise<BannerProduct[]>;
  /** The category list, price range and stock counts a filter UI needs —
   * aggregates over the whole catalogue, which a single page can't give you.
   * Omit `merchantId` for the WHOLE marketplace (every shop); pass one for a
   * single shop's catalogue. */
  getFacets(merchantId?: string | null): Promise<ShopFacets>;
  /**
   * Public: a cover image and a product count for every category that has
   * something to sell (migration 0057) — what the front page's category wall
   * draws its tiles from.
   *
   * Distinct from getFacets(), which returns category NAMES for a filter
   * control. This returns categories as merchandise: a picture, and an honest
   * count taken over the whole table rather than over whichever page of
   * products the client happened to fetch.
   */
  listCategoryShowcase(limit?: number): Promise<CategoryShowcase[]>;
  /**
   * Public: every product currently marked down, across every shop (migration
   * 0058) — the front page's "Deals of the day" shelf.
   *
   * Its own read rather than a flag on searchProducts() for two reasons the
   * migration header spells out: a filtered page is a sample, not "every
   * discounted product", and a defaulted extra parameter on search_products
   * would create an RPC overload. Ordered by the size of the discount, so the
   * shelf leads with the biggest saving rather than the newest listing.
   */
  listDeals(limit?: number): Promise<Product[]>;
  /**
   * Bulk create-or-update from an uploaded CSV, keyed on SKU: a row whose SKU
   * this shop already has updates that product, a new one creates it.
   *
   * Only the columns the CSV carries are written. Everything else a product
   * holds (its slug, per-variant pricing, colour photos, SEO text) is left
   * alone, so importing an edited export cannot quietly reset fields the
   * spreadsheet never represented.
   */
  importProducts(rows: ProductCsvInput[]): Promise<ProductImportResult>;
  /**
   * Builds the seller's FULL catalogue as CSV server-side and emails it to
   * them, for the case where the catalogue is too big to hand to the browser
   * (see EXPORT_DOWNLOAD_LIMIT). Small catalogues never come through here: the
   * page already holds those rows and writes the file locally.
   */
  emailProductExport(): Promise<ProductExportEmailResult>;
}

export interface OrderService {
  /** Places the order and returns its reference + secret access key. */
  submitOrder(draft: OrderDraft): Promise<PlacedOrderRef>;
  /** Multi-item order from the cart checkout — one order, many line items. */
  submitCartOrder(draft: CartOrderDraft): Promise<PlacedOrderRef>;
  /** Orders received by the signed-in merchant, newest first. */
  listOrders(query?: PageQuery): Promise<Paged<MerchantOrder>>;
  /** Count of the signed-in merchant's orders still `pending` — for badges/UI
   * that only need the number, not every order + its line items. */
  countPendingOrders(): Promise<number>;
  /** Update the payment status of one of the merchant's orders. */
  updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void>;
  /** The signed-in shopper's OWN placed orders (RLS-scoped to customer_id),
   * newest first. Empty for guests / when signed out. */
  listMyOrders(): Promise<MyOrder[]>;
  /** Look up a single order by its reference + secret access key — the path a
   * guest (or anyone without the placing account) uses to track their order.
   * Returns null when the reference/key don't match. */
  lookupOrder(reference: string, accessToken: string): Promise<MyOrder | null>;
}

/**
 * Star ratings. One rating per user per product; re-rating replaces the old
 * value. The product's average `rating` / `reviewCount` are recomputed
 * server-side, so callers refetch the product rather than doing the maths.
 */
export interface ReviewService {
  /** The signed-in user's rating for a product, or null if they haven't rated it. */
  getMyRating(productId: string): Promise<number | null>;
  /**
   * Whether the signed-in user is allowed to review this product — true once
   * they've placed an order containing it. RLS enforces the same rule on write
   * (migration 0029 has_purchased); this just lets the UI show or hide the form.
   */
  canReview(productId: string): Promise<boolean>;
  /**
   * Create or replace the signed-in user's rating, optionally with a written
   * review. `stars` is 1–5. Pass `comment` to set/replace the text; omit it to
   * leave any existing review untouched (a star-only re-rating).
   */
  rateProduct(productId: string, stars: number, comment?: string | null): Promise<void>;
  /** Public: the written reviews shown on a product page, newest first. */
  listReviews(productId: string): Promise<ProductReview[]>;
  /**
   * Merchant-facing: every rating left on any of the caller's own products
   * (star-only ratings included, not just written reviews), plus a rating
   * distribution computed over the whole set. Pass `productId` to scope to
   * one product; omit for the whole shop.
   */
  getMerchantReviews(opts?: {
    productId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MerchantReviewsSummary>;
  /**
   * Merchant-facing: post, edit or retract the seller's public answer to one
   * review. Blank/whitespace clears it. Only the merchant who owns the reviewed
   * product may call it — reply_to_review() (migration 0040) enforces that
   * server-side and rejects anything else with the same error either way.
   *
   * Returns what was actually stored, so the caller renders the server's answer
   * rather than assuming its own optimistic one won.
   */
  replyToReview(
    reviewId: string,
    reply: string,
  ): Promise<{ merchantReply: string | null; merchantRepliedAt: string | null }>;
}

/**
 * The merchant's own sales dashboard. Every number here is computed by one
 * server-side aggregate (merchant_analytics); the page used to download every
 * order the merchant had ever received, plus the whole catalogue, and reduce it
 * in the browser.
 */
export interface AnalyticsService {
  /** `tz` is an IANA zone — revenue is bucketed by *local* calendar day, so a
   * Nairobi sale at 01:00 lands on the day the merchant thinks it did. */
  getAnalytics(tz: string, days?: number): Promise<Analytics>;
}

/** Instagram-style shop following for signed-in users. */
export interface FollowService {
  /** Public: one page of the shop discover list, each row carrying its stats
   * and product previews already aggregated. Optionally narrowed by a search term. */
  listShops(query?: ShopQuery): Promise<Paged<Merchant>>;
  /** Merchant ids the signed-in user follows. */
  listFollowing(): Promise<string[]>;
  follow(merchantId: string): Promise<void>;
  unfollow(merchantId: string): Promise<void>;
  /** Merchant-facing: the signed-in seller's own follower growth over the last
   * `days` days, as a running total (not per-day snapshots) so unfollows show
   * up as a dip rather than silently vanishing from history. `tz` buckets by
   * the merchant's own calendar day, same convention as AnalyticsService. */
  getFollowerSeries(tz: string, days?: number): Promise<FollowerSeries>;
}

/**
 * Server sync for signed-in users' favorites, mirroring FollowService. The
 * local `stores/favorites.ts` store stays the fast, always-available cache
 * (guests get device-local favorites only); this lets a signed-in shopper's
 * favorites follow them to a new device instead of living only in
 * localStorage.
 */
export interface FavoritesService {
  listFavorites(): Promise<string[]>;
  addFavorite(productId: string): Promise<void>;
  removeFavorite(productId: string): Promise<void>;
}

/**
 * Server sync for a signed-in shopper's cart (migration 0025's `cart_items`
 * table, RLS owner-only), mirroring FavoritesService. The local
 * `stores/cart.ts` store stays the fast, always-available cache and the ONLY
 * cart a guest gets; this is what makes a signed-in shopper's cart follow the
 * ACCOUNT rather than the device — and what gets cleared on sign-out so it
 * can't leak to the next person on a shared device. See hooks/useCart.ts for
 * how the two are kept in sync.
 */
export interface CartService {
  /** The signed-in shopper's cart, hydrated with live product/shop data
   * (price, stock, name, image) — the stored row only has the variant + qty. */
  listCart(): Promise<CartItem[]>;
  /** Insert-or-update one line by (product_id, size, color) to the given qty. */
  upsertCartItem(item: CartItem): Promise<void>;
  removeCartItem(productId: string, size: string | null, color: string | null): Promise<void>;
  clearCart(): Promise<void>;
}

export interface PaymentService {
  payWithMpesa(phone: string, amount: number): Promise<PaymentResult>;
  payWithPaypal(amount: number): Promise<PaymentResult>;
}

/** Editable discount-code fields. `productIds` is only read/written when
 * appliesTo === "selected"; ignored (and best left empty) for "all". */
export interface DiscountCodeInput {
  code: string;
  percentOff: number;
  startsAt?: string;
  expiresAt: string;
  maxRedemptions?: number | null;
  appliesTo: "all" | "selected";
  productIds?: string[];
  active?: boolean;
}

/**
 * Seller-created discount codes (migration 0035). Sellers manage their own
 * codes directly — discount_codes/discount_code_products RLS already scopes
 * everything to the owning merchant, so create/update/delete need no RPC.
 * previewCode is the one call a BUYER makes, and it's public: a guest has to
 * be able to check a code before creating any account.
 */
export interface DiscountService {
  /** The signed-in merchant's own codes, newest first. */
  listCodes(): Promise<DiscountCode[]>;
  createCode(input: DiscountCodeInput): Promise<DiscountCode>;
  updateCode(id: string, patch: Partial<DiscountCodeInput>): Promise<DiscountCode>;
  deleteCode(id: string): Promise<void>;
  /** Advisory only — place_order re-validates and re-computes authoritatively
   * at submit time, so a code that stops qualifying between preview and
   * submit is caught there, not here. */
  previewCode(
    merchantId: string,
    code: string,
    items: { productId: string; qty: number }[],
    customerPhone?: string,
  ): Promise<DiscountPreview>;
}

/** What the seller sets when starting a group buy. The code, the deadline and
 * the settlement are all the server's business. */
export interface GroupBuyInput {
  productId: string;
  /** How many buyers have to join. 2 to 50. */
  targetCount: number;
  percentOff: number;
  /** How long it runs. 6 hours to 14 days. */
  hours: number;
}

/**
 * Group buys — "bei ya kikundi" (migration 0054).
 *
 * A group buy settles into a DISCOUNT CODE rather than a second pricing path,
 * so everything that already governs codes (stacking, caps, one per buyer)
 * governs this for free. `join` returns the group in its post-join state,
 * including that code when the join is what filled it.
 *
 * `getByCode` and `join` both take the reader's phone, because membership is
 * keyed on the phone number rather than on an account: most people arrive
 * here from a WhatsApp group with no PulseShop login at all.
 */
export interface GroupBuyService {
  /** Public: one group buy by its code, or null. Pass the reader's phone to
   * have their membership (and the earned code) resolved. */
  getByCode(code: string, phone?: string | null): Promise<GroupBuy | null>;
  /** Public: the group buy running on a product right now, or null. */
  activeForProduct(productId: string): Promise<GroupBuy | null>;
  /** Public: commit to buying. Idempotent for a phone already in the group. */
  join(code: string, name: string, phone: string, qty?: number): Promise<GroupBuy>;
  /** The signed-in seller's own group buys, newest first. */
  listMine(): Promise<MerchantGroupBuy[]>;
  /** Returns the new group's code. */
  create(input: GroupBuyInput): Promise<string>;
  /** Only affects one that is still open — a filled group has already handed
   * its members a code, and withdrawing that is not this call's job. */
  cancel(id: string): Promise<void>;
}

/**
 * Short share links (migration 0052) — the attribution layer under every
 * social feature.
 *
 * `ensureLink` is get-or-create rather than create: the seller's question is
 * "what is my WhatsApp Status worth", not "what did this one tap earn", so
 * re-sharing the same product to the same channel returns the same code. Pass
 * a `label` to split one channel into separate campaigns.
 *
 * `resolve` is the only method a stranger calls, and the only one that works
 * signed out — it is what `/s/CODE` runs. It counts the click as a side
 * effect, so callers must not call it speculatively.
 */
export interface ShareLinkService {
  /**
   * The code for this (product, channel, label), minting one on first use.
   * Only the product's own merchant may call it; anyone else sharing gets the
   * plain product URL client-side instead. Pass a null productId for a link
   * to the whole shop.
   */
  ensureLink(productId: string | null, channel: ShareChannel, label?: string): Promise<string>;
  /** Where a code points, or null when it doesn't resolve. Counts a click. */
  resolve(code: string): Promise<ShareTarget | null>;
  /** The signed-in seller's own links with clicks, orders and paid revenue. */
  listLinks(): Promise<ShareLink[]>;
  deleteLink(id: string): Promise<void>;
}

/** Image uploads. Mock keeps base64 inline; the API adapter uses Supabase Storage. */
export interface StorageService {
  /** Upload an image and return a URL usable in an <img src>. `folder` groups files. */
  uploadImage(file: File, folder: string): Promise<string>;
  /** Best-effort delete of a previously-uploaded image (e.g. replacing an avatar/banner). */
  deleteImage(url: string): Promise<void>;
}

/**
 * The owner dashboard at /admindev (migration 0047).
 *
 * Every method here is refused by the database for anyone who is not on the
 * platform_admins list, so this interface is a convenience over that boundary
 * rather than the boundary itself. `isAdmin` exists so the page can render
 * "not authorised" instead of an error state; it is NOT what protects the data.
 */
export interface AdminService {
  isAdmin(): Promise<boolean>;
  stats(): Promise<PlatformStats>;
  /** Daily signups plus running totals, for the last `days` days (7 to 365). */
  growth(days?: number): Promise<GrowthPoint[]>;

  /**
   * The shop register, narrowed by plan and/or a search over name, handle,
   * location and account email. `plan: "all"` (or omitted) is every tier.
   */
  listShops(query?: {
    plan?: Plan | "all";
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paged<AdminShop>>;
  /**
   * Move a shop to a tier. This is the by-hand step 0041 described: sellers
   * have no UPDATE privilege on merchants.plan, so until billing exists the
   * owner grants it. A pending upgrade request for the same plan is marked
   * approved by the same call.
   */
  setShopPlan(merchantId: string, plan: Plan): Promise<void>;

  /** Every banner placement, running or not, with what was paid. */
  listPlacements(): Promise<AdminPlacement[]>;
  /** Create (no `id`) or edit (with `id`) a placement. Returns its id. */
  savePlacement(input: PlacementInput): Promise<string>;
  deletePlacement(id: string): Promise<void>;
  /**
   * Rewrite the rotation order, given every placement id in the order the
   * marketplace hero should cycle them.
   *
   * The whole list rather than a "move this one up" delta: the caller already
   * holds it, and rewriting it wholesale cannot leave two placements sharing a
   * position the way two concurrent swaps can.
   */
  reorderPlacements(ids: string[]): Promise<void>;
  /** Product lookup for the placement picker — every shop, including closing
   * ones, which the shopper-facing search deliberately hides. An empty search
   * browses the whole catalogue rather than returning nothing, which is what
   * makes "put any product on the banner" a browse and not a guess. */
  searchProducts(search: string, limit?: number): Promise<AdminProductHit[]>;

  /* --- Subscription billing (migration 0051) ---------------------------- */

  /** Invoices, newest period first. `status` accepts the derived states too:
   *  'unpaid', 'paid' and 'overdue' are computed, not stored. */
  listInvoices(query?: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paged<AdminInvoice>>;
  saveInvoice(input: InvoiceInput): Promise<string>;
  deleteInvoice(id: string): Promise<void>;
  /** The transactions feed: every payment received, newest first. */
  listPayments(query?: { page?: number; pageSize?: number }): Promise<Paged<AdminPayment>>;
  recordPayment(input: PaymentInput): Promise<string>;
  deletePayment(id: string): Promise<void>;
  billingSummary(): Promise<BillingSummary>;

  /* --- Dashboard reads --------------------------------------------------- */

  topProducts(days?: number, limit?: number): Promise<AdminTopProduct[]>;
  revenueSeries(days?: number): Promise<RevenuePoint[]>;
  repeatCustomerRate(days?: number): Promise<RepeatCustomerRate>;

  /* --- Platform settings ------------------------------------------------- */

  getSocialLinks(): Promise<SocialLinks>;
  setSocialLinks(links: SocialLinks): Promise<void>;
}

export interface Services {
  auth: AuthService;
  admin: AdminService;
  products: ProductService;
  orders: OrderService;
  analytics: AnalyticsService;
  follows: FollowService;
  reviews: ReviewService;
  favorites: FavoritesService;
  cart: CartService;
  payments: PaymentService;
  storage: StorageService;
  discounts: DiscountService;
  shareLinks: ShareLinkService;
  groupBuys: GroupBuyService;
}
