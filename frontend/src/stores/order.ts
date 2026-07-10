import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CustomerInfo {
  name: string;
  phone: string;
  notes: string;
}

type OrderChannel = "whatsapp" | "instagram" | "facebook";

interface OrderState {
  /** Size selected on the product detail page, carried into the order form. */
  selectedSize: string | null;
  qty: number;
  customer: CustomerInfo;
  /** Channel picked inline on the desktop product page — OrderPage uses this
   * as its initial selection instead of always defaulting to WhatsApp. */
  preferredChannel: OrderChannel | null;
  setSelectedSize: (size: string | null) => void;
  setQty: (qty: number) => void;
  saveCustomer: (customer: CustomerInfo) => void;
  setPreferredChannel: (channel: OrderChannel | null) => void;
  resetDraft: () => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      selectedSize: null,
      qty: 1,
      customer: { name: "", phone: "", notes: "" },
      preferredChannel: null,
      setSelectedSize: (selectedSize) => set({ selectedSize }),
      setQty: (qty) => set({ qty: Math.max(1, qty) }),
      saveCustomer: (customer) => set({ customer }),
      setPreferredChannel: (preferredChannel) => set({ preferredChannel }),
      resetDraft: () => set({ selectedSize: null, qty: 1, preferredChannel: null }),
    }),
    {
      name: "pulseshop-order",
      // remember the customer for repeat orders; size/qty are per-session
      partialize: (s) => ({ customer: s.customer }),
    },
  ),
);
