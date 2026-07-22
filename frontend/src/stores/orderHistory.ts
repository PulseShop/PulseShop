import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderChannel, PaymentMethod } from "@/types";

export interface PlacedOrder {
  reference: string;
  /**
   * The order's secret access key (from place_order). For a guest this is the
   * ONLY way to look the order up again — it lives here and nowhere else on the
   * device. Optional so orders saved before this field existed still load.
   */
  accessToken?: string;
  productId: string;
  productName: string;
  image: string;
  size: string | null;
  qty: number;
  totalKes: number;
  channel: OrderChannel;
  paymentMethod: PaymentMethod | null;
  placedAt: string;
}

interface OrderHistoryState {
  orders: PlacedOrder[];
  add: (order: PlacedOrder) => void;
  /**
   * Wipe this device's order history. Called on sign-out (see hooks/useCart.ts
   * useCartSync): each PlacedOrder carries the order's secret `accessToken` —
   * the only key to look that order up — so leaving them in localStorage after
   * sign-out would hand the previous account's orders to the next person on a
   * shared device. Signed-in shoppers re-read their authoritative history from
   * the DB (listMyOrders, RLS-scoped) on next sign-in, so nothing is lost for
   * them; a pure guest never signs out, so their history persists as before.
   */
  clear: () => void;
}

export const useOrderHistory = create<OrderHistoryState>()(
  persist(
    (set) => ({
      orders: [],
      add: (order) => set((s) => ({ orders: [order, ...s.orders] })),
      clear: () => set({ orders: [] }),
    }),
    { name: "pulseshop-orders" },
  ),
);
