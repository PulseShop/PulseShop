import { cn } from "@/lib/utils";
import { useToasts } from "@/stores/toast";

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
            "pointer-events-auto rounded-btn px-4 py-3 text-left text-sm font-semibold text-white shadow-modal animate-toast-in",
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
