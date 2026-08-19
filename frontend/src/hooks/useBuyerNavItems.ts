import { Heart, Home, ShoppingBag, Store, UserRound } from "lucide-react";
import { useFavorites } from "@/stores/favorites";
import { cartCount, useCart } from "@/stores/cart";

/**
 * Shared nav destinations for buyer routes — used by both the mobile tab bar
 * and the desktop header icon row so the two stay in sync.
 *
 * HOME IS THE MARKETPLACE, always. It used to be whichever shop you happened to
 * be browsing (useShopHome), which meant that once a shopper walked into a
 * storefront there was no control anywhere on the screen that led back out to
 * the full catalogue — the Home icon led deeper in, and Shops led to the
 * directory rather than to the products. Getting back to "everything for sale"
 * took the browser's back button or editing the URL.
 *
 * Returning to the shop you were in is a different job, and it already has two
 * controls: the floating back button (which still takes the shop as its home,
 * see MobileShell) and the storefront's own header. So this one points at "/",
 * the same place the logo does, and means the same thing everywhere it appears.
 */
export function useBuyerNavItems() {
  const favCount = useFavorites((s) => s.favorites.length);
  const cartQty = useCart((s) => cartCount(s.items));

  const home = "/";

  const items = [
    { to: home, label: "Home", icon: Home },
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
