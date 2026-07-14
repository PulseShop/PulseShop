import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { useBuyerNavItems } from "@/hooks/useBuyerNavItems";

/**
 * Mobile tab bar, anchored edge-to-edge at the bottom of the screen. Desktop
 * pages replace it with header icons instead.
 *
 * It used to be a floating pill inset from the edges. Now it's a ledge the
 * content scrolls beneath and stays visible through — the blur is doing real
 * work, so the bar has to be flush and full-bleed for anything to pass under it.
 */
export function BottomNav({ homeTo }: { homeTo?: string }) {
  const { home, items, badgeFor } = useBuyerNavItems(homeTo);

  return (
    <nav className="glass-bar fixed-stable fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {/* The bar spans the screen; the tabs stay in the phone-width column, so
          they don't sprawl on a wide phone or a small tablet. */}
      <div className="mx-auto flex h-[var(--bottom-bar-h)] max-w-[430px] items-center px-2">
        {items.map(({ to, label, icon: Icon }) => {
          const badge = badgeFor(label);
          return (
            <NavLink
              key={label}
              to={to}
              end={to === home}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  "group relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-muted",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full transition-all duration-200",
                      isActive
                        ? "bg-primary/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                        : "group-active:scale-90",
                    )}
                  >
                    <Icon className="size-[21px]" />
                    {badge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-favorite px-1 text-[10px] font-bold text-white ring-2 ring-white/70">
                        {badge}
                      </span>
                    )}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
