import type {
  CartOrderDraft,
  MerchantOrder,
  OrderChannel,
  OrderDraft,
  PaymentMethod,
  PaymentStatus,
} from "@/types";
import { discountedPrice } from "@/lib/currency";
import type { OrderService } from "../types";
import { requireUserId, supabase } from "./client";

const makeRef = () =>
  `PS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

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
 * Order placement for shoppers. Looks up the product to snapshot price/name,
 * then writes an order header + one line item. IDs are generated client-side so
 * we don't depend on RLS letting the caller read the row back after insert.
 */
export const ordersApi: OrderService = {
  async submitOrder(draft: OrderDraft): Promise<{ reference: string }> {
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("merchant_id, name, images, price_kes, discount_pct")
      .eq("id", draft.productId)
      .single();
    if (pErr) throw pErr;

    const unit = discountedPrice(product.price_kes, product.discount_pct);
    const total = unit * draft.qty;
    const reference = makeRef();
    const orderId = crypto.randomUUID();

    const { error: oErr } = await supabase.from("orders").insert({
      id: orderId,
      reference,
      merchant_id: product.merchant_id,
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      customer_notes: draft.customer.notes,
      channel: draft.channel,
      payment_method: draft.payment?.method ?? null,
      payment_status: draft.payment?.status === "paid" ? "paid" : "pending",
      subtotal_kes: total,
      total_kes: total,
    });
    if (oErr) throw oErr;

    const { error: iErr } = await supabase.from("order_items").insert({
      order_id: orderId,
      product_id: draft.productId,
      product_name: product.name,
      image: product.images?.[0] ?? "",
      size: draft.size,
      qty: draft.qty,
      unit_price_kes: unit,
    });
    if (iErr) throw iErr;

    return { reference };
  },

  async submitCartOrder(draft: CartOrderDraft): Promise<{ reference: string }> {
    // Snapshot names/images and recompute prices from the DB — cart lines may
    // hold stale prices captured at add-time.
    const ids = draft.items.map((i) => i.productId);
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, merchant_id, name, images, price_kes, discount_pct")
      .in("id", ids);
    if (pErr) throw pErr;
    if (!products || products.length === 0) throw new Error("No products found for this order");

    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = draft.items.flatMap((item) => {
      const p = byId.get(item.productId);
      if (!p) return []; // product removed since it was added to the cart
      const unit = discountedPrice(p.price_kes, p.discount_pct);
      return [{
        product_id: p.id,
        product_name: p.name,
        image: p.images?.[0] ?? "",
        size: item.size,
        qty: item.qty,
        unit_price_kes: unit,
      }];
    });
    if (lines.length === 0) throw new Error("None of the cart items exist any more");

    const total = lines.reduce((sum, l) => sum + l.unit_price_kes * l.qty, 0);
    const reference = makeRef();
    const orderId = crypto.randomUUID();

    const { error: oErr } = await supabase.from("orders").insert({
      id: orderId,
      reference,
      merchant_id: products[0].merchant_id,
      customer_name: draft.customer.name,
      customer_phone: draft.customer.phone,
      customer_notes: draft.customer.notes,
      channel: draft.channel,
      payment_method: draft.payment?.method ?? null,
      payment_status: draft.payment?.status === "paid" ? "paid" : "pending",
      subtotal_kes: total,
      total_kes: total,
    });
    if (oErr) throw oErr;

    const { error: iErr } = await supabase
      .from("order_items")
      .insert(lines.map((l) => ({ ...l, order_id: orderId })));
    if (iErr) throw iErr;

    return { reference };
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
