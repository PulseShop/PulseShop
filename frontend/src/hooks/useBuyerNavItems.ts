import { Heart, Home, ShoppingBag, Store, UserRound } from "lucide-react";
import { useFavorites } from "@/stores/favorites";
import { cartCount, useCart } from "@/stores/cart";
import { useShopHome } from "@/stores/shop";

/**
 * Shared nav destinations for buyer routes — used by both the mobile floating
 * pill and the desktop header icon row so the two stay in sync.
 */
export function useBuyerNavItems(homeTo?: string) {
  const favCount = useFavorites((s) => s.favorites.length);
  const cartQty = useCart((s) => cartCount(s.items));
  const defaultHome = useShopHome();
  const home = homeTo ?? defaultHome;

  // When there's no shop context (guest, or a shopper who hasn't opened a
  // store yet), useShopHome() falls back to "/shops" — the same place the
  // Shops tab already points to. Showing both would mean two tabs sharing
  // one destination, so Home only gets its own entry when it's actually
  // distinct from Shops.
  const items = [
    ...(home === "/shops" ? [] : [{ to: home, label: "Home", icon: Home }]),
    { to: "/shops", label: "Shops", icon: Store },
    { to: "/favorites", label: "Favorites", icon: Heart },
    { to: "/cart", label: "Cart", icon: ShoppingBag },
    // Orders lives inside Account now — the tab a buyer reaches for to sign
    // out, edit delivery details, or find their history.
    { to: "/account", label: "Account", icon: UserRound },
  ];

  const badgeFor = (label: string) =>
    label === "Favorites" ? favCount : label === "Cart" ? cartQty : 0;

  return { home, items, badgeFor };
}
