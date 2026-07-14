import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { FloatingBack } from "./FloatingBack";

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
      {/* Content scrolls UNDER the bottom bar and the back button — that's the
          point of the glass. This floor only decides where it comes to REST:
          deep enough that the last card clears both, so nothing is left parked
          underneath where it can't be read or tapped (on checkout, that would be
          the submit button, whose left edge the back button would silently eat).
          Derived from --bottom-bar-h, and phone-only — desktop hides the bar and
          the back button, so it needs no floor at all. See tokens.css. */}
      <div className="pb-bottom-bar">{children}</div>
      <FloatingBack homeTo={homeTo} />
      {nav && <BottomNav homeTo={homeTo} />}
    </div>
  );
}
