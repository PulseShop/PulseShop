import type { Services } from "../types";
import { analyticsApi } from "./analytics";
import { authApi } from "./auth";
import { cartApi } from "./cart";
import { discountsApi } from "./discounts";
import { favoritesApi } from "./favorites";
import { followsApi } from "./follows";
import { ordersApi } from "./orders";
import { paymentsApi } from "./payments";
import { productsApi } from "./products";
import { reviewsApi } from "./reviews";
import { storageApi } from "./storage";

/**
 * Real backend adapter. Auth, products, orders and storage hit Supabase.
 * Payments go through the payments adapter (placeholder until the partner wires
 * the real M-Pesa/PayPal backend — see services/api/payments.ts).
 */
export const apiServices: Services = {
  auth: authApi,
  products: productsApi,
  orders: ordersApi,
  analytics: analyticsApi,
  follows: followsApi,
  reviews: reviewsApi,
  favorites: favoritesApi,
  cart: cartApi,
  payments: paymentsApi,
  storage: storageApi,
  discounts: discountsApi,
};
