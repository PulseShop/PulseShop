/**
 * Brands: the shared vocabulary, and which of them belong to which shelf.
 *
 * A sibling module to lib/constants.ts rather than more of it. Constants is
 * already the taxonomy, the sizes and thirty-two colours; brands are a fourth
 * vocabulary with their own normalisation rules, and bolting them on would make
 * the one file everything imports twice the size it needs to be. The taxonomy
 * is imported FROM there, so the two cannot disagree about what a leaf is
 * called.
 *
 * THE SAME PROBLEM SIZES AND COLOURS HAVE. "hp", "HP" and " Hp " are one brand
 * typed three ways, and a filter that treats them as three is worse than no
 * filter: the shopper picks one, sees a third of the stock, and concludes the
 * marketplace does not have what they want. Sizes and colours solved this by
 * being closed lists. Brand cannot be one; sellers here stock things no
 * taxonomy knows about, and a closed dropdown means a seller with a brand we
 * have not heard of either picks the wrong one or leaves it blank. So the list
 * below is a SUGGESTION, normalizeBrand() is the aggregation, and anything a
 * seller types is accepted after being put through it.
 *
 * WHERE THIS IS READ. The seller's product form suggests BRAND_CATEGORIES for
 * the category they picked; the buyer's filter ribbon and the "Shop by brands"
 * wall read the brands actually in stock (from shop_facets) and order them
 * against the same table. One source, both sides.
 */
import { CATEGORIES } from "./constants";

/**
 * Mirrors the products_brand_len CHECK in migration 0060. Duplicated here for
 * the same reason productCsv duplicates the other field limits: failing in the
 * form with a sentence beats a constraint violation from Postgres.
 */
export const MAX_BRAND = 40;

/**
 * One shelf's featured brands, and what the shelf is understood to hold.
 *
 * `subCategories` is the merchandising note that came with the brand list: the
 * kinds of product the shelf is meant to collect. It is not a third level of
 * the taxonomy and nothing is filed under it; `products.category` still stores
 * the leaf. It is shown to the seller under the category picker, which is the
 * one place someone is actively deciding where a product belongs, and is the
 * cheapest way to stop "Ultrabooks" being typed in as a category of its own.
 */
export interface BrandShelf {
  brands: readonly string[];
  subCategories: readonly string[];
}

/**
 * Featured brands per LEAF category.
 *
 * MAPPED ONTO THE TAXONOMY THAT EXISTS, not beside it. The source table was
 * written in its own vocabulary ("Smartphones & Tablets", "Audio & Headphones",
 * "PC Components & Peripherals") and most of its rows are the leaves in
 * lib/constants.ts under a different name. Renaming a leaf to match would
 * orphan every product already filed under the old string, which is the exact
 * breaking change CATEGORY_GROUPS warns about, so each row is keyed to the leaf
 * it plainly means instead:
 *
 *   Smartphones & Tablets      -> Smartphones
 *   Audio & Headphones         -> Audio Equipment
 *   Smart Home & Networking    -> Smart Home Gadgets
 *   Gaming & Consoles          -> Gaming Consoles
 *   PC Components & Peripherals-> Computer Accessories AND Monitors
 *
 * That last one is one row over two leaves: the taxonomy has split monitors out
 * of accessories since before this table existed, and both are stocked by the
 * same names, so both carry the row's brands and the row's sub-categories are
 * split between them.
 *
 * Three rows had no leaf to map onto and were ADDED to Consumer Electronics
 * (adding is safe; see CATEGORY_GROUPS): TVs & Home Entertainment,
 * Smartwatches & Wearables, Cameras & Drones.
 *
 * THE PARENTHETICALS IN THE SOURCE TABLE ARE NOT PART OF THE NAME. It listed
 * "Sony (PlayStation)", "Microsoft (Xbox)", "Google (Nest)", "Amazon (Echo)"
 * and "Logitech G": product lines, written to say which arm of the company the
 * shelf means. Storing them verbatim would put "Sony" and "Sony (PlayStation)"
 * in the filter as two brands, and a shopper who picked either would be shown
 * half of Sony's stock. The stored brand is the company; the line lives in the
 * product's own name, where it belongs. See BRAND_ALIASES, which folds the
 * line names back onto the company for a seller who types one.
 */
