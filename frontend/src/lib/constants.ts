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
 * Product taxonomy. `product.category` stores the LEAF (e.g. "Smartphones");
 * the group above it is never written to a product.
 *
 * The group used to be presentation only — an <optgroup> in the seller's
 * product form, and nothing else. It is now also the top level of the shopper's
 * filter ribbon (see CategoryRail), which is what the two names on each entry
 * are for:
 *
 *   `group` is the long, unambiguous name. It labels the optgroup in the
 *   seller's form, where the list is read once, carefully, by someone deciding
 *   where their product belongs.
 *
 *   `label` is the short one, for the shopper's chip. A ribbon is read in
 *   peripheral vision at a glance, and "Health, Beauty & Personal Care" is not
 *   a chip — it is a sentence that pushes every group after it off the strip.
 *
 * Adding a leaf here is free: it is a new option in the form and a new chip
 * under its group. RENAMING or MOVING one is not — `products.category` holds
 * the old string, so a rename orphans every product filed under it (they fall
 * through to isLegacyCategory below and lose their place in the ribbon) unless
 * a data migration moves them at the same time.
 */
export const CATEGORY_GROUPS = [
  {
    group: "Consumer Electronics",
    label: "Tech",
    items: [
      "Smartphones",
      "Laptops & Computers",
      "Monitors",
      "Computer Accessories",
      "Gaming Consoles",
      "Smart Home Gadgets",
      "Audio Equipment",
    ],
  },
  {
    group: "Apparel, Shoes & Accessories",
    label: "Fashion",
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
    label: "Beauty & Health",
    items: ["Cosmetics", "Skincare", "Hair Care", "Vitamins & Supplements", "Pharmacy"],
  },
  {
    group: "Food, Beverage & Grocery",
    label: "Grocery",
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
    label: "Home & Garden",
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
    label: "Media",
    items: ["Books", "Movies & TV", "Music", "Video Games"],
  },
  {
    group: "Toys, Baby & Kids",
    label: "Kids & Baby",
    items: ["Strollers & Car Seats", "Diapers & Baby Care", "Educational Toys", "Board Games"],
  },
] as const;

/** Every selectable leaf category, flattened. */
export const CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((g) => g.items);

/** The short chip name for a group, e.g. "Consumer Electronics" -> "Tech". */
export const groupLabel = (group: string): string =>
  CATEGORY_GROUPS.find((g) => g.group === group)?.label ?? group;

/** The leaves under one group, or [] for a name that isn't a group. */
export const groupItems = (group: string): readonly string[] =>
  CATEGORY_GROUPS.find((g) => g.group === group)?.items ?? [];

/**
 * Which group a leaf belongs to, or null for a legacy/seller-invented category.
 * Null is a real answer, not a failure: sellers typed their own categories
 * before this taxonomy existed, and those products still have to be findable.
 * See UNGROUPED.
 */
export const groupForCategory = (category: string): string | null =>
  CATEGORY_GROUPS.find((g) => (g.items as readonly string[]).includes(category))?.group ?? null;

/**
 * The bucket for leaves no group claims.
 *
 * A shopper filtering by group must never make a product unreachable. Any
 * category the taxonomy doesn't know — a legacy "Tops", or whatever a seller
 * types next — collects here instead of quietly vanishing from a ribbon that
 * only knows seven groups. It is only rendered when something is actually in
 * it, so a tidy catalogue never sees the chip.
 */
export const UNGROUPED = "More";

/**
 * Fold the leaf categories a catalogue actually uses into the ribbon's two
 * levels, dropping groups nothing is filed under.
 *
 * Driven by what is IN STOCK rather than by the taxonomy, because a ribbon is a
 * promise: a chip that leads to an empty grid is worse than no chip. The facets
 * RPC returns the leaves in use; everything here is the arrangement of that
 * list, so a group appears the day a seller lists something under it and goes
 * when the last one sells out.
 *
 * Group order follows CATEGORY_GROUPS (a deliberate merchandising order, not
 * alphabetical); leaves keep their order within a group for the same reason.
 * UNGROUPED, if present, sorts last — it is the "everything else" drawer.
 */
export function groupCategories(
  inUse: readonly string[],
): { group: string; label: string; items: string[] }[] {
  const used = new Set(inUse);
  // Annotated, not inferred: CATEGORY_GROUPS is `as const`, so an inferred
  // element type would be the literal union of the seven group names and the
  // UNGROUPED bucket appended below would not be assignable to it.
  const out: { group: string; label: string; items: string[] }[] = CATEGORY_GROUPS.map((g) => ({
    group: g.group,
    label: g.label,
    items: (g.items as readonly string[]).filter((i) => used.has(i)),
  })).filter((g) => g.items.length > 0);

  const orphans = inUse.filter((c) => groupForCategory(c) === null);
  if (orphans.length > 0) {
    out.push({ group: UNGROUPED, label: UNGROUPED, items: [...orphans] });
  }
  return out;
}

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
 * The colours a seller can put on a product, grouped into families.
 *
 * Still a fixed list, for the same reason sizes are: "navy", "Navy Blue" and
 * "dark blue" cannot be filtered together, and the buyer-side colour facet is
 * only useful if two sellers stocking the same colour spell it the same way.
 * What changed is its SIZE — ten colours could not describe a lipstick range, a
 * paint stock or a phone in Desert Titanium, so sellers were rounding real
 * products to the nearest of ten and the filter inherited the error.
 *
 * Thirty-two named colours across eight families is the compromise: wide enough
 * that "the nearest one" is genuinely near, small enough to stay a shared
 * vocabulary. Sellers who think in hex reach for the colour wheel instead
 * (see nearestColorName below), which snaps their pick to one of these.
 *
 * `hex` is presentation only — `name` is what is stored on the product, sent to
 * the seller and matched by the filter, so re-theming a swatch later never
 * orphans existing products. Never RENAME an entry for the same reason: a
 * rename orphans every product already carrying the old name.
 */
