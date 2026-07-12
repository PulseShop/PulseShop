export type StockStatus = "available" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  priceKes: number;
  discountPct: number | null;
  stockQty: number;
  status: StockStatus;
  images: string[];
  sizes: string[] | null;
  rating: number;
  reviewCount: number;
  description: string;
  createdAt: string;
  /** Handle of the shop that owns this product (for public consumer routing). */
  shopSlug?: string;
}

/** A product thumbnail carried inline on a shop-directory row. */
export interface ShopPreview {
  id: string;
  name: string;
  image: string;
}

export interface Merchant {
  id: string;
  name: string;
  handle: string;
  bio: string;
  location: string;
  avatarUrl: string;
  bannerUrl: string;
  isOnline: boolean;
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

export interface OrderDraft {
  productId: string;
  size: string | null;
  qty: number;
  customer: { name: string; phone: string; notes: string };
  channel: OrderChannel;
  payment: null | { method: PaymentMethod; status: PaymentStatus };
}

/** A multi-item order from the cart checkout. All items belong to one shop. */
export interface CartOrderDraft {
  shopSlug: string;
  items: { productId: string; size: string | null; qty: number }[];
  customer: { name: string; phone: string; notes: string };
  channel: OrderChannel;
  payment: null | { method: PaymentMethod; status: PaymentStatus };
}

export interface Favorite {
  productId: string;
  addedAt: string;
}

/** One line of a placed order, as the merchant sees it in their dashboard. */
export interface OrderLine {
  productName: string;
  image: string;
  size: string | null;
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
