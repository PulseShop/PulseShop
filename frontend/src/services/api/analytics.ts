import type { Analytics } from "@/types";
import type { AnalyticsService } from "../types";
import { supabase } from "./client";

/**
 * The merchant's sales dashboard, aggregated server-side.
 *
 * The page used to call listOrders() + listProducts() — every order the shop
 * had ever received with every line item, plus the entire catalogue — and then
 * reduce all of it in the browser down to about twenty numbers. That payload
 * only ever grows. merchant_analytics() (0020) does the same maths in one query
 * and returns just the answer.
 *
 * It is security *invoker*: `orders owner read` RLS already scopes rows to the
 * calling merchant, so the function physically cannot see another shop's sales.
 */
export const analyticsApi: AnalyticsService = {
  async getAnalytics(tz: string, days = 7): Promise<Analytics> {
    const { data, error } = await supabase.rpc("merchant_analytics", {
      p_days: days,
      p_tz: tz,
    });
    if (error) throw error;
    return data as Analytics;
  },
};
