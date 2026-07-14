import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/common/Logo";
import {
  getInstallEvent,
  isIOS,
  isInAppBrowser,
  isStandalone,
  onInstallEventChange,
  promptInstall,
} from "@/lib/install";

const VISITS_KEY = "pulseshop-visits";
const DISMISSED_KEY = "pulseshop-install-dismissed";

type Variant = "chromium" | "ios" | "in-app";

/**
 * Install banner, from the second visit.
 *
 * It used to render only when Chromium handed us a `beforeinstallprompt` event
 * — so on an iPhone it never appeared at all, and iOS users had no way to learn
 * the app was installable. Now each environment gets the only advice that works
 * in it: a real Install button on Chromium, the Share -> Add to Home Screen
 * route on iOS Safari, and "open this in your browser" inside the Instagram /
 * Facebook webviews, where installing is impossible either way.
 */
export function InstallPrompt() {
  // Chromium's event can arrive before React mounts, so it's captured at module
  // scope and subscribed to here rather than being listened for in an effect.
  const installEvent = useSyncExternalStore(onInstallEventChange, getInstallEvent, () => null);

  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed: never nag
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
      const visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      if (visits >= 2) setEligible(true);
    } catch {
      /* private mode / storage disabled — just don't prompt */
    }
  }, []);

  if (!eligible || dismissed) return null;

  const variant: Variant | null = isInAppBrowser()
    ? "in-app"
    : isIOS()
      ? "ios"
      : installEvent
        ? "chromium"
        : null; // a browser that can't install and can't be told how (e.g. desktop Firefox)

  if (!variant) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* nothing to persist to; the in-memory dismiss still holds for this session */
    }
  };

  const install = async () => {
    await promptInstall();
    dismiss();
  };

  return (
    // Sits above the floating back button (which is above the nav pill), so the
    // three never stack on top of each other on a phone. On desktop there is no
    // bottom furniture, so it tucks into the corner instead of floating mid-air.
    <div
      role="dialog"
      aria-label="Install PulseShop"
      className="above-bar-2 fixed-stable fixed left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[398px] -translate-x-1/2 rounded-card bg-ink p-3.5 text-white shadow-modal animate-toast-in sm:w-[calc(100%-2rem)] lg:bottom-6 lg:left-auto lg:right-6 lg:w-80 lg:translate-x-0"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Logo size={24} />
        </span>

        <div className="min-w-0 flex-1">
          {variant === "chromium" && (
            <>
              <p className="text-sm font-semibold leading-snug">Install PulseShop</p>
              <p className="mt-1 text-xs leading-relaxed text-white/70">
                Add it to your home screen for one-tap access.
              </p>
            </>
          )}

          {variant === "ios" && (
            <>
              <p className="text-sm font-semibold leading-snug">Install PulseShop</p>
              {/* iOS has no install API — the user has to do it by hand, so the
                  only thing worth showing is exactly where the buttons are. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-relaxed text-white/70">
                Tap
                <Share className="inline size-3.5 shrink-0" aria-label="the Share button" />
                then
                <span className="inline-flex items-center gap-1 font-semibold text-white">
                  <SquarePlus className="size-3.5 shrink-0" aria-hidden />
                  Add to Home Screen
                </span>
              </p>
            </>
          )}

          {variant === "in-app" && (
            <>
              <p className="text-sm font-semibold leading-snug">Open in your browser</p>
              <p className="mt-1 text-xs leading-relaxed text-white/70">
                Tap the menu (⋯) and choose{" "}
                <span className="font-semibold text-white">Open in browser</span> to install
                PulseShop.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Its own row, not squeezed in beside the text: at 320px a button sharing
          that row wrapped the message onto five lines. Only Chromium gets one —
          the other two variants are instructions, so an Install button there
          would be a button that cannot install. */}
      {variant === "chromium" && (
        <button
          type="button"
          onClick={install}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-btn bg-white px-3 text-sm font-bold text-ink transition-transform active:scale-[0.98]"
        >
          <Download className="size-4" />
          Install
        </button>
      )}
    </div>
  );
}
