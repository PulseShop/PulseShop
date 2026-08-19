import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/stores/theme";

/**
 * Light / Dark / System, as a segmented control.
 *
 * Segmented rather than a switch because there are three states, and the third
 * is the default. A two-position switch cannot express "follow my phone", which
 * is the setting most people actually want.
 *
 * Shared between the shopper's Account page and the seller's Settings page
 * rather than duplicated, because the underlying preference is ONE preference:
 * stores/theme.ts persists it per device, not per account or per role, and the
 * same person switches between browsing their feed and managing their stock on
 * the same phone. Two copies of this control could drift into looking like two
 * separate settings, which would be a lie about what they do.
 */
export function AppearancePicker({ className }: { className?: string }) {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);

  const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: MonitorSmartphone },
  ];

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1 rounded-btn bg-fill p-1"
      >
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === value ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {mode === "system"
          ? "Follows your phone's setting."
          : `Always ${mode}, whatever your phone is set to.`}
      </p>
    </div>
  );
}
