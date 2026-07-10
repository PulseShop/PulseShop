import type {
  CartOrderDraft,
  MerchantOrder,
  OrderChannel,
  OrderDraft,
  PaymentMethod,
  PaymentStatus,
} from "@/types";
import type { OrderService } from "../types";
import { requireUserId, supabase } from "./client";

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
    items: (row.order_items ?? []).map((i) => ({
      productName: i.product_name,
      image: i.image ?? "",
      size: i.size,
      qty: i.qty,
      unitPriceKes: i.unit_price_kes,
      lineTotalKes: i.line_total_kes,
    })),
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
): Promise<{ reference: string }> {
  const { data, error } = await supabase.rpc("place_order", {
    p_customer_name: customer.name,
    p_customer_phone: customer.phone,
    p_customer_notes: customer.notes ?? "",
    p_channel: channel,
    p_payment_method: payment?.method ?? null,
    p_items: items.map((i) => ({ product_id: i.productId, size: i.size, qty: i.qty })),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { reference: string } | undefined;
  if (!row?.reference) throw new Error("Order was not created");
  return { reference: row.reference };
}

export const ordersApi: OrderService = {
  async submitOrder(draft: OrderDraft): Promise<{ reference: string }> {
    return placeOrder(draft.customer, draft.channel, draft.payment, [
      { productId: draft.productId, size: draft.size, qty: draft.qty },
    ]);
  },

  async submitCartOrder(draft: CartOrderDraft): Promise<{ reference: string }> {
    return placeOrder(draft.customer, draft.channel, draft.payment, draft.items);
  },

  async listOrders(): Promise<MerchantOrder[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("merchant_id", uid)
      .order("placed_at", { ascending: false });
    if (error) throw error;
    return (data as OrderRow[]).map(toMerchantOrder);
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
};
