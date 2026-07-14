import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useShopHome } from "@/stores/shop";

/**
 * Mobile-only floating back control, rendered on every buyer route by
 * MobileShell. Sits above the bottom nav pill / product action bar, in the
 * bottom-left corner where a thumb actually reaches — the header back arrows it
 * replaces were at the top of the screen, the hardest place to hit one-handed.
 *
 * navigate(-1) alone would not do. Most shoppers arrive on a deep link shared
 * from WhatsApp or Instagram, so on a cold load there is no in-app history
 * entry behind them and "back" would bounce them out of PulseShop entirely.
 * React Router tracks its own position in the history stack as `idx`, so use
 * that to tell a real in-app back from a first page view, and fall back to the
 * shop they're browsing.
 */
export function FloatingBack({ homeTo }: { homeTo?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultHome = useShopHome();
  const home = homeTo ?? defaultHome;

  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack = idx > 0;

  // Nothing behind us and already home: the button would be a no-op.
  if (!canGoBack && location.pathname === home) return null;

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => (canGoBack ? navigate(-1) : navigate(home))}
      className="glass above-bar fixed-stable fixed left-4 z-40 flex size-11 items-center justify-center rounded-full text-ink transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
