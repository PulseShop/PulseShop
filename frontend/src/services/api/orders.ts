import type {
  CartOrderDraft,
  MerchantOrder,
  MyOrder,
  OrderChannel,
  OrderDraft,
  OrderLine,
  Paged,
  PaymentMethod,
  PaymentStatus,
  PlacedOrderRef,
} from "@/types";
import type { OrderService, PageQuery } from "../types";
import { productImageSrc } from "@/lib/productImage";
import { requireUserId, supabase } from "./client";

const ORDERS_PAGE_SIZE = 20;

interface OrderItemRow {
  product_name: string;
  image: string | null;
  size: string | null;
  qty: number;
  unit_price_kes: number;
  line_total_kes: number;
}

interface OrderRow {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  customer_notes: string | null;
  channel: OrderChannel;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  subtotal_kes: number;
  total_kes: number;
  placed_at: string;
  order_items: OrderItemRow[];
}

function toOrderLine(i: OrderItemRow): OrderLine {
  return {
    productName: i.product_name,
    image: productImageSrc(i.image ? [i.image] : []),
    size: i.size,
    qty: i.qty,
    unitPriceKes: i.unit_price_kes,
    lineTotalKes: i.line_total_kes,
  };
}

function toMerchantOrder(row: OrderRow): MerchantOrder {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerNotes: row.customer_notes ?? "",
    channel: row.channel,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotalKes: row.subtotal_kes,
    totalKes: row.total_kes,
    placedAt: row.placed_at,
    items: (row.order_items ?? []).map(toOrderLine),
  };
}

/** A row from the buyer's own-orders query — order + items + shop name join. */
interface MyOrderRow extends OrderRow {
  merchants: { name: string; handle: string } | null;
}

function toMyOrder(row: MyOrderRow): MyOrder {
  return {
    id: row.id,
    reference: row.reference,
    channel: row.channel,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotalKes: row.subtotal_kes,
    totalKes: row.total_kes,
    placedAt: row.placed_at,
    shopName: row.merchants?.name ?? "",
    shopSlug: row.merchants?.handle ?? "",
    items: (row.order_items ?? []).map(toOrderLine),
  };
}

/** The shape get_order_by_token() returns (snake_case, no merchant ids). */
interface OrderTokenPayload {
  id: string;
  reference: string;
  channel: OrderChannel;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  subtotal_kes: number;
  total_kes: number;
  placed_at: string;
  items: OrderItemRow[];
}

function tokenPayloadToMyOrder(p: OrderTokenPayload): MyOrder {
  return {
    id: p.id,
    reference: p.reference,
    channel: p.channel,
    paymentMethod: p.payment_method,
    paymentStatus: p.payment_status,
    subtotalKes: p.subtotal_kes,
    totalKes: p.total_kes,
    placedAt: p.placed_at,
    items: (p.items ?? []).map(toOrderLine),
  };
}

/**
 * Order placement for shoppers. Delegates to the `place_order` Postgres
 * function (migration 0005), which — in one transaction — validates every
 * line belongs to the same shop, locks and decrements stock, recomputes
 * prices from the DB, and generates a collision-checked reference. Orders are
 * always created 'pending'; only the owning merchant or a future payment
 * webhook can flip payment_status to 'paid'.
 */
async function placeOrder(
  customer: { name: string; phone: string; notes?: string },
  channel: OrderChannel,
  payment: { method: PaymentMethod; status: PaymentStatus } | null,
  items: { productId: string; size: string | null; qty: number }[],
): Promise<PlacedOrderRef> {
  const { data, error } = await supabase.rpc("place_order", {
    p_customer_name: customer.name,
    p_customer_phone: customer.phone,
    p_customer_notes: customer.notes ?? "",
    p_channel: channel,
    p_payment_method: payment?.method ?? null,
    p_items: items.map((i) => ({ product_id: i.productId, size: i.size, qty: i.qty })),
  });
  if (error) throw error;
  // place_order() returns one row: (order_id, reference, access_token).
  const row = (Array.isArray(data) ? data[0] : data) as
    | { reference: string; access_token: string }
    | undefined;
  if (!row?.reference || !row?.access_token) throw new Error("Order was not created");
  return { reference: row.reference, accessToken: row.access_token };
}

export const ordersApi: OrderService = {
  async submitOrder(draft: OrderDraft): Promise<PlacedOrderRef> {
    return placeOrder(draft.customer, draft.channel, draft.payment, [
      { productId: draft.productId, size: draft.size, qty: draft.qty },
    ]);
  },

  async submitCartOrder(draft: CartOrderDraft): Promise<PlacedOrderRef> {
    return placeOrder(draft.customer, draft.channel, draft.payment, draft.items);
  },

  /**
   * One page of the merchant's received orders. This list grows forever — it
   * used to fetch every order the shop had ever taken, with every line item
   * nested, on each visit to the dashboard.
   */
  async listOrders(query?: PageQuery): Promise<Paged<MerchantOrder>> {
    const uid = await requireUserId();
    const pageSize = query?.pageSize ?? ORDERS_PAGE_SIZE;
    const page = Math.max(1, query?.page ?? 1);
    const from = (page - 1) * pageSize;

    const { data, error, count } = await supabase
      .from("orders")
      .select("*, order_items(*)", { count: "exact" })
      .eq("merchant_id", uid)
      .order("placed_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    return {
      items: (data as OrderRow[]).map(toMerchantOrder),
      total: count ?? 0,
    };
  },

  async countPendingOrders(): Promise<number> {
    const uid = await requireUserId();
    const { count, error } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", uid)
      .eq("payment_status", "pending");
    if (error) throw error;
    return count ?? 0;
  },

  async updateOrderStatus(orderId: string, paymentStatus: PaymentStatus): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: paymentStatus })
      .eq("id", orderId)
      .eq("merchant_id", uid);
    if (error) throw error;
  },

  async listMyOrders(): Promise<MyOrder[]> {
    const uid = await requireUserId();
    // Explicit customer_id filter on top of the "orders customer read" RLS
    // policy — so a merchant who also shops sees only what they bought here,
    // not the orders they received.
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), merchants(name, handle)")
      .eq("customer_id", uid)
      .order("placed_at", { ascending: false });
    if (error) throw error;
    return (data as MyOrderRow[]).map(toMyOrder);
  },

  async lookupOrder(reference: string, accessToken: string): Promise<MyOrder | null> {
    const { data, error } = await supabase.rpc("get_order_by_token", {
      p_reference: reference,
      p_access_token: accessToken,
    });
    if (error) throw error;
    if (!data) return null; // reference/key didn't match a real order
    return tokenPayloadToMyOrder(data as OrderTokenPayload);
  },
};
