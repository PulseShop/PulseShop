import type { Services } from "../types";
import { mockServices } from "../mock";
import { authApi } from "./auth";
import { ordersApi } from "./orders";
import { productsApi } from "./products";

/**
 * Real backend adapter. Auth, products and orders hit Supabase; payments stay
 * on the mock (no live M-Pesa/PayPal gateway wired yet).
 */
export const apiServices: Services = {
  auth: authApi,
  products: productsApi,
  orders: ordersApi,
  payments: mockServices.payments,
};
