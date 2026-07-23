import type { Fulfillment, StockStatus } from "@/types";

export const STOCK_LABEL: Record<StockStatus, string> = {
  available: "Available",
  low: "Low Stock",
  out: "Out of Stock",
};

/** Stock qty at or below this (and above 0) counts as "low". */
export const LOW_STOCK_THRESHOLD = 5;

export function statusForQty(qty: number): StockStatus {
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "available";
}

/**
 * Product taxonomy. `product.category` stores the leaf (e.g. "Smartphones");
 * the group is presentation only — it becomes an <optgroup> in the product form
 * so the list stays navigable as it grows.
 */
export const CATEGORY_GROUPS = [
  {
    group: "Consumer Electronics",
    items: [
      "Smartphones",
      "Laptops & Computers",
      "Gaming Consoles",
      "Smart Home Gadgets",
      "Audio Equipment",
    ],
  },
  {
    group: "Apparel, Shoes & Accessories",
    items: [
      "Men's Clothing",
      "Women's Clothing",
      "Kids' Clothing",
      "Footwear",
      "Jewelry",
      "Watches",
      "Handbags",
    ],
  },
  {
    group: "Health, Beauty & Personal Care",
    items: ["Cosmetics", "Skincare", "Hair Care", "Vitamins & Supplements", "Pharmacy"],
  },
  {
    group: "Food, Beverage & Grocery",
    items: [
      "Fresh Produce",
      "Meat & Seafood",
      "Dairy & Eggs",
      "Pantry Staples",
      "Alcohol",
      "Packaged Snacks",
    ],
  },
  {
    group: "Home, Garden & Furniture",
    items: [
      "Mattresses",
      "Home Decor",
      "Kitchen Appliances",
      "Furniture",
      "Tools",
      "Lawn & Garden",
    ],
  },
  {
    group: "Media, Books & Entertainment",
    items: ["Books", "Movies & TV", "Music", "Video Games"],
  },
  {
    group: "Toys, Baby & Kids",
    items: ["Strollers & Car Seats", "Diapers & Baby Care", "Educational Toys", "Board Games"],
  },
] as const;

/** Every selectable leaf category, flattened. */
export const CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((g) => g.items);

/**
 * True for a category saved before this taxonomy existed (e.g. "Tops"). The
 * product form surfaces these so editing an old product doesn't silently wipe
 * its category — the merchant reclassifies it when they're ready.
 */
export const isLegacyCategory = (category: string) =>
  Boolean(category) && !CATEGORIES.includes(category);

/** Categories where a size (S/M/L, shoe size, etc.) is a meaningful product attribute. */
const SIZED_CATEGORIES: readonly string[] = [
  "Men's Clothing",
  "Women's Clothing",
  "Kids' Clothing",
  "Footwear",
];

export const categoryHasSizes = (category: string) => SIZED_CATEGORIES.includes(category);

/**
 * Size presets.
 *
 * Sizes used to be free text the seller typed. That reads fine on one product
 * and falls apart across a catalogue: "L", "l", "Large" and "large " are four
 * different sizes to a database, so the buyer-side size filter could never
 * aggregate them. Picking from a fixed list is what makes the filter possible.
 *
 * Footwear gets its own list because letter sizes are meaningless for shoes —
 * a seller listing trainers needs 36-46, not SM-XXXL.
 */
export const APPAREL_SIZES = ["SM", "M", "LG", "XL", "XXL", "XXXL"] as const;

export const FOOTWEAR_SIZES = [
  "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46",
] as const;

/** The preset a category's size picker should offer. Empty = no size picker. */
export function sizeOptionsFor(category: string): readonly string[] {
  if (category === "Footwear") return FOOTWEAR_SIZES;
  return categoryHasSizes(category) ? APPAREL_SIZES : [];
}

/**
 * Orders a set of sizes the way a human reads them, not the way they sort.
 * Alphabetically "LG, M, SM, XL, XXL" is correct and useless; the DB returns
 * facet values sorted that way, so every list rendered to a shopper runs
 * through here. Anything not in a preset (a legacy free-text size like "S", or
 * "32W") keeps its relative order at the end rather than being dropped.
 */
export function sortSizes(sizes: string[]): string[] {
  const order = [...APPAREL_SIZES, ...FOOTWEAR_SIZES] as readonly string[];
  const rank = (s: string) => {
    const i = order.indexOf(s);
    return i === -1 ? order.length : i;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The ten colours a seller can pick from, with the swatch each one paints.
 *
 * A fixed list for the same reason sizes are: "navy", "Navy Blue" and "dark
 * blue" cannot be filtered together. The `hex` is presentation only — `name` is
 * what's stored on the product, sent to the seller, and matched by the filter,
 * so re-theming a swatch later never orphans existing products.
 */
export const PRODUCT_COLORS = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Grey", hex: "#9CA3AF" },
  { name: "Navy", hex: "#1E3A8A" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Red", hex: "#DC2626" },
  { name: "Green", hex: "#16A34A" },
  { name: "Beige", hex: "#D6C7AE" },
  { name: "Brown", hex: "#78350F" },
  { name: "Pink", hex: "#EC4899" },
] as const;

const COLOR_HEX = new Map<string, string>(PRODUCT_COLORS.map((c) => [c.name, c.hex]));

/** Swatch colour for a stored colour name; falls back to grey for anything
 * saved before this list existed (or added to it and later removed). */
export const colorHex = (name: string) => COLOR_HEX.get(name) ?? "#D1D5DB";

/** Human phrase for a shop's fulfillment setting (migration 0031). Undefined
 * (a directory row that doesn't carry it) reads as the "both" default. */
export function fulfillmentLabel(f: Fulfillment | undefined): string {
  switch (f) {
    case "pickup":
      return "pickup only";
    case "delivery":
      return "delivery only";
    default:
      return "pickup & delivery";
  }
}
