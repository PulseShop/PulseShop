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
  floatingBack = true,
}: {
  children: ReactNode;
  nav?: boolean;
  /** Where the Home tab points — the current shop on a public storefront. */
  homeTo?: string;
  /** Let the page grow into a real desktop layout past lg — storefront and
   * product detail use this; cart/checkout/orders stay phone-width, just
   * centered, since they don't have a desktop-specific design yet. */
  wide?: boolean;
  /** Off for pages that put their own back control in the header instead —
   * avoids showing the control twice. */
  floatingBack?: boolean;
}) {
  return (
    <div
      className={cn(
        // App-shell on phones: the frame is a fixed-height column (h-dvh) that
        // itself never scrolls, so the fixed bottom nav, floating back button
        // and per-page action bars — all positioned to the viewport — can no
        // longer drift or flicker over content during momentum scroll. Only the
        // inner pane below moves. Past lg it reverts to normal document flow so
        // the wide desktop layouts scroll the page exactly as before.
        "app-surface mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden",
        "lg:block lg:h-auto lg:min-h-dvh lg:overflow-visible",
        wide && "lg:max-w-[1180px]",
      )}
    >
      {/* The one scrolling region on a phone. Content still slides UNDER the bar
          and the back button — that's the point of the glass. pb-bottom-bar sets
          where it comes to REST: deep enough that the last card clears both, so
          nothing is left parked underneath where it can't be read or tapped.
          overscroll-contain stops a scroll from chaining out to the locked frame.
          Derived from --bottom-bar-h, phone-only — desktop reverts to page flow
          (lg:overflow-visible) and the class is a no-op there. See tokens.css. */}
      <div className="pb-bottom-bar min-h-0 flex-1 overflow-y-auto overscroll-contain lg:min-h-0 lg:flex-none lg:overflow-visible">
        {children}
      </div>
      {floatingBack && <FloatingBack homeTo={homeTo} />}
      {nav && <BottomNav homeTo={homeTo} />}
    </div>
  );
}
