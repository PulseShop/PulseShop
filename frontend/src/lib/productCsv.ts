import {
  APPAREL_SIZES,
  CATEGORIES,
  FOOTWEAR_SIZES,
  PRODUCT_COLORS,
  sizeOptionsFor,
} from "./constants";
import { encodeCsv, parseCsv } from "./csv";
import type { Product } from "@/types";

/**
 * The CSV contract for bulk product import/export.
 *
 * Export and import use the SAME columns in the SAME order, which is the whole
 * point: a seller exports, edits prices or stock in a spreadsheet, and imports
 * the file straight back. Anything that breaks that round trip is a bug.
 *
 * `sku` is the identity column. A row whose SKU the shop already has updates
 * that product; a new SKU creates one. That reuses the `unique (merchant_id,
 * sku)` constraint the products table has carried since 0001, so "which
 * product is this row?" is answered by the database, not by guessing on name.
 */
export const PRODUCT_CSV_COLUMNS = [
  "sku",
  "name",
  "category",
  "price_kes",
  "discount_pct",
  "stock_qty",
  "sizes",
  "colors",
  "summary",
  "description",
  "images",
] as const;

/**
 * The columns a file MUST carry, and the reason the list is exactly these four.
 *
 * They are the NOT NULL columns on `products` that have no database default:
 * name, sku, category and price_kes (migration 0001). Nothing else is required,
 * because everything else the database can invent for itself — stock_qty
 * defaults to 0, images to an empty array, description to an empty string — and
 * a column the file does not carry is left alone on a product that already
 * exists. The rule is "the CSV must supply what the database cannot".
 *
 * This used to be all eleven columns, which meant a seller with a list of names
 * and prices could not import it, and anyone whose photos were not yet online
 * could not import at all. Those are the two most common shapes a real
 * catalogue arrives in.
 */
export const REQUIRED_CSV_COLUMNS = ["sku", "name", "category", "price_kes"] as const;

/**
 * Header spellings accepted for each column.
 *
 * Sellers arrive with files exported from another platform, or typed by hand,
 * and "Price", "Qty" and "Photos" are what those files call things. Matching
 * only our own canonical names rejected the file outright with "missing
 * column: price_kes" while a perfectly good Price column sat in front of us.
 *
 * Normalised through normalizeHeader before lookup, so case, surrounding space
 * and space-versus-underscore are already handled and do not need listing here.
 */
const HEADER_ALIASES: Record<string, CsvColumn> = {
  product_sku: "sku",
  item_sku: "sku",
  code: "sku",
  item_code: "sku",
  product_code: "sku",
  product_name: "name",
  title: "name",
  item_name: "name",
  product: "name",
  product_category: "category",
  type: "category",
  price: "price_kes",
  price_ksh: "price_kes",
  unit_price: "price_kes",
  selling_price: "price_kes",
  amount: "price_kes",
  cost: "price_kes",
  discount: "discount_pct",
  discount_percent: "discount_pct",
  discount_percentage: "discount_pct",
  qty: "stock_qty",
  quantity: "stock_qty",
  stock: "stock_qty",
  in_stock: "stock_qty",
  available: "stock_qty",
  size: "sizes",
  available_sizes: "sizes",
  color: "colors",
  colour: "colors",
  colours: "colors",
  available_colors: "colors",
  short_description: "summary",
  subtitle: "summary",
  tagline: "summary",
  desc: "description",
  details: "description",
  long_description: "description",
  full_description: "description",
  image: "images",
  image_url: "images",
  image_urls: "images",
  photo: "images",
  photos: "images",
  picture: "images",
  pictures: "images",
};

/**
 * Separator for the columns holding a list (sizes, colors, images).
 *
 * A semicolon rather than a comma because a comma inside a cell forces the
 * whole field to be quoted, and the first thing a seller does is open the file
 * in Excel and retype something without the quotes. A semicolon survives that.
 *
 * This is what EXPORT writes. Import is deliberately more permissive than this
 * one character: see splitOptions and splitImages.
 */
export const LIST_SEPARATOR = ";";

/**
 * How many rows one import may carry. Not a database limit: it bounds the
 * single upsert this turns into, and it keeps a mis-saved 50,000-row sheet from
 * becoming one enormous request that fails halfway with no useful message.
 */
export const MAX_IMPORT_ROWS = 200;

/**
 * Above this many products, "export" stops being a download and becomes an
 * email (see services.products.emailProductExport). The catalogue is read
 * server-side in that case, so the browser never pulls the whole thing down
 * just to turn it into text.
 */
