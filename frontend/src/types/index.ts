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

export interface Merchant {
  id: string;
  name: string;
  handle: string;
  bio: string;
  location: string;
  avatarUrl: string;
  bannerUrl: string;
  isOnline: boolean;
  stats: { products: number; orders: number; rating: number };
  contacts: { whatsapp: string; instagram: string; facebook: string };
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
