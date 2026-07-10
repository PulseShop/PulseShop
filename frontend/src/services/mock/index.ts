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
import type {
  Credentials,
  MerchantUpdate,
  ProductInput,
  Services,
  ShopperSignupInput,
  SignupInput,
} from "../types";
import { statusForQty } from "@/lib/constants";
import { discountedPrice } from "@/lib/currency";
import { fileToDataUrl } from "@/lib/image";
import { MERCHANT, PRODUCTS } from "./data";

const LATENCY = 300;
const STORAGE_KEY = "pulseshop-mock-products";
const MERCHANT_KEY = "pulseshop-mock-merchant";
const ORDERS_KEY = "pulseshop-mock-orders-received";
const FOLLOWS_KEY = "pulseshop-mock-follows";
const FAVORITES_KEY = "pulseshop-mock-server-favorites";
const RATINGS_KEY = "pulseshop-mock-my-ratings";

const delay = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

function loadMerchant(): Merchant {
  try {
    const raw = localStorage.getItem(MERCHANT_KEY);
    if (raw) return { ...structuredClone(MERCHANT), ...JSON.parse(raw) } as Merchant;
  } catch {
    /* fall through to seed */
  }
  return structuredClone(MERCHANT);
}

function saveMerchant(m: Merchant) {
  try {
    localStorage.setItem(MERCHANT_KEY, JSON.stringify(m));
  } catch {
    /* storage full/unavailable — keep in-memory copy */
  }
}

let merchant = loadMerchant();

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Product[];
  } catch {
    /* fall through to seed */
  }
  return structuredClone(PRODUCTS);
}

