import type { ShareChannel, ShareLink, ShareTarget } from "@/types";
import type { ShareLinkService } from "../types";
import { requireUserId, supabase } from "./client";

/**
 * Short share links (migration 0052).
 *
 * Three of the four methods go through RPCs rather than the table, for
 * different reasons each time:
 *
 *  - ensure_share_link generates the code, which needs to check for collisions
 *    across EVERY shop's codes — something owner-scoped RLS deliberately can't
 *    see. It re-derives the caller from auth.uid() and refuses to mint a link
 *    for a product the caller doesn't own.
 *  - resolve_share_link is called by strangers with no session at all, and
 *    increments the click counter on a row they must never be able to read.
 *  - share_link_performance joins links to orders; both sides are already
 *    RLS-scoped to the caller, so it runs security invoker and needs no
 *    elevated rights, it just saves the client a two-query join.
 *
 * deleteLink is the exception and goes straight through the client, because
 * owner-scoped RLS on share_links is the entire boundary for it.
 */
interface PerformanceRow {
  id: string;
  code: string;
  product_id: string | null;
  product_name: string;
  channel: ShareChannel;
  label: string;
  click_count: number;
  order_count: number;
  revenue_kes: number;
  created_at: string;
}

interface ShareTargetPayload {
  code: string;
  shopSlug: string;
  shopName: string;
  productId: string | null;
  productSlug: string | null;
  channel: ShareChannel;
}

export const shareLinksApi: ShareLinkService = {
  async ensureLink(productId: string | null, channel: ShareChannel, label = ""): Promise<string> {
    const { data, error } = await supabase.rpc("ensure_share_link", {
      p_product_id: productId,
      p_channel: channel,
      p_label: label,
    });
    if (error) throw error;
    return data as string;
  },

  async resolve(code: string): Promise<ShareTarget | null> {
    const { data, error } = await supabase.rpc("resolve_share_link", { p_code: code });
    if (error) throw error;
    // The RPC answers null for an unknown code rather than raising, so a
    // mistyped link is a "not found" page and not an error toast.
    if (!data) return null;
    const p = data as ShareTargetPayload;
    return {
      code: p.code,
      shopSlug: p.shopSlug,
      shopName: p.shopName,
      productId: p.productId ?? null,
      productSlug: p.productSlug ?? null,
      channel: p.channel,
    };
  },

  async listLinks(): Promise<ShareLink[]> {
    // Not used as a filter — the RPC is already scoped by RLS — but calling it
    // asserts a session exists, so a signed-out caller fails here with the
    // same "Not signed in" every other merchant-facing method throws rather
    // than silently returning an empty dashboard.
    await requireUserId();
    const { data, error } = await supabase.rpc("share_link_performance");
    if (error) throw error;
    return ((data ?? []) as PerformanceRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      productId: r.product_id,
      productName: r.product_name,
      channel: r.channel,
      label: r.label,
      clickCount: Number(r.click_count ?? 0),
      orderCount: Number(r.order_count ?? 0),
      revenueKes: Number(r.revenue_kes ?? 0),
      createdAt: r.created_at,
    }));
  },

  async deleteLink(id: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("share_links")
      .delete()
      .eq("id", id)
      .eq("merchant_id", uid);
    if (error) throw error;
  },
};
