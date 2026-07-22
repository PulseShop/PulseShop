import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";

export type { CartItem };

/** Same product + same size collapses onto one line. */
const sameLine = (a: Pick<CartItem, "productId" | "size">, productId: string, size: string | null) =>
  a.productId === productId && a.size === size;

interface CartState {
  items: CartItem[];
  /**
   * Adds an item. The cart holds items from ONE shop at a time (an order goes
   * to a single seller) — returns false when the item belongs to a different
   * shop than the current cart, so the UI can tell the shopper.
   */
  add: (item: Omit<CartItem, "qty">, qty?: number) => boolean;
  setQty: (productId: string, size: string | null, qty: number) => void;
  remove: (productId: string, size: string | null) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item, qty = 1) => {
        const current = get().items;
        if (current.length > 0 && current[0].shopSlug !== item.shopSlug) return false;
        set((s) => {
          const existing = s.items.find((i) => sameLine(i, item.productId, item.size));
          if (existing) {
            return {
              items: s.items.map((i) =>
                sameLine(i, item.productId, item.size)
                  ? { ...i, qty: Math.min(i.qty + qty, i.stockQty) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, qty: Math.min(qty, item.stockQty) }] };
        });
        return true;
      },
      setQty: (productId, size, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            sameLine(i, productId, size) ? { ...i, qty: Math.max(1, Math.min(qty, i.stockQty)) } : i,
          ),
        })),
      remove: (productId, size) =>
        set((s) => ({ items: s.items.filter((i) => !sameLine(i, productId, size)) })),
      clear: () => set({ items: [] }),
    }),
    { name: "pulseshop-cart" },
  ),
);

/** Total number of units across all lines (for the nav badge). */
export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);

/** Sum of unitPrice × qty across all lines. */
export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