export const EXPORT_DOWNLOAD_LIMIT = 20;

/**
 * Exactly the fields a CSV row carries: deliberately NOT ProductInput.
 *
 * The columns absent here (slug, metaDescription, colorImages, sizePriceAdj,
 * colorPriceAdj) are ones the CSV has no sensible flat representation for, and
 * leaving them out of the write payload is what makes them SURVIVE an import.
 * Were this typed as ProductInput, every round trip would quietly reset a
 * seller's per-variant pricing and SEO text to empty.
 */
export interface ProductCsvInput {
  sku: string;
  name: string;
  category: string;
  priceKes: number;
  /**
   * UNDEFINED AND NULL MEAN DIFFERENT THINGS on every field below, and the
   * distinction is the whole reason a partial import is safe.
   *
   * `undefined` is "the file had no such column", and the writer omits the
   * column entirely: an existing product keeps whatever it already had, and a
   * new one takes the database default. `null` (or an empty array) is "the
   * column was there and the cell was blank", which is an explicit clear and is
   * written as one.
   *
   * Without that split, importing a two-column sheet of SKUs and prices would
   * blank every photo, size and description in the shop, and a seller who
   * exported, edited one price and re-imported would be fine only because their
   * file happened to carry all eleven columns.
   */
  discountPct?: number | null;
  stockQty?: number;
  sizes?: string[] | null;
  colors?: string[] | null;
  summary?: string | null;
  description?: string;
  images?: string[];
}

/** Which optional columns a file actually carried. The writer needs this to
 * build an upsert whose column list matches the file rather than the schema. */
export type CsvColumnPresence = Record<CsvColumn, boolean>;

export interface CsvRowError {
  /** 1-based row as the seller sees it in a spreadsheet, header counted. */
  row: number;
  sku: string;
  message: string;
}

export interface ParsedProductCsv {
  rows: ProductCsvInput[];
  /** Rows that could not be imported at all. */
  errors: CsvRowError[];
  /**
   * Rows that WILL import, listing what had to be adjusted to get them in.
   *
   * The distinction between this and `errors` is the point of the whole
   * validation pass. A photo URL that is not a web address, a colour the shop
   * does not stock, a price with a stray decimal: none of those are reasons to
   * refuse a product the seller plainly wants listed. They are reasons to tell
   * the seller what was dropped so they can fix it afterwards, which is a
   * different sentence and a different colour on screen.
   */
  warnings: CsvRowError[];
  /** Set when the file itself is unusable, in which case `rows` is empty. */
  fatal: string | null;
  columns: CsvColumnPresence;
}

// Field limits mirror the CHECK constraints in migrations 0021 and 0026. They
// are duplicated here rather than imported because they live in SQL; the point
// of repeating them is to fail on row 34 with "name is too long" instead of
// sending 200 rows and getting one opaque constraint violation back.
const MAX_NAME = 120;
const MAX_SKU = 40;
const MAX_CATEGORY = 40;
const MAX_SUMMARY = 160;
const MAX_DESCRIPTION = 2000;
const MAX_PRICE = 100_000_000;
const MAX_STOCK = 1_000_000;
const MAX_IMAGES = 8;
const MAX_IMAGES_CHARS = 4000;
const MAX_OPTIONS = 20;
const MAX_OPTION_CHARS = 400;

const COLOR_NAMES = PRODUCT_COLORS.map((c) => c.name);

/** Every size in either preset. The fallback vocabulary for a category the
 * taxonomy does not recognise, which cannot say which preset applies. */
const ALL_SIZES: readonly string[] = [...APPAREL_SIZES, ...FOOTWEAR_SIZES];

export type CsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

const isCsvColumn = (key: string): key is CsvColumn =>
  (PRODUCT_CSV_COLUMNS as readonly string[]).includes(key);

/** Case-insensitive lookup against a fixed vocabulary, returning the canonical
 * spelling. Sellers type "black" and "sm"; the filters only aggregate if what
 * lands in the database is "Black" and "SM". */
function canonical(value: string, options: readonly string[]): string | null {
  const needle = value.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === needle);
  if (exact) return exact;
  // Then the forgiving pass: punctuation, spacing and a trailing plural are not
  // differences a seller should have to get right to match our own vocabulary.
  const folded = fold(value);
  return folded ? (options.find((o) => fold(o) === folded) ?? null) : null;
}

