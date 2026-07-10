import type {
  AuthUser,
  CartOrderDraft,
  Merchant,
  MerchantOrder,
  OrderDraft,
  PaymentResult,
  PaymentStatus,
  Product,
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
 * Auth for both account types. The mock accepts anything and fabricates a
 * session; the real adapter (services/api/auth) wires these to Supabase Auth
 * with the same shape.
 */
export interface AuthService {
  login(creds: Credentials): Promise<AuthUser>;
  signup(input: SignupInput): Promise<AuthUser>;
  signupShopper(input: ShopperSignupInput): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Change the signed-in user's account email. */
  updateEmail(email: string): Promise<void>;
  /** Sends a password-reset email. */
  resetPassword(email: string): Promise<void>;
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
}

export interface ProductInput {
  name: string;
  sku: string;
  category: string;
  priceKes: number;
  discountPct: number | null;
  stockQty: number;
  images: string[];
  sizes: string[] | null;
  description: string;
}

export interface ProductService {
  getMerchant(): Promise<Merchant>;
  updateMerchant(patch: MerchantUpdate): Promise<Merchant>;
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  /** Public: look up a shop by its handle/slug. Null when no such shop. */
  getShop(slug: string): Promise<Merchant | null>;
  /** Public: products for a given shop. */
  listShopProducts(merchantId: string): Promise<Product[]>;
}

export interface OrderService {
  submitOrder(draft: OrderDraft): Promise<{ reference: string }>;
  /** Multi-item order from the cart checkout — one order, many line items. */
  submitCartOrder(draft: CartOrderDraft): Promise<{ reference: string }>;
  /** Orders received by the signed-in merchant, newest first. */
  listOrders(): Promise<MerchantOrder[]>;
  /** Count of the signed-in merchant's orders still `pending` — for badges/UI
   * that only need the number, not every order + its line items. */
  countPendingOrders(): Promise<number>;
  /** Update the payment status of one of the merchant's orders. */
  updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void>;
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

/** Instagram-style shop following for signed-in users. */
export interface FollowService {
  /** Public: every shop on the platform, for the discover list. */
  listShops(): Promise<Merchant[]>;
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
  follows: FollowService;
  reviews: ReviewService;
  favorites: FavoritesService;
  payments: PaymentService;
  storage: StorageService;
}