export interface ProductColor {
  name: string;
  hex: string;
}

export const COLOR_FAMILIES: readonly { family: string; colors: readonly ProductColor[] }[] = [
  {
    family: "Neutrals",
    colors: [
      { name: "Black", hex: "#111111" },
      { name: "Charcoal", hex: "#3F3F46" },
      { name: "Grey", hex: "#9CA3AF" },
      { name: "Silver", hex: "#D4D4D8" },
      { name: "White", hex: "#FFFFFF" },
      { name: "Cream", hex: "#F5EFE0" },
      { name: "Beige", hex: "#D6C7AE" },
      { name: "Khaki", hex: "#A88F5F" },
    ],
  },
  {
    family: "Blues",
    colors: [
      { name: "Navy", hex: "#1E3A8A" },
      { name: "Blue", hex: "#2563EB" },
      { name: "Sky Blue", hex: "#38BDF8" },
      { name: "Teal", hex: "#0D9488" },
    ],
  },
  {
    family: "Greens",
    colors: [
      { name: "Green", hex: "#16A34A" },
      { name: "Olive", hex: "#65733C" },
      { name: "Mint", hex: "#A7F3D0" },
      { name: "Forest Green", hex: "#14532D" },
    ],
  },
  {
    family: "Reds & Pinks",
    colors: [
      { name: "Red", hex: "#DC2626" },
      { name: "Maroon", hex: "#7F1D1D" },
      { name: "Coral", hex: "#FB7185" },
      { name: "Pink", hex: "#EC4899" },
      { name: "Peach", hex: "#FFC9A3" },
    ],
  },
  {
    family: "Yellows & Oranges",
    colors: [
      { name: "Orange", hex: "#F97316" },
      { name: "Yellow", hex: "#FACC15" },
      { name: "Mustard", hex: "#CA8A04" },
    ],
  },
  {
    family: "Purples",
    colors: [
      { name: "Purple", hex: "#7C3AED" },
      { name: "Lilac", hex: "#C4B5FD" },
      { name: "Burgundy", hex: "#6B1839" },
    ],
  },
  {
    family: "Browns",
    colors: [
      { name: "Brown", hex: "#78350F" },
      { name: "Tan", hex: "#C08552" },
      { name: "Chocolate", hex: "#4A2511" },
    ],
  },
  {
    family: "Metallics",
    colors: [
      { name: "Gold", hex: "#C9A227" },
      { name: "Rose Gold", hex: "#DFA1A0" },
      { name: "Bronze", hex: "#8C6239" },
    ],
  },
];

/** Every selectable colour, flattened. */
export const PRODUCT_COLORS: readonly ProductColor[] = COLOR_FAMILIES.flatMap((f) => [...f.colors]);

const COLOR_HEX = new Map<string, string>(PRODUCT_COLORS.map((c) => [c.name, c.hex]));

/** Swatch colour for a stored colour name; falls back to grey for anything
 * saved before this list existed (or added to it and later removed). */
export const colorHex = (name: string) => COLOR_HEX.get(name) ?? "#D1D5DB";

/** `#RGB` / `#RRGGBB` -> channel triple, or null if it isn't a hex colour. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

/**
 * The named colour closest to an arbitrary hex — what the seller-side colour
 * wheel resolves a free pick to.
 *
 * This is the bridge between "let me choose the actual colour of my product"
 * and "the buyer's colour filter has to be able to group products". The seller
 * picks anything; we store the nearest shared name and show them which one they
 * landed on, so the compromise is visible rather than silent.
 *
 * Distance is redmean, not plain RGB Euclidean: at these palette sizes a naive
 * distance sends mid-tone reds to Brown and pale yellows to White, because it
 * weights the three channels equally when human vision does not. Redmean is a
 * cheap approximation of perceptual distance and is enough to fix that without
 * pulling in a colour-space library.
 */
export function nearestColorName(hex: string): string | null {
  const target = parseHex(hex);
  if (!target) return null;

  let best = PRODUCT_COLORS[0].name;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const { name, hex: swatch } of PRODUCT_COLORS) {
    const candidate = parseHex(swatch);
    if (!candidate) continue;
    const rMean = (target[0] + candidate[0]) / 2;
    const dr = target[0] - candidate[0];
    const dg = target[1] - candidate[1];
    const db = target[2] - candidate[2];
    const distance =
      (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return best;
}

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
