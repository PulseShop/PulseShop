import type {
  Analytics,
  AuthUser,
  CartOrderDraft,
  Merchant,
  MerchantOrder,
  MyOrder,
  OrderChannel,
  OrderDraft,
  OrderLine,
  Paged,
  PaymentResult,
  PaymentStatus,
  PlacedOrderRef,
  Product,
  ShopFacets,
} from "@/types";
import type {
  Credentials,
  MerchantUpdate,
  PageQuery,
  ProductInput,
  ProductQuery,
  Services,
  ShopperSignupInput,
  SignupInput,
} from "../types";
import { statusForQty } from "@/lib/constants";
import { discountedPrice } from "@/lib/currency";
import { fileToDataUrl } from "@/lib/image";
import { productImageSrc } from "@/lib/productImage";
import { MERCHANT, PRODUCTS } from "./data";

const LATENCY = 300;
const STORAGE_KEY = "pulseshop-mock-products";
const MERCHANT_KEY = "pulseshop-mock-merchant";
const ORDERS_KEY = "pulseshop-mock-orders-received";
const MY_ORDERS_KEY = "pulseshop-mock-my-orders";
const FOLLOWS_KEY = "pulseshop-mock-follows";
const FAVORITES_KEY = "pulseshop-mock-server-favorites";
const RATINGS_KEY = "pulseshop-mock-my-ratings";

const delay = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_PRODUCT_PAGE = 12;
const DEFAULT_LIST_PAGE = 20;

/** Slice a full list the way the server's LIMIT/OFFSET would. */
function paginate<T>(list: T[], page = 1, pageSize = DEFAULT_LIST_PAGE): Paged<T> {
  const start = (Math.max(1, page) - 1) * pageSize;
  return { items: structuredClone(list.slice(start, start + pageSize)), total: list.length };
}

/**
 * The mock's stand-in for search_products() (migration 0022). Deliberately
 * mirrors the server's filter/sort semantics — if the two drift, a bug will
 * only show up against the real backend, which is the worst place to find it.
 */
function queryProducts(all: Product[], q: ProductQuery = {}): Paged<Product> {
  let list = all;

  const term = q.search?.trim().toLowerCase();
  if (term) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term),
    );
  }
  if (q.category && q.category !== "All") list = list.filter((p) => p.category === q.category);
  if (q.status && q.status !== "all") {
    list =
      q.status === "in-stock"
        ? list.filter((p) => p.status !== "out")
        : list.filter((p) => p.status === q.status);
  }
  if (q.maxPrice != null) list = list.filter((p) => p.priceKes <= q.maxPrice!);

  list = [...list];
  if (q.sort === "price-asc") list.sort((a, b) => a.priceKes - b.priceKes);
  else if (q.sort === "price-desc") list.sort((a, b) => b.priceKes - a.priceKes);
  else list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return paginate(list, q.page, q.pageSize ?? DEFAULT_PRODUCT_PAGE);
}

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

/** Mirrors the DB's 256-bit hex access key (two UUIDs, dashes stripped). */
const makeToken = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "") +
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "");

/** The buyer's own placed orders + their secret keys (guest-lookup path). */
interface MyOrderRecord {
  order: MyOrder;
  accessToken: string;
}

function loadMyOrders(): MyOrderRecord[] {
  try {
    return JSON.parse(localStorage.getItem(MY_ORDERS_KEY) ?? "[]") as MyOrderRecord[];
  } catch {
    return [];
  }
}

function saveMyOrders(list: MyOrderRecord[]) {
  try {
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable — keep in-memory copy */
  }
}

function recordMyOrder(
  reference: string,
  items: OrderLine[],
  draft: { channel: OrderDraft["channel"]; payment: OrderDraft["payment"] },
): string {
  const accessToken = makeToken();
  const total = items.reduce((s, i) => s + i.lineTotalKes, 0);
  const order: MyOrder = {
    id: `o${Date.now()}`,
    reference,
    channel: draft.channel,
    paymentMethod: draft.payment?.method ?? null,
    paymentStatus: draft.payment?.status === "paid" ? "paid" : "pending",
    subtotalKes: total,
    totalKes: total,
    placedAt: new Date().toISOString(),
    shopName: merchant.name,
    shopSlug: merchant.handle,
    items,
  };
  const recs = loadMyOrders();
  recs.unshift({ order, accessToken });
  saveMyOrders(recs);
  return accessToken;
}

