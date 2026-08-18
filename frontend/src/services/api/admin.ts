import type { GrowthPoint, PlatformStats } from "@/types";
import type { AdminService } from "../types";
import { supabase } from "./client";

/**
 * The owner dashboard's data (migration 0047).
 *
 * Nothing in this file is a security control. `platform_stats()` and
 * `platform_growth()` both assert is_platform_admin() before they read
 * anything, so a non-admin calling them straight over PostgREST gets the same
 * refusal this does. The page uses `isAdmin()` only to choose between rendering
 * a dashboard and rendering "not authorised".
 */

/** A row from platform_growth(). */
interface GrowthRow {
  day: string;
  sellers: number;
  shoppers: number;
  sellers_total: number;
  shoppers_total: number;
}

export const adminApi: AdminService = {
  async isAdmin() {
    // Not signed in at all is a plain "no", not an error worth surfacing.
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) return false;

    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error) return false;
    return data === true;
  },

  async stats() {
    const { data, error } = await supabase.rpc("platform_stats");
    if (error) throw error;
    return data as PlatformStats;
  },

  async growth(days = 30): Promise<GrowthPoint[]> {
    const { data, error } = await supabase.rpc("platform_growth", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as GrowthRow[]).map((r) => ({
      day: r.day,
      sellers: r.sellers,
      shoppers: r.shoppers,
      sellersTotal: r.sellers_total,
      shoppersTotal: r.shoppers_total,
    }));
  },
};
