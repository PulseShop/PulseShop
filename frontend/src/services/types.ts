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

export interface SignupInput {
  shopName: string;
  shopSlug: string;
  email: string;
  password: string;
  city: string;
  socials: { whatsapp: string; instagram: string; facebook: string };
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
  /** Update the payment status of one of the merchant's orders. */
  updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void>;
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

export interface PaymentService {
  payWithMpesa(phone: string, amount: number): Promise<PaymentResult>;
  payWithPaypal(amount: number): Promise<PaymentResult>;
}

/** Image uploads. Mock keeps base64 inline; the API adapter uses Supabase Storage. */
export interface StorageService {
  /** Upload an image and return a URL usable in an <img src>. `folder` groups files. */
  uploadImage(file: File, folder: string): Promise<string>;
}

export interface Services {
  auth: AuthService;
  products: ProductService;
  orders: OrderService;
  follows: FollowService;
  payments: PaymentService;
  storage: StorageService;
}
