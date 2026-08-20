import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which share link this device arrived on.
 *
 * The gap this closes: a seller posts a product to their WhatsApp Status, a
 * buyer taps it, browses for two days, and orders. Nothing in that story
 * connects the order back to the Status unless the code survives the browse —
 * so it is persisted, not held in memory or in the URL.
 *
 * WINDOW: 30 days. Long enough to cover the "saw it, thought about it, asked a
 * friend, bought it" pattern that is the norm for anything above a few hundred
 * shillings here; short enough that a link tapped last quarter is not still
 * quietly claiming credit for orders it had nothing to do with.
 *
 * LAST TOUCH WINS. A buyer who arrives on one link and then taps a different
 * one is credited to the second: the most recent thing that brought them back
 * is the thing that did the work. Simple, explicable to a seller, and it means
 * the stored value is one code rather than a journey.
 *
 * What this deliberately is NOT: a per-buyer profile. One code and one
 * timestamp, cleared on sign-out with everything else personal (see AppSync in
 * main.tsx), and never sent anywhere except as the `share_code` on an order
 * the buyer is placing anyway.
 */
const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

interface AttributionState {
  code: string | null;
  /** ISO timestamp of when `code` was captured. */
  capturedAt: string | null;
  /** Record an arrival. Last touch wins, so this always overwrites. */
  capture: (code: string) => void;
  /** Forget the current attribution — called once an order has carried it. */
  clear: () => void;
}

export const useAttribution = create<AttributionState>()(
  persist(
    (set) => ({
      code: null,
      capturedAt: null,
      capture: (code) => set({ code, capturedAt: new Date().toISOString() }),
      clear: () => set({ code: null, capturedAt: null }),
    }),
    { name: "pulseshop-attribution" },
  ),
);

/**
 * The code to attach to an order right now, or null.
 *
 * Read through this rather than off the store directly: an expired capture is
 * still SITTING in localStorage (nothing sweeps it), so every consumer has to
 * apply the window or a code from months ago would be attached to today's
 * order. Keeping that rule in one function is what stops the two callers
 * (single-product order and cart checkout) from disagreeing about it.
 */
export function activeShareCode(): string | null {
  const { code, capturedAt } = useAttribution.getState();
  if (!code || !capturedAt) return null;
  const age = Date.now() - new Date(capturedAt).getTime();
  // NaN (a corrupted timestamp) fails this comparison and drops the code,
  // which is the right way for this to fail: attribution is bookkeeping.
  if (!(age >= 0 && age <= WINDOW_MS)) return null;
  return code;
}
