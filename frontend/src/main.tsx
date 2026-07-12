import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { registerSW } from "virtual:pwa-register";

import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./styles/tokens.css";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { Toaster } from "@/components/ui/Toaster";
import { isSupabaseConfigured, supabase } from "@/services/api/client";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toast";
import { LoginPage } from "@/routes/auth/LoginPage";
import { ResetPasswordPage } from "@/routes/auth/ResetPasswordPage";
import { ShopperSignupPage } from "@/routes/auth/ShopperSignupPage";
import { SignupPage } from "@/routes/auth/SignupPage";
import { ShopsPage } from "@/routes/shops/ShopsPage";
import { CartPage } from "@/routes/cart/CartPage";
import { CheckoutPage } from "@/routes/checkout/CheckoutPage";
import { LandingPage } from "@/routes/marketing/LandingPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { ComponentsPage } from "@/routes/dev/ComponentsPage";
import { AnalyticsPage } from "@/routes/dashboard/AnalyticsPage";
import { DashboardOverviewPage } from "@/routes/dashboard/DashboardOverviewPage";
import { InventoryPage } from "@/routes/dashboard/InventoryPage";
import { OrdersDashboardPage } from "@/routes/dashboard/OrdersPage";
import { SettingsPage } from "@/routes/dashboard/SettingsPage";
import { FavoritesPage } from "@/routes/favorites/FavoritesPage";
import { OrderPage } from "@/routes/order/OrderPage";
import { OrdersPage } from "@/routes/order/OrdersPage";
import { ProductDetailPage } from "@/routes/product/ProductDetailPage";
import { StorefrontPage } from "@/routes/storefront/StorefrontPage";
import { RequireMerchant } from "./routes/auth/RequireAuth";
import { AuthCallbackPage } from "./routes/auth/AuthCallbackPage";

registerSW({ immediate: true });

// Keep the persisted Zustand session (stores/auth) in sync with Supabase's own
// auth state. Without this, a token that expires or is revoked server-side —
// or a sign-out in another tab — leaves the Zustand store still saying
// "logged in" while every Supabase query throws "Not signed in": RequireMerchant
// waves the user into the dashboard, then every query on the page errors.
// onAuthStateChange fires once on subscribe with the current session (or null),
// so this also reconciles a stale persisted session on boot, not just live changes.
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session && useAuth.getState().session) {
      useAuth.getState().signOut();
    }
  });
}

// offline awareness: order/payment actions queue a toast when connectivity drops
window.addEventListener("offline", () =>
  useToasts.getState().push("You're offline — some actions may not work"),
);
window.addEventListener("online", () =>
  useToasts.getState().push("Back online", "success"),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/welcome" element={<LandingPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/shop" element={<StorefrontPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/signup/shopper" element={<ShopperSignupPage />} />
            {/* where the emailed recovery link lands — must be on Supabase's
                Auth "Redirect URLs" allowlist */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/shops" element={<ShopsPage />} />
            <Route path="/product/:id" element={<ProductDetailPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order/:id" element={<OrderPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/dashboard" element={<RequireMerchant><DashboardOverviewPage /></RequireMerchant>} />
            <Route path="/dashboard/inventory" element={<RequireMerchant><InventoryPage /></RequireMerchant>} />
            <Route path="/dashboard/orders" element={<RequireMerchant><OrdersDashboardPage /></RequireMerchant>} />
            <Route path="/dashboard/analytics" element={<RequireMerchant><AnalyticsPage /></RequireMerchant>} />
            <Route path="/dashboard/settings" element={<RequireMerchant><SettingsPage /></RequireMerchant>} />
            <Route path="/dev/components" element={<ComponentsPage />} />
            {/* public shop by slug — keep LAST so static routes match first.
                A single-segment miss (/nosuchshop) is genuinely ambiguous, so it
                lands on the storefront's "Shop not found", which names the handle. */}
            <Route path="/:shopSlug" element={<StorefrontPage />} />
            {/* everything else (multi-segment misses like /dashboard/typo) used to
                match no route at all and render a blank page */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster />
          <InstallPrompt />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
