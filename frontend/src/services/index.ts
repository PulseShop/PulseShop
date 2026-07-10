/**
 * Active service adapter. Uses the real Supabase backend when the project env
 * vars are present (frontend/.env.local); otherwise falls back to the in-memory
 * mock so the app still runs with zero configuration.
 */
import { apiServices } from "./api";
import { isSupabaseConfigured } from "./api/client";
import { mockServices } from "./mock";
import type { Services } from "./types";

// Add this inside your existing services object
export const analytics = {
  getDashboardMetrics: async () => {
    // Assuming you have an authorized fetch setup
    const res = await fetch('/api/merchant/analytics', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('supabase_token')}` // Or however you store the token
      }
    });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  }
};

export const services: Services = isSupabaseConfigured ? apiServices : mockServices;
export type { Credentials, MerchantUpdate, ProductInput, Services, SignupInput } from "./types";
