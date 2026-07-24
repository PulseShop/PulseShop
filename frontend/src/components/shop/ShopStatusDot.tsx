import { cn } from "@/lib/utils";
import type { ShopStatus } from "@/types";

const COLOR: Record<ShopStatus, string> = {
  open: "bg-success",
  closed: "bg-warning",
  closing: "bg-danger",
};

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  open: "Open",
  closed: "Temporarily closed",
  closing: "Closing down",
};

/**
 * The presence dot on a shop's avatar. Only "open" pulses — a still yellow or
 * red dot reads as a state, a pulsing one reads as "something is happening",
 * which isn't true for either.
 */
export function ShopStatusDot({ status, className }: { status: ShopStatus; className?: string }) {
  const label = SHOP_STATUS_LABEL[status];
  return (
    <span className={cn("flex size-4", className)} title={label} aria-label={label}>
      {status === "open" && (
        <span className={cn("absolute inline-flex size-4 rounded-full animate-ping-slow", COLOR[status])} />
      )}
      <span className={cn("relative inline-flex size-4 rounded-full border-2 border-card", COLOR[status])} />
    </span>
  );
}
