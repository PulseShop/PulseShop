import { ArrowLeft } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";

/**
 * Mobile-only floating back control, rendered on every buyer route by
 * MobileShell (unless the page supplies its own in-header back button — see
 * the `floatingBack` prop). Sits above the bottom nav pill / product action
 * bar, in the bottom-left corner where a thumb actually reaches — the header
 * back arrows it replaces were at the top of the screen, the hardest place to
 * hit one-handed.
 */
export function FloatingBack({ homeTo }: { homeTo?: string }) {
  const { canGoBack, atHome, goBack } = useSmartBack(homeTo);

  // Nothing behind us and already home: the button would be a no-op.
  if (!canGoBack && atHome) return null;

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={goBack}
      className="glass above-bar fixed-stable fixed left-4 z-40 flex size-11 items-center justify-center rounded-full text-ink transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
