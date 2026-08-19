import { cn } from "@/lib/utils";
import { useToasts } from "@/stores/toast";

/**
 * Toasts sit on a filled accent — success green, danger red, or plain ink —
 * so their text colour is `text-on-accent`, never a literal white.
 *
 * This is not cosmetic. Every one of the three fills MOVES between themes:
 * dark mode lightens success to green-400 and danger to red-400 so they read
 * against a near-black page, and --color-ink inverts outright from stone-900 to
 * stone-50. A hard-coded `text-white` therefore painted white-on-near-white for
 * the default tone — which is what made "Please select a colour first" invisible
 * when Order Now was pressed without a variant chosen. `text-on-accent` tracks
 * --color-card, so it is white in light and near-black in dark, and one class
 * stays legible on all three fills in both themes.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="above-bar-2 fixed-stable pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-full max-w-[380px] -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto rounded-btn px-4 py-3 text-left text-sm font-semibold text-on-accent shadow-modal animate-toast-in",
            t.tone === "success" && "bg-success",
            t.tone === "danger" && "bg-danger",
            t.tone === "default" && "bg-ink",
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
