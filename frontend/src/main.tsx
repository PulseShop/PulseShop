import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { registerSW } from "virtual:pwa-register";

import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./styles/tokens.css";

import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { Toaster } from "@/components/ui/Toaster";
import { useToasts } from "@/stores/toast";
import { LoginPage } from "@/routes/auth/LoginPage";
import { ShopperSignupPage } from "@/routes/auth/ShopperSignupPage";
import { SignupPage } from "@/routes/auth/SignupPage";
import { ShopsPage } from "@/routes/shops/ShopsPage";
import { CartPage } from "@/routes/cart/CartPage";
import { CheckoutPage } from "@/routes/checkout/CheckoutPage";
import { LandingPage } from "@/routes/marketing/LandingPage";
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

registerSW({ immediate: true });

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/shop" element={<StorefrontPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/shopper" element={<ShopperSignupPage />} />
          <Route path="/shops" element={<ShopsPage />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<OrderPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/dashboard" element={<DashboardOverviewPage />} />
          <Route path="/dashboard/inventory" element={<InventoryPage />} />
          <Route path="/dashboard/orders" element={<OrdersDashboardPage />} />
          <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
          <Route path="/dev/components" element={<ComponentsPage />} />
          {/* public shop by slug — keep LAST so static routes match first */}
          <Route path="/:shopSlug" element={<StorefrontPage />} />
        </Routes>
        <Toaster />
        <InstallPrompt />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
