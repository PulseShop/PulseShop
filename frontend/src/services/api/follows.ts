import type { Merchant, Paged, ShopPreview } from "@/types";
import type { FollowService, ShopQuery } from "../types";
import { requireUserId, supabase } from "./client";
import { toSocialHandle, toWhatsAppDigits } from "@/lib/phone";

/** One row from shop_directory() — a merchant plus its aggregated stats and
 * embedded product previews. */
interface DirectoryRow {
  id: string;
  name: string;
  handle: string;
  bio: string;
  location: string;
  avatar_url: string;
  banner_url: string;
  is_online: boolean;
  whatsapp: string;
  instagram: string;
  facebook: string;
  product_count: number;
  order_count: number;
  follower_count: number;
  avg_rating: number;
  previews: ShopPreview[];
  total_count: number;
}

const avatarFor = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d9488&color=fff&size=160`;

function toDirectoryMerchant(row: DirectoryRow): Merchant {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio ?? "",
    location: row.location ?? "",
    avatarUrl: row.avatar_url || avatarFor(row.name),
    bannerUrl: row.banner_url ?? "",
    isOnline: row.is_online,
    // shop_directory() deliberately doesn't return these — the discover list
    // renders no titles, and a projection that returns only what it renders is
    // one that can't leak what it doesn't.
    tagline: "",
    metaDescription: "",
    stats: {
      products: Number(row.product_count ?? 0),
      orders: Number(row.order_count ?? 0),
      followers: Number(row.follower_count ?? 0),
      rating: Number(row.avg_rating ?? 0),
    },
    contacts: {
      whatsapp: row.whatsapp ? toWhatsAppDigits(row.whatsapp) : "",
      instagram: row.instagram ? toSocialHandle(row.instagram) : "",
      facebook: row.facebook ? toSocialHandle(row.facebook) : "",
    },
    previews: row.previews ?? [],
  };
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Shop discovery + follows.
 *
 * listShops() is one RPC call. It used to be 1 + 4N: a select of every merchant
 * row (unpaginated), then four stat queries per shop. The page on top of it
 * then fetched each shop's whole catalogue to show three thumbnails, taking the
 * real cost to 5N+1 requests for a single view — ~15,000 requests at 3,000
 * shops, which simply never completes. shop_directory() (0019) returns the
 * stats and the previews already aggregated, one page at a time, so the cost is
 * now flat in the number of shops.
 */
export const followsApi: FollowService = {
  async listShops(query?: ShopQuery): Promise<Paged<Merchant>> {
    const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, query?.page ?? 1);

    const { data, error } = await supabase.rpc("shop_directory", {
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_search: query?.search?.trim() ?? "",
    });
    if (error) throw error;

    const rows = (data ?? []) as DirectoryRow[];
    return {
      items: rows.map(toDirectoryMerchant),
      total: Number(rows[0]?.total_count ?? 0),
    };
  },

  async listFollowing(): Promise<string[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("follows")
      .select("merchant_id")
      .eq("follower_id", uid);
    if (error) throw error;
    return (data as { merchant_id: string }[]).map((r) => r.merchant_id);
  },

  async follow(merchantId: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: uid, merchant_id: merchantId });
    if (error) throw error;
  },

  async unfollow(merchantId: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", uid)
      .eq("merchant_id", merchantId);
    if (error) throw error;
  },
};
