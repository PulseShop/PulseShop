import { useEffect, useRef } from "react";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useCart } from "@/stores/cart";
import { useOrderHistory } from "@/stores/orderHistory";
import type { CartItem } from "@/types";

/**
 * Owns the sign-in/sign-out lifecycle of the device-local personal stores that
 * would otherwise leak to the next person on a shared device.
 *
 * Cart: mirrors the local (device) cart — stores/cart.ts, the fast
 * always-available UI cache — to the signed-in shopper's server cart
 * (cart_items table, RLS owner-only), and clears the local cache on sign-out.
 * Without the clear, a cart added under one account would sit in localStorage
 * under the fixed key "pulseshop-cart" and be handed straight to the next
 * person — the exact gap migration 0025 exists to close.
 *   On sign-in: the server cart wins when it holds anything (an account's cart
 *   is the same cart on every device, so a stale local guest cart shouldn't
 *   shadow it); otherwise a guest's local-only cart (built before logging in)
 *   is pushed up so it isn't lost.
 *
 * Order history: stores/orderHistory persists each placed order WITH its
 * secret access token (the only key to look that order up). It is DB-backed
 * for signed-in shoppers (listMyOrders, RLS-scoped), so it's cleared on
 * sign-out for the same shared-device reason — the identical leak the cart had.
 *
 * Mount once near the app root (see AppSync in main.tsx).
 */
export function useCartSync() {
  const userId = useAuth((s) => s.session?.id ?? null);
  const syncedFor = useRef<string | null>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!userId) {
      if (wasSignedIn.current) {
        useCart.getState().clear();
        useOrderHistory.getState().clear();
      }
      wasSignedIn.current = false;
      syncedFor.current = null;
      return;
    }
    wasSignedIn.current = true;
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    (async () => {
      try {
        const remote = await services.cart.listCart();
        if (remote.length > 0) {
          useCart.setState({ items: remote });
          return;
        }
        const local = useCart.getState().items;
        await Promise.all(local.map((item) => services.cart.upsertCartItem(item).catch(() => {})));
      } catch {
        // best-effort — local cart still works offline
      }
    })();
  }, [userId]);
}

function currentLine(productId: string, size: string | null): CartItem | undefined {
  return useCart.getState().items.find((i) => i.productId === productId && i.size === size);
}

/** Adds an item locally (instant) and mirrors it to the server when signed in. */
export function useAddToCart() {
  const add = useCart((s) => s.add);
  const userId = useAuth((s) => s.session?.id ?? null);

  return (item: Omit<CartItem, "qty">, qty = 1): boolean => {
    const added = add(item, qty);
    if (added && userId) {
      const line = currentLine(item.productId, item.size);
      if (line) services.cart.upsertCartItem(line).catch(() => {});
    }
    return added;
  };
}

/** Sets a line's quantity locally and mirrors it to the server when signed in. */
export function useSetCartQty() {
  const setQty = useCart((s) => s.setQty);
  const userId = useAuth((s) => s.session?.id ?? null);

  return (productId: string, size: string | null, qty: number) => {
    setQty(productId, size, qty);
    if (!userId) return;
    const line = currentLine(productId, size);
    if (line) services.cart.upsertCartItem(line).catch(() => {});
  };
}

/** Removes a line locally and mirrors it to the server when signed in. */
export function useRemoveFromCart() {
  const remove = useCart((s) => s.remove);
  const userId = useAuth((s) => s.session?.id ?? null);

  return (productId: string, size: string | null) => {
    remove(productId, size);
    if (userId) services.cart.removeCartItem(productId, size).catch(() => {});
  };
}

/** Clears the cart locally and mirrors it to the server when signed in — used
 * after a successful checkout. */
export function useClearCart() {
  const clear = useCart((s) => s.clear);
  const userId = useAuth((s) => s.session?.id ?? null);

  return () => {
    clear();
    if (userId) services.cart.clearCart().catch(() => {});
  };
}
