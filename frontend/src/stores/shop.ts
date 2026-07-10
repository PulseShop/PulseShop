import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Remembers which shop the shopper is currently browsing so the consumer flow
 * (product detail, cart, favorites, back-nav) can return to the right store.
 * Set when visiting a public storefront or a product; null = the signed-in
 * merchant's own preview at /shop.
 */
interface ShopState {
  slug: string | null;
  setSlug: (slug: string | null) => void;
}

export const useShop = create<ShopState>()(
  persist(
    (set) => ({
      slug: null,
      setSlug: (slug) => set({ slug }),
    }),
    { name: "pulseshop-active-shop" },
  ),
);

/** The path the Home tab / "back to store" links should point to. */
export function useShopHome(): string {
  const slug = useShop((s) => s.slug);
  return slug ? `/${slug}` : "/shop";
}
