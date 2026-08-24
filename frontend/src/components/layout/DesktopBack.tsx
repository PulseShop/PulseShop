import { ArrowLeft } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { cn } from "@/lib/utils";

/**
 * Desktop counterpart to FloatingBack.
 *
 * The floating button is `lg:hidden` — it sits where a thumb reaches, which is
 * nowhere near a mouse — so past lg the buyer routes had no back control at all
 * unless the page happened to draw its own (product detail and checkout did;
 * the storefront, the shops directory, the cart and the category listings did
 * not). That left the browser's own back button as the only way out of a shop
 * or a category, which is not a control the page can rely on: shoppers arriving
 * on a shared link have nothing behind them in history.
 *
 * Same smart-back logic as the floating one, so a cold deep-link lands on the
 * shop/marketplace home instead of bouncing out of PulseShop, and the control
 * hides itself when it would be a no-op.
 */
export function DesktopBack({ homeTo, className }: { homeTo?: string; className?: string }) {
  const { canGoBack, atHome, goBack } = useSmartBack(homeTo);

  // Nothing behind us and already home: the button would be a no-op.
  if (!canGoBack && atHome) return null;

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={goBack}
      className={cn(
        "hidden size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex",
        className,
      )}
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
