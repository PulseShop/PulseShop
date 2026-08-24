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
   * Adds an item, from any shop (migration 0062).
   *
   * The cart used to hold one seller at a time because an order went to one
   * seller. It no longer does: checkout fans a mixed cart out into one order
   * per seller under a parent group, so there is nothing left to refuse.
   *
   * Still returns boolean rather than void, and still returns true, because
   * every call site checks it to decide whether to show a rejection message.
   * Changing the signature would silently turn those branches into dead code
   * that still renders "added to cart" — this way they simply stop firing.
   */
  add: (item: Omit<CartItem, "qty">, qty?: number) => boolean;
  setQty: (productId: string, size: string | null, color: string | null, qty: number) => void;
  remove: (productId: string, size: string | null, color: string | null) => void;
  setDiscountCode: (code: string | null) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      discountCode: null,
      add: (item, qty = 1) => {
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

/**
 * The cart split by seller, which is the shape both the cart and the checkout
 * now render and the shape the server fans the order out into.
 *
 * Insertion-ordered rather than sorted by name: the shopper built this list in
 * this order, and re-sorting it would shuffle the page under them every time
 * they add something. A Map preserves that ordering by construction.
 */
export interface CartShopGroup {
  shopSlug: string;
  items: CartItem[];
  subtotal: number;
}

export function groupByShop(items: CartItem[]): CartShopGroup[] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const existing = groups.get(item.shopSlug);
    if (existing) existing.push(item);
    else groups.set(item.shopSlug, [item]);
  }
  return [...groups].map(([shopSlug, groupItems]) => ({
    shopSlug,
    items: groupItems,
    subtotal: cartSubtotal(groupItems),
  }));
}

/** How many distinct sellers the cart spans. Drives the "N shops" copy. */
export const cartShopCount = (items: CartItem[]) =>
  new Set(items.map((i) => i.shopSlug)).size;
