import { Heart, Home, Package, ShoppingBag, Store } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/stores/favorites";
import { cartCount, useCart } from "@/stores/cart";
import { useShopHome } from "@/stores/shop";

export function BottomNav({ homeTo }: { homeTo?: string }) {
  const favCount = useFavorites((s) => s.favorites.length);
  const cartQty = useCart((s) => cartCount(s.items));
  const defaultHome = useShopHome();
  const home = homeTo ?? defaultHome;

  const items = [
    { to: home, label: "Home", icon: Home },
    { to: "/shops", label: "Shops", icon: Store },
    { to: "/favorites", label: "Favorites", icon: Heart },
    { to: "/cart", label: "Cart", icon: ShoppingBag },
    { to: "/orders", label: "Orders", icon: Package },
  ];

  const badgeFor = (label: string) =>
    label === "Favorites" ? favCount : label === "Cart" ? cartQty : 0;

  return (
    <nav className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2">
      <div className="glass-nav flex rounded-full p-1.5">
        {items.map(({ to, label, icon: Icon }) => {
          const badge = badgeFor(label);
          return (
            <NavLink
              key={to}
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
