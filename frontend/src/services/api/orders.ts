import type { OrderDraft } from "@/types";
import { discountedPrice } from "@/lib/currency";
import type { OrderService } from "../types";
import { supabase } from "./client";

const makeRef = () =>
  `PS-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

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
};
