import type { Plan } from "@/types";

/**
 * Which plan a feature needs, in one place.
 *
 * routes/marketing/tiers.ts describes the plans to a prospective seller; this
 * decides what a signed-in one can actually do. They are deliberately separate
 * files with separate jobs — the marketing page is prose and pricing, this is
 * the gate — but they describe the same product, so a feature added here needs
 * a line there too.
 *
 * Billing does not exist yet, so `merchants.plan` (migration 0041) is 'explorer'
 * for every shop until someone sets it. That means these gates are LIVE and
 * default to closed. Only add a feature here when locking it is the intent.
 */

/** Plans in ascending order. Index is the entitlement level. */
const PLAN_ORDER: Plan[] = ["explorer", "boutique", "influencer"];

export const PLAN_LABEL: Record<Plan, string> = {
  explorer: "Explorer",
  boutique: "Boutique",
  influencer: "Influencer",
};

/**
 * The gated features and the plan each one starts at.
 *
 * `structuredListings` is the Phone/Computer listing types: the seller fills in
 * storage, RAM, condition and the rest, and those become searchable filters on
 * the storefront. It is Influencer because it is a merchandising tool for a
 * catalogue big enough to need filtering, not a basic listing control — a shop
 * selling five phones describes them fine in the details box.
 */
export const FEATURE_PLAN = {
  structuredListings: "influencer",
} as const satisfies Record<string, Plan>;

export type Feature = keyof typeof FEATURE_PLAN;

/** An unknown/absent plan reads as the free tier — the safe direction to fail. */
const rank = (plan: Plan | undefined) => Math.max(0, PLAN_ORDER.indexOf(plan ?? "explorer"));

/** Does this plan include the feature? */
export const planHas = (plan: Plan | undefined, feature: Feature) =>
  rank(plan) >= rank(FEATURE_PLAN[feature]);

/** The plan a seller has to be on for the feature, for the upsell copy. */
export const planNeededFor = (feature: Feature): Plan => FEATURE_PLAN[feature];
