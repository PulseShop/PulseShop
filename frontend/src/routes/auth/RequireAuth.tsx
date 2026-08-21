import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/stores/auth";

/**
 * Guards merchant-only routes (dashboard, shop self-preview). Without this,
 * visiting them signed out fires getMerchant(), which throws "Not signed in"
 * and leaves the page stuck on its loading skeleton forever.
 */
export function RequireMerchant({ children }: { children: ReactNode }) {
  const session = useAuth((s) => s.session);
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // A shopper who reached a seller-only URL gets the marketplace, which is
  // where every other shopper redirect on the site now lands — see LoginPage.
  if (session.accountType !== "merchant") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
