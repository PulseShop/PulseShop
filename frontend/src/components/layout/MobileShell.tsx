import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";

/** Phone-width shell for all customer routes: constrained column + sticky bottom nav. */
export function MobileShell({
  children,
  nav = true,
  homeTo,
  wide = false,
}: {
  children: ReactNode;
  nav?: boolean;
  /** Where the Home tab points — the current shop on a public storefront. */
  homeTo?: string;
  /** Let the page grow into a real desktop layout past lg — storefront and
   * product detail use this; cart/checkout/orders stay phone-width, just
   * centered, since they don't have a desktop-specific design yet. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "app-surface mx-auto min-h-dvh w-full max-w-[430px]",
        wide && "lg:max-w-[1180px]",
      )}
    >
      <div className={nav ? "pb-28" : ""}>{children}</div>
      {nav && <BottomNav homeTo={homeTo} />}
    </div>
  );
}
