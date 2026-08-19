import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * THE SCRIM IS BLACK, NOT `bg-ink/40`, and this is the one place in the app
 * where a literal beats the token.
 *
 * A scrim has one job: push the page behind the dialog away by darkening it.
 * That direction is a constant — it does not flip with the theme, because there
 * is no such thing as receding by getting brighter. `--color-ink` inverts
 * outright (stone-900 in light, stone-50 in dark), so `bg-ink/40` painted a
 * 40%-WHITE haze over dark mode: the page behind got lighter and hazier instead
 * of dimmer, and the dialog stopped reading as being in front of anything.
 *
 * Dark carries a heavier alpha than light for the same reason it needs one at
 * all: the page underneath is already near-black, so 40% black barely separates
 * it from the dialog on top.
 *
 * Both Modal and Sheet portal to document.body, OUTSIDE any page wrapper, so
 * they always paint in the document's real theme.
 */
const SCRIM = "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm dark:bg-black/70";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content
          className={cn(
            "glass-strong fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal p-6 animate-modal-in focus:outline-none",
            className,
          )}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Bottom drawer variant for mobile payment sheet. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content className="glass-strong fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 rounded-t-modal p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-sheet-up focus:outline-none">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-extrabold text-ink">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-fill"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
