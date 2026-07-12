import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The failure state for a react-query fetch.
 *
 * Without this, a failed list query renders as an *empty* list — a shopper
 * can't tell "this shop has nothing for sale" from "the network died", and the
 * only way out is a manual refresh. Every list on the site now distinguishes
 * the two.
 *
 * Offline is called out separately because it's the common case on mobile and
 * the fix is different: retrying is pointless until the connection is back.
 */
export function QueryError({
  title = "Something went wrong",
  message,
  onRetry,
  retrying = false,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-soft",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          offline ? "bg-stone-100" : "bg-danger/10",
        )}
      >
        <Icon className={cn("size-7", offline ? "text-muted" : "text-danger")} />
      </div>
      <div>
        <p className="font-bold text-ink">{offline ? "You're offline" : title}</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          {offline
            ? "Reconnect to the internet and try again."
            : (message ?? "Check your connection and try again.")}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {retrying ? "Retrying…" : "Try again"}
        </button>
      )}
    </div>
  );
}