function saveProducts(products: Product[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch {
    /* storage full/unavailable — keep in-memory copy */
  }
}

let products = loadProducts();

const makeRef = () =>
  `PS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** A few received orders so the merchant dashboard isn't empty in mock mode. */
function seedOrders(): MerchantOrder[] {
  const line = (p: Product, qty: number, size: string | null) => {
    const unit = discountedPrice(p.priceKes, p.discountPct);
    return {
      productName: p.name,
      image: p.images[0] ?? "",
      size,
      qty,
      unitPriceKes: unit,
      lineTotalKes: unit * qty,
    };
  };
  const total = (items: MerchantOrder["items"]) =>
    items.reduce((s, i) => s + i.lineTotalKes, 0);

  const o1 = [line(PRODUCTS[7], 1, "M")];
  const o2 = [line(PRODUCTS[0], 2, "L"), line(PRODUCTS[4], 1, "28")];
  const o3 = [line(PRODUCTS[10], 1, null)];

  return [
    {
      id: "o-seed-1", reference: makeRef(), customerName: "Amina Njoroge",
      customerPhone: "254712345678", customerNotes: "Deliver after 5pm please",
      channel: "whatsapp", paymentMethod: "mpesa", paymentStatus: "paid",
      subtotalKes: total(o1), totalKes: total(o1), placedAt: minsAgo(35), items: o1,
    },
    {
      id: "o-seed-2", reference: makeRef(), customerName: "Brian Otieno",
      customerPhone: "254798765432", customerNotes: "",
      channel: "instagram", paymentMethod: null, paymentStatus: "pending",
      subtotalKes: total(o2), totalKes: total(o2), placedAt: minsAgo(180), items: o2,
    },
    {
      id: "o-seed-3", reference: makeRef(), customerName: "Cynthia Wanjiru",
      customerPhone: "254733222111", customerNotes: "Gift wrap if possible",
      channel: "facebook", paymentMethod: "paypal", paymentStatus: "paid",
      subtotalKes: total(o3), totalKes: total(o3), placedAt: minsAgo(1440), items: o3,
    },
  ];
}

function loadOrders(): MerchantOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) return JSON.parse(raw) as MerchantOrder[];
  } catch {
    /* fall through to seed */
  }
  return seedOrders();
}

function saveOrders(list: MerchantOrder[]) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable — keep in-memory copy */
  }
}

let ordersReceived = loadOrders();

function loadIds(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function loadMyRatings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(RATINGS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Merchant.stats for the demo shop. Products is live; orders and rating come
 * from the seed. Followers is the seed plus this device's own follow, so the
 * dashboard's follower count visibly reacts to following the shop.
 */
function merchantStats(): Merchant["stats"] {
  const following = loadIds(FOLLOWS_KEY).includes(merchant.id) ? 1 : 0;
  return {
    ...merchant.stats,
    products: products.length,
    followers: MERCHANT.stats.followers + following,
  };
}

export const mockServices: Services = {
  auth: {
    // Accepts any credentials and returns the demo shop's session.
    async login({ email }: Credentials): Promise<AuthUser> {
      await delay();
      return {
        id: "u1",
        email,
        accountType: "merchant",
        shopName: MERCHANT.name,
        shopSlug: MERCHANT.handle,
      };
    },

    async signup(input: SignupInput): Promise<AuthUser> {
      await delay();
      return {
        id: `u${Date.now()}`,
        email: input.email,
        accountType: "merchant",
        shopName: input.shopName,
        shopSlug: input.shopSlug,
      };
    },

    async signupShopper(input: ShopperSignupInput): Promise<AuthUser> {
      await delay();
      return {
        id: `u${Date.now()}`,
        email: input.email,
        accountType: "shopper",
        shopName: "",
        shopSlug: "",
      };
    },

    async logout(): Promise<void> {
      await delay();
    },

    async updateEmail(_email: string): Promise<void> {
      await delay();
    },

    async resetPassword(_email: string): Promise<void> {
      await delay();
    },
  },

  products: {
    async getMerchant(): Promise<Merchant> {
      await delay();
      return { ...structuredClone(merchant), stats: merchantStats() };
    },

    async updateMerchant(patch: MerchantUpdate): Promise<Merchant> {
      await delay();
      const { whatsapp, instagram, facebook, ...rest } = patch;
      merchant = {
        ...merchant,
        ...rest,
        contacts: {
          whatsapp: whatsapp ?? merchant.contacts.whatsapp,
          instagram: instagram ?? merchant.contacts.instagram,
          facebook: facebook ?? merchant.contacts.facebook,
        },
      };
      saveMerchant(merchant);
      return { ...structuredClone(merchant), stats: merchantStats() };
    },

    async listProducts(): Promise<Product[]> {
      await delay();
      return structuredClone(products).map((p) => ({ ...p, shopSlug: merchant.handle }));
    },

    async getProduct(id: string): Promise<Product | null> {
      await delay();
      const found = products.find((p) => p.id === id);
      return found ? { ...structuredClone(found), shopSlug: merchant.handle } : null;
    },

    async createProduct(input: ProductInput): Promise<Product> {
      await delay();
      const product: Product = {
        ...input,
        id: `p${Date.now()}`,
        status: statusForQty(input.stockQty),
        rating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
      };
      products = [product, ...products];
      saveProducts(products);
      return structuredClone(product);
    },

    async updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product> {
      await delay();
      const idx = products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Product ${id} not found`);
      const next = { ...products[idx], ...patch };
      next.status = statusForQty(next.stockQty);
      products[idx] = next;
      saveProducts(products);
      return structuredClone(next);
    },

    async deleteProduct(id: string): Promise<void> {
      await delay();
      products = products.filter((p) => p.id !== id);
      saveProducts(products);
    },

    async getShop(slug: string): Promise<Merchant | null> {
      await delay();
      if (merchant.handle !== slug) return null;
      return { ...structuredClone(merchant), stats: merchantStats() };
    },

    async listShopProducts(_merchantId: string): Promise<Product[]> {
      await delay();
      return structuredClone(products).map((p) => ({ ...p, shopSlug: merchant.handle }));
    },
  },

  orders: {
    async submitOrder(draft: OrderDraft): Promise<{ reference: string }> {
      await delay();
      const reference = makeRef();
      const p = products.find((x) => x.id === draft.productId);
      if (p) {
        const unit = discountedPrice(p.priceKes, p.discountPct);
        const total = unit * draft.qty;
        ordersReceived = [
          {
            id: `o${Date.now()}`,
            reference,
            customerName: draft.customer.name,
            customerPhone: draft.customer.phone,
            customerNotes: draft.customer.notes,
            channel: draft.channel,
            paymentMethod: draft.payment?.method ?? null,
            paymentStatus: draft.payment?.status === "paid" ? "paid" : "pending",
            subtotalKes: total,
            totalKes: total,
            placedAt: new Date().toISOString(),
            items: [
              {
                productName: p.name,
                image: p.images[0] ?? "",
                size: draft.size,
                qty: draft.qty,
                unitPriceKes: unit,
                lineTotalKes: total,
              },
            ],
          },
          ...ordersReceived,
        ];
        saveOrders(ordersReceived);
      }
      return { reference };
    },

    async submitCartOrder(draft: CartOrderDraft): Promise<{ reference: string }> {
      await delay();
      const reference = makeRef();
      const items = draft.items.flatMap((item) => {
        const p = products.find((x) => x.id === item.productId);
        if (!p) return [];
        const unit = discountedPrice(p.priceKes, p.discountPct);
        return [{
          productName: p.name,
          image: p.images[0] ?? "",
          size: item.size,
          qty: item.qty,
          unitPriceKes: unit,
          lineTotalKes: unit * item.qty,
        }];
      });
      const total = items.reduce((s, i) => s + i.lineTotalKes, 0);
      ordersReceived = [
        {
          id: `o${Date.now()}`,
          reference,
          customerName: draft.customer.name,
          customerPhone: draft.customer.phone,
          customerNotes: draft.customer.notes,
          channel: draft.channel,
          paymentMethod: draft.payment?.method ?? null,
          paymentStatus: draft.payment?.status === "paid" ? "paid" : "pending",
          subtotalKes: total,
          totalKes: total,
          placedAt: new Date().toISOString(),
          items,
        },
        ...ordersReceived,
      ];
      saveOrders(ordersReceived);
      return { reference };
    },

    async listOrders(): Promise<MerchantOrder[]> {
      await delay();
      return structuredClone(ordersReceived);
    },

    async updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void> {
      await delay();
      ordersReceived = ordersReceived.map((o) =>
        o.id === orderId ? { ...o, paymentStatus } : o,
      );
      saveOrders(ordersReceived);
    },
  },

  follows: {
    // Single demo shop in mock mode; follows persist per browser.
    async listShops(): Promise<Merchant[]> {
      await delay();
      return [{ ...structuredClone(merchant), stats: merchantStats() }];
    },

    async listFollowing(): Promise<string[]> {
      await delay();
      return loadIds(FOLLOWS_KEY);
    },

    async follow(merchantId: string): Promise<void> {
      await delay();
      const ids = new Set(loadIds(FOLLOWS_KEY));
      ids.add(merchantId);
      localStorage.setItem(FOLLOWS_KEY, JSON.stringify([...ids]));
    },

    async unfollow(merchantId: string): Promise<void> {
      await delay();
      const ids = new Set(loadIds(FOLLOWS_KEY));
      ids.delete(merchantId);
      localStorage.setItem(FOLLOWS_KEY, JSON.stringify([...ids]));
    },
  },

  reviews: {
    // Mirrors the `reviews` table + its aggregate trigger: one rating per
    // product per device, folded into the product's running average.
    async getMyRating(productId: string): Promise<number | null> {
      await delay();
      return loadMyRatings()[productId] ?? null;
    },

    async rateProduct(productId: string, stars: number): Promise<void> {
      await delay();
      const mine = loadMyRatings();
      const previous = mine[productId] ?? null;
      const idx = products.findIndex((p) => p.id === productId);

      if (idx !== -1) {
        const p = products[idx];
        // Re-rating replaces the old star value; a first rating adds a review.
        const count = previous == null ? p.reviewCount + 1 : p.reviewCount;
        const totalStars = p.rating * p.reviewCount - (previous ?? 0) + stars;
        products[idx] = {
          ...p,
          reviewCount: count,
          rating: count ? Math.round((totalStars / count) * 10) / 10 : 0,
        };
        saveProducts(products);
      }

      mine[productId] = stars;
      localStorage.setItem(RATINGS_KEY, JSON.stringify(mine));
    },
  },

  favorites: {
    // Stands in for the DB `favorites` table so the sync path (see
    // hooks/useFavorites.ts) has something real to talk to in mock mode too.
    async listFavorites(): Promise<string[]> {
      await delay();
      return loadIds(FAVORITES_KEY);
    },

    async addFavorite(productId: string): Promise<void> {
      await delay();
      const ids = new Set(loadIds(FAVORITES_KEY));
      ids.add(productId);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
    },

    async removeFavorite(productId: string): Promise<void> {
      await delay();
      const ids = new Set(loadIds(FAVORITES_KEY));
      ids.delete(productId);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
    },
  },

  storage: {
    async uploadImage(file: File, _folder: string): Promise<string> {
      // Mock keeps images inline as base64 data URLs.
      return fileToDataUrl(file);
    },

    async deleteImage(_url: string): Promise<void> {
      // No real storage to clean up in mock mode.
    },
  },

  payments: {
    // Simulates an M-Pesa STK push: pending ~3s, then resolves.
    async payWithMpesa(_phone: string, _amount: number): Promise<PaymentResult> {
      await delay(3000);
      return { status: "paid", reference: makeRef() };
    },

    async payWithPaypal(_amount: number): Promise<PaymentResult> {
      await delay(1200);
      return { status: "paid", reference: makeRef() };
    },
  },
};