export const BRAND_CATEGORIES: Readonly<Record<string, BrandShelf>> = {
  "Laptops & Computers": {
    brands: ["HP", "Lenovo", "Apple", "Dell", "ASUS", "Acer", "Microsoft"],
    subCategories: ["Ultrabooks", "Gaming Laptops", "Desktops", "Workstations"],
  },
  Smartphones: {
    brands: ["Samsung", "Apple", "Tecno", "Infinix", "Xiaomi", "Oppo"],
    subCategories: ["Premium Phones", "Budget Smartphones", "Tablets", "E-Readers"],
  },
  "Audio Equipment": {
    brands: ["Sony", "JBL", "Oraimo", "Bose", "Beats", "Sennheiser", "Soundcore"],
    subCategories: ["Wireless Earbuds", "Bluetooth Speakers", "Over-Ear Headphones"],
  },
  "TVs & Home Entertainment": {
    brands: ["Samsung", "LG", "Hisense", "TCL", "Sony"],
    subCategories: ["Smart TVs", "4K/8K Displays", "Soundbars", "Projectors"],
  },
  "Smartwatches & Wearables": {
    brands: ["Apple", "Samsung", "Oraimo", "Garmin", "Fitbit", "Amazfit"],
    subCategories: ["Smartwatches", "Fitness Trackers", "Smart Bands"],
  },
  "Computer Accessories": {
    brands: ["Logitech", "NVIDIA", "AMD", "Intel", "Western Digital", "SanDisk"],
    subCategories: ["Keyboards", "Mice", "Storage (SSDs/HDDs)"],
  },
  Monitors: {
    // The other half of the PC Components row. No sub-category hint: the row's
    // fourth entry IS this leaf, and "Monitors includes: Monitors" is noise.
    brands: ["Logitech", "NVIDIA", "AMD", "Intel", "Western Digital", "SanDisk"],
    subCategories: [],
  },
  "Smart Home Gadgets": {
    brands: ["TP-Link", "Huawei", "Google", "Amazon", "Ubiquiti"],
    subCategories: ["Routers", "Mesh Wi-Fi", "Security Cameras", "Smart Plugs"],
  },
  "Gaming Consoles": {
    brands: ["Sony", "Microsoft", "Nintendo", "Logitech"],
    subCategories: ["Consoles", "Controllers", "Gaming Headsets", "Handhelds"],
  },
  "Cameras & Drones": {
    brands: ["Canon", "Sony", "Nikon", "DJI", "GoPro"],
    subCategories: ["Mirrorless Cameras", "Drones", "Action Cameras"],
  },
};

/**
 * Every featured brand, deduplicated, in the order the shelves declare them.
 *
 * The order is merchandising, not alphabetical, for the same reason
 * CATEGORY_GROUPS is: Samsung and Apple lead the phone shelf because that is
 * the order a shopper expects to read them in. Used as the canonical spelling
 * table by normalizeBrand and as the ranking for the buyer-facing lists.
 */
export const FEATURED_BRANDS: readonly string[] = [
  ...new Set(Object.values(BRAND_CATEGORIES).flatMap((shelf) => [...shelf.brands])),
];

/**
 * Reduces a brand to the part that carries meaning, so two spellings collide.
 *
 * Same shape as fold() in lib/productCsv.ts and for the same reason: "TP-Link",
 * "tp link" and "TPLink" are one brand, and punctuation is not a difference a
 * seller should have to get right. No trailing-plural strip here, though: a
 * brand is a proper noun and "Beats" is not the plural of "Beat".
 */
const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Spellings that mean an existing brand, folded.
 *
 * Mostly the product lines the source table named in parentheses: a seller
 * listing a console types "PlayStation", not "Sony", and both have to land on
 * the same filter value or the shelf splits in two. The rest are the everyday
 * shorthands ("WD") that would otherwise mint a brand of their own.
 */
const BRAND_ALIASES: Record<string, string> = {
  playstation: "Sony",
  ps5: "Sony",
  xbox: "Microsoft",
  nest: "Google",
  googlenest: "Google",
  echo: "Amazon",
  amazonecho: "Amazon",
  logitechg: "Logitech",
  wd: "Western Digital",
  westerndigitals: "Western Digital",
  hewlettpackard: "HP",
  tplink: "TP-Link",
};

const CANONICAL_BRANDS = new Map<string, string>([
  ...FEATURED_BRANDS.map((b) => [fold(b), b] as const),
  ...Object.entries(BRAND_ALIASES).map(([k, v]) => [k, v] as const),
]);

/**
 * One word of a brand, re-cased.
 *
 * Three letters or fewer become upper case, longer words become Title Case.
 * That is a heuristic, and it is there because short brand names are almost
 * always initialisms (HP, LG, JBL, DJI, AMD, MSI, AOC), and title-casing them
 * produces "Msi", which no seller recognises as their own stock. Four letters
 * is where the rule would start doing more harm than good ("OPPO", "ACER"), and
 * the names that long which really are initialisms (ASUS, NVIDIA) are in the
 * featured list and never reach this function.
 */
