import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { useBuyerNavItems } from "@/hooks/useBuyerNavItems";

/** Desktop's stand-in for the mobile floating tab bar — a persistent icon row in the header. */
export function DesktopQuickNav() {
  const { home, items, badgeFor } = useBuyerNavItems();

  return (
    <div className="hidden items-center gap-1 lg:flex">
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
                "relative flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-fill",
              )
            }
          >
            <Icon className="size-5" />
            {badge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-favorite text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