const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** A few received orders so the merchant dashboard isn't empty in mock mode. */
function seedOrders(): MerchantOrder[] {
  const line = (p: Product, qty: number, size: string | null) => {
    const unit = discountedPrice(p.priceKes, p.discountPct);
    return {
      productName: p.name,
      image: productImageSrc(p.images),
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

    async listProducts(query?: ProductQuery): Promise<Paged<Product>> {
      await delay();
      const page = queryProducts(products, query);
      return { ...page, items: page.items.map((p) => ({ ...p, shopSlug: merchant.handle })) };
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

    async listShopProducts(_merchantId: string, query?: ProductQuery): Promise<Paged<Product>> {
      await delay();
      const page = queryProducts(products, query);
      return { ...page, items: page.items.map((p) => ({ ...p, shopSlug: merchant.handle })) };
    },

    async getFacets(_merchantId?: string): Promise<ShopFacets> {
      await delay();
      return {
        categories: [...new Set(products.map((p) => p.category))].sort(),
        priceCeiling: Math.max(0, ...products.map((p) => p.priceKes)),
        total: products.length,
        available: products.filter((p) => p.status === "available").length,
        low: products.filter((p) => p.status === "low").length,
        out: products.filter((p) => p.status === "out").length,
      };
    },
  },

  orders: {
    async submitOrder(draft: OrderDraft): Promise<PlacedOrderRef> {
      await delay();
      const reference = makeRef();
      const p = products.find((x) => x.id === draft.productId);
      const items: OrderLine[] = p
        ? [
            {
              productName: p.name,
              image: productImageSrc(p.images),
              size: draft.size,
              qty: draft.qty,
              unitPriceKes: discountedPrice(p.priceKes, p.discountPct),
              lineTotalKes: discountedPrice(p.priceKes, p.discountPct) * draft.qty,
            },
          ]
        : [];
      if (p) {
        const total = items[0].lineTotalKes;
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
      }
      const accessToken = recordMyOrder(reference, items, draft);
      return { reference, accessToken };
    },

    async submitCartOrder(draft: CartOrderDraft): Promise<PlacedOrderRef> {
      await delay();
      const reference = makeRef();
      const items: OrderLine[] = draft.items.flatMap((item) => {
        const p = products.find((x) => x.id === item.productId);
        if (!p) return [];
        const unit = discountedPrice(p.priceKes, p.discountPct);
        return [{
          productName: p.name,
          image: productImageSrc(p.images),
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
      const accessToken = recordMyOrder(reference, items, draft);
      return { reference, accessToken };
    },

    async listOrders(query?: PageQuery): Promise<Paged<MerchantOrder>> {
      await delay();
      return paginate(ordersReceived, query?.page, query?.pageSize);
    },

    async countPendingOrders(): Promise<number> {
      await delay();
      return ordersReceived.filter((o) => o.paymentStatus === "pending").length;
    },

    async updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void> {
      await delay();
      ordersReceived = ordersReceived.map((o) =>
        o.id === orderId ? { ...o, paymentStatus } : o,
      );
      saveOrders(ordersReceived);
    },

    async listMyOrders(): Promise<MyOrder[]> {
      await delay();
      return loadMyOrders().map((r) => structuredClone(r.order));
    },

    async lookupOrder(reference: string, accessToken: string): Promise<MyOrder | null> {
      await delay();
      // Both reference AND key must match — the key alone is the secret, exactly
      // like get_order_by_token() server-side.
      const rec = loadMyOrders().find(
        (r) => r.order.reference === reference && r.accessToken === accessToken,
      );
      return rec ? structuredClone(rec.order) : null;
    },
  },

  analytics: {
    // Mirrors merchant_analytics() (0020) over the mock's local orders.
    async getAnalytics(tz: string, days = 7): Promise<Analytics> {
      await delay();
      const dayKey = (iso: string) =>
        new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

      const paid = ordersReceived.filter((o) => o.paymentStatus === "paid");
      const revenue = paid.reduce((s, o) => s + o.totalKes, 0);

      const byProduct = new Map<string, { units: number; revenue: number; image: string }>();
      for (const o of ordersReceived) {
        for (const it of o.items) {
          const cur = byProduct.get(it.productName) ?? { units: 0, revenue: 0, image: it.image };
          cur.units += it.qty;
          cur.revenue += it.lineTotalKes;
          if (!cur.image) cur.image = it.image;
          byProduct.set(it.productName, cur);
        }
      }

      const channels = { whatsapp: 0, instagram: 0, facebook: 0, direct: 0 } as Record<
        OrderChannel,
        number
      >;
      for (const o of ordersReceived) channels[o.channel] += 1;

      const series: { date: string; total: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-CA", { timeZone: tz });
        series.push({
          date: key,
          total: paid
            .filter((o) => dayKey(o.placedAt) === key)
            .reduce((s, o) => s + o.totalKes, 0),
        });
      }

      const lowStock = products.filter((p) => p.status !== "available");

      return {
        revenue,
        aov: paid.length ? Math.round(revenue / paid.length) : 0,
        orderCount: ordersReceived.length,
        paidCount: paid.length,
        pendingCount: ordersReceived.filter((o) => o.paymentStatus === "pending").length,
        topProducts: [...byProduct.entries()]
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.units - a.units)
          .slice(0, 5),
        channels,
        days: series,
        lowStock: lowStock
          .slice(0, 8)
          .map((p) => ({ id: p.id, name: p.name, stockQty: p.stockQty, status: p.status })),
        lowStockCount: lowStock.length,
      };
    },
  },

  follows: {
    // Single demo shop in mock mode; follows persist per browser.
    async listShops(query?: PageQuery): Promise<Paged<Merchant>> {
      await delay();
      const shop: Merchant = {
        ...structuredClone(merchant),
        stats: merchantStats(),
        previews: structuredClone(products)
          .slice(0, 3)
          .map((p) => ({ id: p.id, name: p.name, image: productImageSrc(p.images) })),
      };
      return paginate([shop], query?.page, query?.pageSize);
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