const recaseWord = (word: string) =>
  word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase();

/**
 * A brand as it should be STORED, or null for "no brand".
 *
 * The whole point is that two sellers stocking the same thing write the same
 * string, because the buyer's filter groups on exact equality. Three passes:
 *
 *  1. Whitespace. Trimmed, and internal runs collapsed, so " Hp  Pavilion "
 *     and "Hp Pavilion" are one value.
 *  2. The known vocabulary. Folded and looked up, so "hp", "HP" and "H.P."
 *     all come back as "HP", the spelling the featured list declares.
 *  3. A known brand followed by a model. Sellers type the box, not the field
 *     label: "HP Pavilion 15", "PlayStation 5", "GoPro Hero". Pass 2 only
 *     matches the WHOLE string, so every one of those would mint a brand of
 *     its own and sit in the filter next to the bare "HP" holding half its
 *     stock, which is the split this function exists to prevent. The leading
 *     one or two words are looked up instead, longest first so the two-word
 *     names ("Western Digital Blue") resolve before their first word is tried
 *     alone. The model is not lost; it belongs in the product name, which is
 *     where a shopper reads it.
 *  4. Anything else, re-cased ONLY if the seller typed it in a single case
 *     throughout. "MSI" and "msi" both become "MSI" and therefore aggregate;
 *     "iRobot" already carries a shape its owner chose, and rewriting it would
 *     be us being wrong in a way the seller can see.
 *
 * Called on every write path (the product form, the CSV importer and both
 * adapters), so a brand cannot enter the catalogue un-normalised whichever door
 * it came through.
 */
export function normalizeBrand(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_BRAND).trim();
  if (!value) return null;

  const known = CANONICAL_BRANDS.get(fold(value));
  if (known) return known;

  // Longest prefix first: "Western Digital Blue" has to find "Western Digital"
  // before it finds "Western", which is not a brand at all.
  const words = value.split(" ");
  for (const take of [2, 1]) {
    if (words.length <= take) continue;
    const prefixed = CANONICAL_BRANDS.get(fold(words.slice(0, take).join(" ")));
    if (prefixed) return prefixed;
  }

  // Mixed case is authorship, not sloppiness; leave it exactly as typed.
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) return value;

  return value.split(" ").map(recaseWord).join(" ");
}

/**
 * The brands to offer a seller filing a product under `category`.
 *
 * Empty for a category with no shelf, which is most of the taxonomy: brand is
 * an electronics idea, and a suggestion list of phone makers under "Fresh
 * Produce" would be worse than none. The field itself is still shown, since a
 * furniture seller may well have a brand; it simply has nothing to suggest.
 */
export const suggestedBrands = (category: string): readonly string[] =>
  BRAND_CATEGORIES[category]?.brands ?? [];

/** The merchandising note for a category, or [] where there isn't one. */
export const categorySubCategories = (category: string): readonly string[] =>
  BRAND_CATEGORIES[category]?.subCategories ?? [];

/**
 * Orders the brands a catalogue actually stocks for display.
 *
 * Featured brands first, in the order the shelves declare them, then everything
 * a seller brought with them, alphabetically. Same argument groupCategories()
 * makes about the category ribbon: a list driven purely by the data reshuffles
 * itself as stock moves, and one driven purely by the table advertises brands
 * nobody sells. This is the two of them in the only order that is stable AND
 * honest: the names we chose to lead with lead, and nothing here is a brand
 * the shopper cannot actually buy.
 */
export function orderBrands(inUse: readonly string[]): string[] {
  const stocked = new Set(inUse.filter((b) => b.trim()));
  const featured = FEATURED_BRANDS.filter((b) => stocked.has(b));
  const rest = [...stocked].filter((b) => !featured.includes(b)).sort((a, b) => a.localeCompare(b));
  return [...featured, ...rest];
}

/**
 * Every leaf that BRAND_CATEGORIES claims but the taxonomy does not have.
 *
 * Development-time guard, not runtime behaviour. The two lists are maintained
 * by hand in two files, and a typo in a key here fails silently: the seller
 * simply never sees a suggestion, which is exactly the kind of bug that
 * survives a release. Anything in here is a bug in one of the two files.
 */
export const unmappedBrandCategories = (): string[] =>
  Object.keys(BRAND_CATEGORIES).filter((c) => !CATEGORIES.includes(c));
