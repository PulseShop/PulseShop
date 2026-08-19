import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { useBuyerNavItems } from "@/hooks/useBuyerNavItems";
import { ProfileMenu } from "./ProfileMenu";

/**
 * The buyer nav cluster in the top-right of every customer header: Home, Shops,
 * Favorites and Cart as icons, then the account dropdown.
 *
 * It is one component rather than a row of per-page controls because the whole
 * point is that it does not move or change between pages. The marketplace used
 * to assemble its own version out of an "All shops" text link, a lone Home
 * icon and the profile menu, which meant the front door was the one page whose
 * header did NOT match the rest of the site — no Favorites, no Cart, and Shops
 * spelled out in words where every other page drew it as a store icon.
 *
 * The four icons are desktop-only; phones get the same destinations from the
 * bottom tab bar. The account dropdown shows at every width, because signing in
 * is the one thing the tab bar's Account tab makes you navigate for.
 */
export function DesktopQuickNav({ className }: { className?: string }) {
  const { home, quickItems, badgeFor } = useBuyerNavItems();

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <div className="hidden items-center gap-1 lg:flex">
        {quickItems.map(({ to, label, icon: Icon }) => {
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
      <ProfileMenu />
    </div>
  );
}