/**
 * Splits a sizes/colours cell.
 *
 * Export writes semicolons, but a seller typing the cell by hand writes
 * "Black, White" or "SM | M | LG", and a file from another platform uses
 * whatever that platform chose. All of them mean the same list, so all of them
 * are accepted: semicolon, comma, pipe, slash and newline. A cell that arrives
 * as one quoted field containing commas is exactly the case this exists for.
 */
const splitOptions = (raw: string): string[] =>
  raw
    // Newlines, but NOT whitespace in general: "Rose Gold" and "Sky Blue" are
    // single colour names, and splitting on the space would invent four
    // colours the shop does not stock out of the two it does.
    .split(/[;,|/\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Splits an images cell. NOT the same rule as splitOptions, deliberately.
 *
 * A comma is legal inside a URL and appears in real ones (Cloudinary
 * transformations are the common case: `/upload/w_400,h_400/`). Splitting
 * photos on commas would quietly cut those in half and produce two broken links
 * out of one working photo, so images split only on the separators that cannot
 * occur inside a URL: semicolon, pipe, and any whitespace or newline.
 */
const splitImages = (raw: string): string[] =>
  raw
    .split(/[;|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const joinList = (values: readonly string[] | null | undefined): string =>
  (values ?? []).join(LIST_SEPARATOR);

/** Header cells vary by whatever produced the file: "Price KES", "price_kes",
 * " SKU ". Normalise before matching so none of that matters. */
const normalizeHeader = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");

/**
 * Reduces a category or option name to the part that carries meaning, so that
 * two spellings of one thing collide.
 *
 * "Men's Clothing", "mens clothing" and "Mens-Clothing" are one category typed
 * three ways. Stripping everything that is not a letter or digit makes them one
 * string, which is what lets a seller's file match the taxonomy without them
 * having to reproduce our punctuation exactly. A trailing plural "s" goes too,
 * so "Watch" finds "Watches".
 */
const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, "");

function productToCsvRow(p: Product): string[] {
  return [
    p.sku,
    p.name,
    p.category,
    String(p.priceKes),
    p.discountPct == null ? "" : String(p.discountPct),
    String(p.stockQty),
    joinList(p.sizes),
    joinList(p.colors),
    p.summary ?? "",
    p.description,
    joinList(p.images),
  ];
}

export function productsToCsv(products: Product[]): string {
  return encodeCsv([[...PRODUCT_CSV_COLUMNS], ...products.map(productToCsvRow)]);
}

/**
 * A starter file for a shop with nothing to export yet.
 *
 * Carries two rows, and the second one is the point. The first shows every
 * column filled in, because the list columns are the part nobody guesses right
 * and an empty header line does not show that `sizes` wants `SM;M;LG`. The
 * second leaves every optional column blank, which is the shape a seller
 * cataloguing from a spreadsheet actually has: names, categories and prices
 * now, photographs once they have been taken. A template that only ever showed
 * the complete row implied the complete row was the requirement.
 */
export function productCsvTemplate(): string {
  return encodeCsv([
    [...PRODUCT_CSV_COLUMNS],
    [
      "SAMPLE-001",
      "Sample product (delete this row)",
      "Men's Clothing",
      "1500",
      "10",
      "25",
      "SM;M;LG",
      "Black;White",
      "Short summary shown on the product card",
      "Full description shown on the product page.",
      "https://example.com/photo-1.jpg;https://example.com/photo-2.jpg",
    ],
    [
      "SAMPLE-002",
      "Details now, photos later (delete this row)",
      "Men's Clothing",
      "2500",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
  ]);
}

/** Filename with the shop handle and date, so a folder of these stays legible. */
export function exportFilename(shopSlug: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${shopSlug || "pulseshop"}-products-${day}.csv`;
}

/**
 * Parses and validates an uploaded file into rows ready to upsert.
 *
 * Validation is per row and additive: one bad row reports every one of its
 * problems and the remaining rows still import. Rejecting the whole file for a
 * single typo in row 60 is the behaviour that makes people stop using an
 * importer.
 */
export function parseProductCsv(text: string): ParsedProductCsv {
  const table = parseCsv(text);
  const noColumns = Object.fromEntries(
    PRODUCT_CSV_COLUMNS.map((c) => [c, false]),
  ) as CsvColumnPresence;
  const bail = (fatal: string): ParsedProductCsv => ({
    rows: [],
    errors: [],
    warnings: [],
    fatal,
    columns: noColumns,
  });

  if (table.length === 0) return bail("That file is empty.");

  /* Header resolution, in two passes.
     Canonical names win outright, and only columns still unclaimed after that
     fall back to the alias table. A file carrying both "price" and "price_kes"
     is a spreadsheet someone added a working column to; the canonical one is
     the one we wrote and the one export round-trips. */
  const headers = table[0].map(normalizeHeader);
  const indexOf = new Map<CsvColumn, number>();
  headers.forEach((key, i) => {
    if (isCsvColumn(key) && !indexOf.has(key)) indexOf.set(key, i);
  });
  headers.forEach((key, i) => {
    const col = HEADER_ALIASES[key];
    if (col && !indexOf.has(col)) indexOf.set(col, i);
  });

  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !indexOf.has(c));
  if (missing.length > 0) {
    return bail(
      `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. ` +
        "Every row needs a SKU, a name, a category and a price; everything else is optional. " +
        "Download the template to see the expected header row.",
    );
  }

  const columns = Object.fromEntries(
    PRODUCT_CSV_COLUMNS.map((c) => [c, indexOf.has(c)]),
  ) as CsvColumnPresence;

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return bail(`That file has ${body.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`);
  }

  const rows: ProductCsvInput[] = [];
  const errors: CsvRowError[] = [];
  const warnings: CsvRowError[] = [];
  const seenSkus = new Map<string, number>();

  body.forEach((cells, i) => {
    // +2: one for the header, one because spreadsheets count from 1.
    const rowNo = i + 2;
    const cell = (col: CsvColumn) => (cells[indexOf.get(col) ?? -1] ?? "").trim();
    const has = (col: CsvColumn) => indexOf.has(col);

    // A row of nothing but separators is what a spreadsheet leaves under the
    // last real row. It is padding, not a row missing its SKU.
    if (cells.every((c) => c.trim() === "")) return;

    /** Fatal for this row: it will not be imported. */
    const problems: string[] = [];
    /** Adjusted, but the row still imports. */
    const notes: string[] = [];

    // --- identity -----------------------------------------------------------
    const sku = cell("sku");
    if (!sku) problems.push("sku is required");
    else if (sku.length > MAX_SKU) problems.push(`sku is over ${MAX_SKU} characters`);
    else if (seenSkus.has(sku)) {
      problems.push(`duplicate sku, already used on row ${seenSkus.get(sku)}`);
    } else seenSkus.set(sku, rowNo);

    let name = cell("name");
    if (!name) problems.push("name is required");
    else if (name.length > MAX_NAME) {
      name = name.slice(0, MAX_NAME);
      notes.push(`name was longer than ${MAX_NAME} characters and was shortened`);
    }

    // --- category ------------------------------------------------------------
    const rawCategory = cell("category");
    let category = "";
    if (!rawCategory) problems.push("category is required");
    else if (rawCategory.length > MAX_CATEGORY) {
      problems.push(`category is over ${MAX_CATEGORY} characters`);
    } else {
      const match = canonical(rawCategory, CATEGORIES);
      if (match) {
        category = match;
      } else {
        /* Taken as typed rather than refused.
           This was a hard error, on the reasoning that a free-typed "Shoes"
           beside "Footwear" splits a shop's own catalogue in two. That
           reasoning is sound, and it is why canonical() now tries a folded
           match first so spelling, punctuation and plurals no longer decide it.
           What the hard error ALSO did was refuse an entire catalogue because
           the seller's taxonomy is not ours, which describes every seller
           migrating in. The column is free text in the database, legacy names
           already exist (see isLegacyCategory), and the marketplace collects
           unrecognised ones under "More to explore" rather than hiding them. So
           it imports, and the warning says the filters will read better once it
           is reclassified. */
        category = rawCategory;
        notes.push(
          `"${rawCategory}" is not one of the categories in the product form, so it was imported as typed`,
        );
      }
    }

    // --- price ---------------------------------------------------------------
    const price = parseAmount(cell("price_kes"));
    if (price === null) problems.push("price_kes must be a number");
    else if (price.value < 0 || price.value > MAX_PRICE) {
      problems.push(`price_kes must be between 0 and ${MAX_PRICE}`);
    } else if (price.rounded) {
      notes.push(`price was rounded to the nearest shilling (${price.value})`);
    }

    // --- optional numbers ----------------------------------------------------
    let discountPct: number | null | undefined;
    if (has("discount_pct")) {
      const raw = cell("discount_pct");
      if (!raw) discountPct = null;
      else {
        const n = parseAmount(raw);
        if (n === null) {
          notes.push(`discount "${truncate(raw, 20)}" is not a number and was ignored`);
          discountPct = null;
        } else {
          let v = n.value;
          if (v < 0 || v > 100) {
            v = Math.min(100, Math.max(0, v));
            notes.push(`discount was outside 0-100 and was set to ${v}`);
          }
          discountPct = v === 0 ? null : v;
        }
      }
    }

    let stockQty: number | undefined;
    if (has("stock_qty")) {
      const raw = cell("stock_qty");
      // Blank is "not stated", not "zero". Clearing a cell should never be the
      // way a seller accidentally takes a product out of stock.
      if (raw) {
        const n = parseAmount(raw);
        if (n === null) {
          notes.push(`stock "${truncate(raw, 20)}" is not a number and was left unchanged`);
        } else {
          let v = n.value;
          if (v < 0 || v > MAX_STOCK) {
            v = Math.min(MAX_STOCK, Math.max(0, v));
            notes.push(`stock was outside 0-${MAX_STOCK} and was set to ${v}`);
          }
          stockQty = v;
        }
      }
    }

    // --- sizes / colours: fixed vocabularies, forgiving about spelling --------
    let sizes: string[] | null | undefined;
    if (has("sizes")) {
      const raw = splitOptions(cell("sizes"));
      const picked: string[] = [];
      if (raw.length > 0) {
        /* Which vocabulary applies depends on the category, and an unrecognised
           category has no answer. Falling back to every size we know beats
           dropping the column: a legacy category like "Tops" plainly takes
           apparel sizes even though sizeOptionsFor cannot say so. */
        const known = CATEGORIES.includes(category);
        const allowed = known ? sizeOptionsFor(category) : ALL_SIZES;
        if (allowed.length === 0) {
          notes.push(`${category} does not take sizes, so the sizes column was ignored`);
        } else {
          for (const s of raw) {
            const match = canonical(s, allowed);
            if (!match) notes.push(`size "${truncate(s, 20)}" is not one we stock and was skipped`);
            else if (!picked.includes(match)) picked.push(match);
          }
        }
      }
      sizes = trimOptions(picked, "sizes", notes);
    }

    let colors: string[] | null | undefined;
    if (has("colors")) {
      const picked: string[] = [];
      for (const c of splitOptions(cell("colors"))) {
        const match = canonical(c, COLOR_NAMES);
        if (!match) notes.push(`colour "${truncate(c, 20)}" is not one we stock and was skipped`);
        else if (!picked.includes(match)) picked.push(match);
      }
      colors = trimOptions(picked, "colours", notes);
    }

    // --- text ----------------------------------------------------------------
    let summary: string | null | undefined;
    if (has("summary")) {
      let value = cell("summary");
      if (value.length > MAX_SUMMARY) {
        value = value.slice(0, MAX_SUMMARY);
        notes.push(`summary was longer than ${MAX_SUMMARY} characters and was shortened`);
      }
      summary = value || null;
    }

    let description: string | undefined;
    if (has("description")) {
      let value = cell("description");
      if (value.length > MAX_DESCRIPTION) {
        value = value.slice(0, MAX_DESCRIPTION);
        notes.push(`description was longer than ${MAX_DESCRIPTION} characters and was shortened`);
      }
      description = value;
    }

    // --- images --------------------------------------------------------------
    /* NEVER fatal to a row.
       A product without photographs is an ordinary and useful thing to import:
       the seller has the details in a spreadsheet and the pictures still on
       their phone, and making them finish the second job before they may start
       the first is what kept catalogues out altogether. Anything unusable is
       dropped with a note, and the product arrives ready for photos to be added
       from its product page.

       The http(s) rule itself is not ours to relax. products_images_url in
       migration 0021 rejects anything else outright, so a value that cannot be
       coerced into a web address would fail the entire import at the database
       rather than just that one picture. What changed is that failing to be a
       URL now costs the picture instead of the product. */
    let images: string[] | undefined;
    if (has("images")) {
      const picked: string[] = [];
      for (const raw of splitImages(cell("images"))) {
        const url = coerceImageUrl(raw);
        if (!url) {
          notes.push(
            `"${truncate(raw, 40)}" is not a web address, so it was left off; add that photo from the product page`,
          );
        } else if (!picked.includes(url)) picked.push(url);
      }
      if (picked.length > MAX_IMAGES) {
        picked.length = MAX_IMAGES;
        notes.push(`more than ${MAX_IMAGES} images, so only the first ${MAX_IMAGES} were kept`);
      }
      while (picked.length > 0 && picked.join("").length > MAX_IMAGES_CHARS) {
        picked.pop();
        notes.push("the images list was too long, so the last address was dropped");
      }
      images = picked;
    }

    if (problems.length > 0) {
      errors.push({ row: rowNo, sku, message: problems.join("; ") });
      return;
    }
    if (notes.length > 0) warnings.push({ row: rowNo, sku, message: notes.join("; ") });

    rows.push({
      sku,
      name,
      category,
      priceKes: (price as { value: number }).value,
      // Spread-if-defined, so a column the file never had stays absent from the
      // object and the writer can tell "leave this alone" from "set it empty".
      ...(discountPct !== undefined ? { discountPct } : {}),
      ...(stockQty !== undefined ? { stockQty } : {}),
      ...(sizes !== undefined ? { sizes } : {}),
      ...(colors !== undefined ? { colors } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(images !== undefined ? { images } : {}),
    });
  });

  return { rows, errors, warnings, fatal: null, columns };
}

/**
 * Caps an option list at MAX_OPTIONS and MAX_OPTION_CHARS, noting what went.
 * Empty comes back as null, which is an explicit clear: the column was present
 * and the seller left the cell blank.
 */
function trimOptions(picked: string[], label: string, notes: string[]): string[] | null {
  if (picked.length > MAX_OPTIONS) {
    picked.length = MAX_OPTIONS;
    notes.push(`more than ${MAX_OPTIONS} ${label}, so only the first ${MAX_OPTIONS} were kept`);
  }
  while (picked.length > 0 && picked.join("").length > MAX_OPTION_CHARS) {
    picked.pop();
    notes.push(`the ${label} list was too long, so the last entry was dropped`);
  }
  return picked.length > 0 ? picked : null;
}

/**
 * An image cell value as a URL the database will accept, or null.
 *
 * The forgiving part is the scheme, and only the scheme. Sellers paste
 * "www.shop.co.ke/a.jpg" and "//cdn.shop.co.ke/a.jpg" constantly, and both name
 * a real picture that is one prefix away from working, so both get https.
 *
 * A bare filename or a Windows path ("a.jpg", "C:\Photos\a.jpg") names a file
 * on the seller's own machine that this importer cannot read and no amount of
 * prefixing will reach, so it is not rescued. It is reported, and the product
 * imports without it.
 */
function coerceImageUrl(raw: string): string | null {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  /* A hostname and then a PATH: "shop.co.ke/a.jpg", "s.io:8443/a.jpg".
     The trailing slash is required, and it is what separates a domain from a
     filename. Without it "photo1.jpg" parses as a host named photo1 in the
     .jpg domain and is rescued into "https://photo1.jpg", turning a file the
     seller still has on their phone into a dead link that looks deliberate. A
     bare domain with no path is not an image address either, so requiring the
     path costs nothing real. */
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\//i.test(value)) return `https://${value}`;
  return null;
}

/**
 * A number out of a spreadsheet cell, with a flag for whether reading it lost
 * anything.
 *
 * Tolerates what a formatted sheet actually contains: thousands separators, a
 * currency prefix ("KES 1,500", "Ksh1500"), the Kenyan "1500/-" suffix, a
 * trailing percent sign in the discount column, and stray spaces.
 *
 * DECIMALS ARE NOW ACCEPTED, which they were not. Prices and stock are integers
 * in the database, and the old rule was that silently rounding 1500.75 is worse
 * than telling the seller, so the row was rejected. That is right about the
 * silence and wrong about the rejection: "1500.00" is what a currency-formatted
 * column produces for a perfectly ordinary price, and refusing it failed whole
 * files over formatting. So the value is rounded and `rounded` says whether the
 * rounding changed anything, which lets the caller warn on 1500.75 and stay
 * quiet on 1500.00. Nothing is silent, and nothing is refused.
 */
function parseAmount(raw: string): { value: number; rounded: boolean } | null {
  const cleaned = raw
    .replace(/[,\s]/g, "")
    .replace(/^(kes|kshs|ksh|sh)/i, "")
    .replace(/%$/, "")
    .replace(/\/-?$/, "");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const value = Math.round(n);
  if (!Number.isSafeInteger(value)) return null;
  return { value, rounded: value !== n };
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
