import { useLocation, useNavigate } from "react-router";
import { useShopHome } from "@/stores/shop";

/**
 * Back navigation for buyer routes. navigate(-1) alone would not do — most
 * shoppers arrive on a deep link shared from WhatsApp or Instagram, so on a
 * cold load there is no in-app history entry behind them, and "back" would
 * bounce them out of PulseShop entirely. React Router tracks its own position
 * in the history stack as `idx`, so use that to tell a real in-app back from
 * a first page view, and fall back to the shop being browsed.
 */
export function useSmartBack(homeTo?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultHome = useShopHome();
  const home = homeTo ?? defaultHome;

  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack = idx > 0;
  const atHome = location.pathname === home;

  const goBack = () => (canGoBack ? navigate(-1) : navigate(home));

  return { canGoBack, atHome, home, goBack };
}
