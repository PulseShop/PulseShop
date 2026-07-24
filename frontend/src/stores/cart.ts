import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";

export type { CartItem };

/** Same product + same size + same colour collapses onto one line. Two shirts
 * that differ only in colour are two lines — the seller ships two things. */
const sameLine = (
  a: Pick<CartItem, "productId" | "size" | "color">,
  productId: string,
  size: string | null,
  color: string | null,
) => a.productId === productId && a.size === size && a.color === color;

interface CartState {
  items: CartItem[];
  /**
   * A discount code the shopper applied in the cart, carried through to
   * checkout so they don't have to type it twice. Advisory only — checkout
   * re-validates it with preview_discount_code and place_order recomputes the
   * charge server-side regardless of what this says.
   */
  discountCode: string | null;
  /**
   * Adds an item. The cart holds items from ONE shop at a time (an order goes
   * to a single seller) — returns false when the item belongs to a different
   * shop than the current cart, so the UI can tell the shopper.
   */
  add: (item: Omit<CartItem, "qty">, qty?: number) => boolean;
  setQty: (productId: string, size: string | null, color: string | null, qty: number) => void;
  remove: (productId: string, size: string | null, color: string | null) => void;
  setDiscountCode: (code: string | null) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discountCode: null,
      add: (item, qty = 1) => {
        const current = get().items;
        if (current.length > 0 && current[0].shopSlug !== item.shopSlug) return false;
        set((s) => {
          const existing = s.items.find((i) =>
            sameLine(i, item.productId, item.size, item.color),
          );
          if (existing) {
            return {
              items: s.items.map((i) =>
                sameLine(i, item.productId, item.size, item.color)
                  ? { ...i, qty: Math.min(i.qty + qty, i.stockQty) }
                  : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, qty: Math.min(qty, item.stockQty) }] };
        });
        return true;
      },
      setQty: (productId, size, color, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            sameLine(i, productId, size, color)
              ? { ...i, qty: Math.max(1, Math.min(qty, i.stockQty)) }
              : i,
          ),
        })),
      remove: (productId, size, color) =>
        set((s) => ({ items: s.items.filter((i) => !sameLine(i, productId, size, color)) })),
      setDiscountCode: (code) => set({ discountCode: code }),
      clear: () => set({ items: [], discountCode: null }),
    }),
    {
      name: "pulseshop-cart",
      // v1: lines written before colours existed have no `color` key at all,
      // and `undefined === null` is false — so every one of them would fail
      // sameLine() and the shopper's existing cart would render with dead
      // quantity and remove buttons. Normalise them on read.
      // v2: adds discountCode.
      version: 2,
      migrate: (persisted) => {
        const state = persisted as
          | { items?: CartItem[]; discountCode?: string | null }
          | undefined;
        return {
          ...state,
          items: (state?.items ?? []).map((i) => ({ ...i, color: i.color ?? null })),
          discountCode: state?.discountCode ?? null,
        } as CartState;
      },
    },
  ),
);

/** Total number of units across all lines (for the nav badge). */
export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);

/** Sum of unitPrice × qty across all lines. */
export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
