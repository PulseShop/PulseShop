import type { StockStatus } from "@/types";

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
