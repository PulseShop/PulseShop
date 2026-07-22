import type {
  Analytics,
  AuthUser,
  CartItem,
  CartOrderDraft,
  Merchant,
  MerchantOrder,
  MyOrder,
  OrderDraft,
  Paged,
  PaymentResult,
  PaymentStatus,
  PlacedOrderRef,
  Product,
  ShopFacets,
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
  isOnline?: boolean;
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
  sizes: string[] | null;
  colors: string[] | null;
  sizePriceAdj: Record<string, number>;
  colorPriceAdj: Record<string, number>;
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
  maxPrice?: number | null;
  /**
   * Match products available in ANY of these sizes/colours (array overlap, not
   * containment) — a shopper asking for "M or L" wants both, not products that
   * stock both. Empty or omitted = no constraint.
   */
  sizes?: string[];
  colors?: string[];
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
  /** The category list, price ceiling and stock counts a filter UI needs —
   * aggregates over the whole catalogue, which a single page can't give you.
   * Omit `merchantId` for the signed-in merchant's own catalogue. */
  getFacets(merchantId?: string): Promise<ShopFacets>;
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
  /** Create or replace the signed-in user's rating. `stars` is 1–5. */
  rateProduct(productId: string, stars: number): Promise<void>;
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

/** Image uploads. Mock keeps base64 inline; the API adapter uses Supabase Storage. */
export interface StorageService {
  /** Upload an image and return a URL usable in an <img src>. `folder` groups files. */
  uploadImage(file: File, folder: string): Promise<string>;
  /** Best-effort delete of a previously-uploaded image (e.g. replacing an avatar/banner). */
  deleteImage(url: string): Promise<void>;
}

export interface Services {
  auth: AuthService;
  products: ProductService;
  orders: OrderService;
  analytics: AnalyticsService;
  follows: FollowService;
  reviews: ReviewService;
  favorites: FavoritesService;
  cart: CartService;
  payments: PaymentService;
  storage: StorageService;
}
