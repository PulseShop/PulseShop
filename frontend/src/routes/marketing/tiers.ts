/**
 * The pricing tiers as marketing copy. Nothing here is enforced anywhere —
 * billing does not exist yet, so this file is the single place the numbers
 * and feature lists live until a real entitlements system replaces it.
 */

export interface TierCardLine {
  text: string;
  /** Rendered with a lock icon — a limit or a missing feature. */
  locked?: boolean;
}

export interface TierDef {
  id: "explorer" | "boutique" | "influencer";
  name: string;
  /** null = free */
  priceKes: number | null;
  audience: string;
  /** One-paragraph pitch used in the detail section. */
  pitch: string;
  highlight?: boolean;
  /** False = billing not built yet, CTA renders as "Coming soon". */
  available: boolean;
  cta: string;
  cardLines: TierCardLine[];
  included: string[];
  missing: string[];
}

export const TIERS: TierDef[] = [
  {
    id: "explorer",
    name: "Explorer",
    priceKes: null,
    audience: "For the seasonal seller",
    pitch:
      "Everything you need to put a real shop behind your bio link. List a handful of products, take orders on the apps you already use, and pay nothing until your shop outgrows it.",
    available: true,
    cta: "Start with Explorer",
    cardLines: [
      { text: "Up to 5 product listings" },
      { text: "1 GB media storage" },
      { text: "Orders dashboard, banner & profile" },
      { text: "Full product editor with variants" },
      { text: "Analytics locked", locked: true },
      { text: "Pickup fulfilment only", locked: true },
      { text: "Reviews & discount codes locked", locked: true },
    ],
    included: [
      "Your own shop link — pulseshop.space/yourshop",
      "Up to 5 product listings",
      "1 GB storage for product photos",
      "Orders dashboard with WhatsApp, Instagram & Facebook order channels",
      "Shop banner and profile customisation",
      "Full product editor — sizes, colours, per-product discounts",
      "Rich link previews when you share your shop",
    ],
    missing: [
      "Analytics page",
      "Reviews dashboard",
      "Discount codes",
      "Instagram Story image generator",
      "Delivery fulfilment options",
      "Search & sharing (SEO) tools",
    ],
  },
  {
    id: "boutique",
    name: "Boutique",
    priceKes: 1950,
    audience: "For the general seller",
    pitch:
      "For the shop that sells every week. Room for a real catalogue, a full dashboard to run it from, and the tools that bring buyers back — reviews, discount codes and a month of analytics.",
    available: false,
    cta: "Select Boutique",
    cardLines: [
      { text: "Up to 100 product listings" },
      { text: "50 GB media storage" },
      { text: "Full dashboard — orders, overview, banner, profile" },
      { text: "Analytics for the last 30 days" },
      { text: "Reviews dashboard" },
      { text: "Discount codes" },
      { text: "Pickup fulfilment only", locked: true },
    ],
    included: [
      "Everything in Explorer",
      "Up to 100 product listings",
      "50 GB storage for product photos",
      "Full dashboard overview",
      "Analytics — the last 30 days",
      "Reviews dashboard for buyer feedback",
      "Discount codes with expiries and redemption caps",
    ],
    missing: [
      "Full analytics history",
      "Instagram Story image generator",
      "Delivery fulfilment options",
      "Search & sharing (SEO) tools",
    ],
  },
  {
    id: "influencer",
    name: "Influencer",
    priceKes: 6500,
    audience: "All access",
    pitch:
      "The whole platform, no ceilings. Unlimited catalogue and storage, your full sales history, delivery options for buyers, SEO tools that put your shop in search results, and the Instagram Story generator that turns products into ready-to-post content.",
    highlight: true,
    available: false,
    cta: "Go Influencer",
    cardLines: [
      { text: "Unlimited product listings" },
      { text: "Unlimited media storage" },
      { text: "Instagram Story image generator" },
      { text: "Full analytics — all-time history" },
      { text: "Pickup, delivery or both" },
      { text: "Search & sharing (SEO) tools" },
      { text: "Everything in Boutique" },
    ],
    included: [
      "Everything in Boutique",
      "Unlimited product listings",
      "Unlimited media storage",
      "Instagram Story image generator for ready-to-post product content",
      "Full analytics with your complete sales history",
      "All fulfilment options — pickup, delivery or both",
      "Search & sharing tools — custom descriptions, Google & WhatsApp previews",
    ],
    missing: [],
  },
];

export const formatTierPrice = (priceKes: number | null) =>
  priceKes === null ? "KES 0" : `KES ${priceKes.toLocaleString("en-KE")}`;

/** Feature-by-feature matrix for the comparison table. `true`/`false` render
 * as check/dash icons; strings render as-is. */
export interface ComparisonRow {
  feature: string;
  values: [string | boolean, string | boolean, string | boolean];
}

export const COMPARISON: ComparisonRow[] = [
  { feature: "Product listings", values: ["5", "100", "Unlimited"] },
  { feature: "Media storage", values: ["1 GB", "50 GB", "Unlimited"] },
  { feature: "Orders dashboard", values: [true, true, true] },
  { feature: "Dashboard overview", values: ["Banner & profile", true, true] },
  { feature: "Product editor with variants", values: [true, true, true] },
  { feature: "Analytics", values: [false, "Last 30 days", "Full history"] },
  { feature: "Reviews dashboard", values: [false, true, true] },
  { feature: "Discount codes", values: [false, true, true] },
  { feature: "Instagram Story generator", values: [false, false, true] },
  { feature: "Fulfilment options", values: ["Pickup only", "Pickup only", "Pickup, delivery or both"] },
  { feature: "Search & sharing (SEO) tools", values: [false, false, true] },
];
