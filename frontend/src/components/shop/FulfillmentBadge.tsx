import { Store, Truck } from "lucide-react";
import { fulfillmentLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/types";

/**
 * How this shop gets orders to its buyers: pickup, delivery, or both.
 *
 * The seller has been able to set this since migration 0031, but the only place
 * a shopper ever saw it was the last card on the checkout page — after they had
 * chosen a product, added it to the cart and filled in their details. "Pickup
 * only" is exactly the kind of thing that decides whether someone in another
 * town orders at all, so it belongs on the storefront and the product page,
 * where the decision is actually being made.
 *
 * Icon follows the mode rather than always being a van: a shop that only does
 * counter pickup showing a delivery truck is worse than no icon.
 */
export function FulfillmentBadge({
  fulfillment,
  className,
  tone = "surface",
}: {
  fulfillment: Fulfillment | undefined;
  className?: string;
  /** "surface" sits on a card; "plain" is for an already-tinted container. */
  tone?: "surface" | "plain";
}) {
  const mode = fulfillment ?? "both";
  const Icon = mode === "pickup" ? Store : Truck;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        tone === "surface" ? "bg-primary/10 text-primary" : "text-muted",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {/* Capitalised via the label rather than a CSS transform so the text a
          screen reader reads is the text on screen. */}
      <span className="capitalize">{fulfillmentLabel(mode)}</span>
    </span>
  );
}
