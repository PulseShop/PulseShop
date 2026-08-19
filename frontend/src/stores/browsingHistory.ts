import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/types";

/**
 * One product, as much of it as a thumbnail needs.
 *
 * A SNAPSHOT, not an id. The rail has to render the moment the page paints —
 * fifteen thumbnails is fifteen round trips if only ids are kept, and every one
 * of them for a product the shopper has already seen. The cost of the snapshot
 * is that a price shown here can be stale; that is acceptable for a "you looked
 * at this" rail and is corrected the instant they click through.
 */
export interface ViewedProduct {
  id: string;
  name: string;
  slug: string;
  shopSlug?: string;
  image?: string;
  priceKes: number;
  category: string;
  /** ISO. Sorted on, so the most recent view leads. */
  viewedAt: string;
}

/** How many views are kept. Amazon shows a page of fifteen and pages back
 *  through four; one page is the useful part, and localStorage is not a
 *  database. */
const LIMIT = 20;

interface BrowsingHistoryState {
  viewed: ViewedProduct[];
  /** Record a view. Re-viewing something moves it to the front rather than
   *  adding a duplicate — the rail is "what you looked at", not a log. */
  record: (product: Product) => void;
  remove: (productId: string) => void;
  /**
   * Wipe this device's history. Called on sign-out, exactly as favorites are
   * (hooks/useFavorites.ts): what someone browsed is personal, this persists to
   * localStorage under a fixed key, and a shared phone would otherwise show the
   * previous account's history to the next person.
   */
  clear: () => void;
}

export const useBrowsingHistory = create<BrowsingHistoryState>()(
  persist(
    (set) => ({
      viewed: [],
      record: (product) =>
        set((s) => ({
          viewed: [
            {
              id: product.id,
              name: product.name,
              slug: product.slug,
              shopSlug: product.shopSlug,
              image: product.images[0],
              priceKes: product.priceKes,
              category: product.category,
              viewedAt: new Date().toISOString(),
            },
            ...s.viewed.filter((v) => v.id !== product.id),
          ].slice(0, LIMIT),
        })),
      remove: (productId) => set((s) => ({ viewed: s.viewed.filter((v) => v.id !== productId) })),
      clear: () => set({ viewed: [] }),
    }),
    { name: "pulseshop-browsing-history" },
  ),
);

/** The most recently viewed product, or null on a first visit. Drives the
 *  marketplace's Recommendations panel. */
export const lastViewed = (viewed: ViewedProduct[]): ViewedProduct | null => viewed[0] ?? null;
