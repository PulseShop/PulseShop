import type { Services } from "../types";
import { mockServices } from "../mock";
import { authApi } from "./auth";
import { ordersApi } from "./orders";
import { productsApi } from "./products";
import { storageApi } from "./storage";

/**
 * Real backend adapter. Auth, products, orders and storage hit Supabase;
 * payments stay on the mock (no live M-Pesa/PayPal gateway wired yet).
 */
export const apiServices: Services = {
  auth: authApi,
  products: productsApi,
  orders: ordersApi,
  payments: mockServices.payments,
  storage: storageApi,
};
