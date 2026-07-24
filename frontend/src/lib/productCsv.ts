import { CATEGORIES, PRODUCT_COLORS, sizeOptionsFor } from "./constants";
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
 * Separator for the columns holding a list (sizes, colors, images).
 *
 * A semicolon rather than a comma because a comma inside a cell forces the
 * whole field to be quoted, and the first thing a seller does is open the file
 * in Excel and retype something without the quotes. A semicolon survives that.
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
  discountPct: number | null;
  stockQty: number;
  sizes: string[] | null;
  colors: string[] | null;
  summary: string | null;
  description: string;
  images: string[];
}

export interface CsvRowError {
  /** 1-based row as the seller sees it in a spreadsheet, header counted. */
  row: number;
  sku: string;
  message: string;
}

export interface ParsedProductCsv {
  rows: ProductCsvInput[];
  errors: CsvRowError[];
  /** Set when the file itself is unusable, in which case `rows` is empty. */
  fatal: string | null;
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

/** Case-insensitive lookup against a fixed vocabulary, returning the canonical
 * spelling. Sellers type "black" and "sm"; the filters only aggregate if what
 * lands in the database is "Black" and "SM". */
function canonical(value: string, options: readonly string[]): string | null {
  const needle = value.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === needle) ?? null;
}

const splitList = (raw: string): string[] =>
  raw
    .split(LIST_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);

const joinList = (values: readonly string[] | null | undefined): string =>
  (values ?? []).join(LIST_SEPARATOR);

/** Header cells vary by whatever produced the file: "Price KES", "price_kes",
 * " SKU ". Normalise before matching so none of that matters. */
const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

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
 * A starter file for a shop with nothing to export yet. Carries one filled-in
 * row because the list columns are the part nobody guesses right, and an empty
 * header line does not show that `sizes` wants `SM;M;LG`.
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
  if (table.length === 0) {
    return { rows: [], errors: [], fatal: "That file is empty." };
  }

  const header = table[0].map(normalizeHeader);
  const missing = PRODUCT_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [],
      fatal: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template to see the expected header row.`,
    };
  }

  // Read by header name, not position, so a seller who reorders or adds their
  // own extra columns in a spreadsheet still gets a working import.
  const indexOf = new Map(PRODUCT_CSV_COLUMNS.map((c) => [c, header.indexOf(c)]));

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [],
      fatal: `That file has ${body.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`,
    };
  }

  const rows: ProductCsvInput[] = [];
  const errors: CsvRowError[] = [];
  const seenSkus = new Map<string, number>();

  body.forEach((cells, i) => {
    // +2: one for the header, one because spreadsheets count from 1.
    const rowNo = i + 2;
    const cell = (col: (typeof PRODUCT_CSV_COLUMNS)[number]) =>
      (cells[indexOf.get(col) ?? -1] ?? "").trim();

    const problems: string[] = [];
    const sku = cell("sku");

    // --- identity -----------------------------------------------------------
    if (!sku) problems.push("sku is required");
    else if (sku.length > MAX_SKU) problems.push(`sku is over ${MAX_SKU} characters`);
    else if (seenSkus.has(sku)) {
      problems.push(`duplicate sku, already used on row ${seenSkus.get(sku)}`);
    } else seenSkus.set(sku, rowNo);

    const name = cell("name");
    if (!name) problems.push("name is required");
    else if (name.length > MAX_NAME) problems.push(`name is over ${MAX_NAME} characters`);

    // --- category, and the option vocabularies it governs --------------------
    const rawCategory = cell("category");
    let category = "";
    if (!rawCategory) problems.push("category is required");
    else if (rawCategory.length > MAX_CATEGORY) {
      problems.push(`category is over ${MAX_CATEGORY} characters`);
    } else {
      const match = canonical(rawCategory, CATEGORIES);
      // Strict on purpose. Categories drive the storefront's filter and the
      // dashboard's facets, so a free-typed "Shoes" alongside "Footwear"
      // silently splits a shop's own catalogue in two.
      if (!match) problems.push(`"${rawCategory}" is not a category you can pick in the product form`);
      else category = match;
    }

    // --- numbers ------------------------------------------------------------
    const priceKes = parseWholeNumber(cell("price_kes"));
    if (priceKes === null) problems.push("price_kes must be a whole number");
    else if (priceKes < 0 || priceKes > MAX_PRICE) {
      problems.push(`price_kes must be between 0 and ${MAX_PRICE}`);
    }

    const rawDiscount = cell("discount_pct");
    let discountPct: number | null = null;
    if (rawDiscount) {
      const n = parseWholeNumber(rawDiscount);
      if (n === null || n < 0 || n > 100) problems.push("discount_pct must be 0-100, or blank");
      else discountPct = n === 0 ? null : n;
    }

    const stockQty = parseWholeNumber(cell("stock_qty"));
    if (stockQty === null) problems.push("stock_qty must be a whole number");
    else if (stockQty < 0 || stockQty > MAX_STOCK) {
      problems.push(`stock_qty must be between 0 and ${MAX_STOCK}`);
    }

    // --- sizes / colors: fixed vocabularies, not free text -------------------
    // See the note on APPAREL_SIZES in lib/constants: sizes stopped being free
    // text precisely so the buyer-side filter could group them. An importer
    // that accepted anything would undo that one spreadsheet at a time.
    const allowedSizes = sizeOptionsFor(category);
    const rawSizes = splitList(cell("sizes"));
    const sizes: string[] = [];
    if (rawSizes.length > 0) {
      if (allowedSizes.length === 0) {
        problems.push(`${category || "this category"} does not take sizes; leave the column blank`);
      } else {
        for (const s of rawSizes) {
          const match = canonical(s, allowedSizes);
          if (!match) problems.push(`size "${s}" is not one of ${allowedSizes.join(", ")}`);
          else if (!sizes.includes(match)) sizes.push(match);
        }
      }
    }
    if (sizes.length > MAX_OPTIONS) problems.push(`no more than ${MAX_OPTIONS} sizes`);
    if (sizes.join("").length > MAX_OPTION_CHARS) problems.push("sizes list is too long");

    const colors: string[] = [];
    for (const c of splitList(cell("colors"))) {
      const match = canonical(c, COLOR_NAMES);
      if (!match) problems.push(`colour "${c}" is not one of ${COLOR_NAMES.join(", ")}`);
      else if (!colors.includes(match)) colors.push(match);
    }
    if (colors.length > MAX_OPTIONS) problems.push(`no more than ${MAX_OPTIONS} colours`);
    if (colors.join("").length > MAX_OPTION_CHARS) problems.push("colours list is too long");

    // --- text ---------------------------------------------------------------
    const summary = cell("summary");
    if (summary.length > MAX_SUMMARY) problems.push(`summary is over ${MAX_SUMMARY} characters`);

    const description = cell("description");
    if (description.length > MAX_DESCRIPTION) {
      problems.push(`description is over ${MAX_DESCRIPTION} characters`);
    }

    // --- images -------------------------------------------------------------
    // URLs only. Import cannot upload a file, and the database rejects anything
    // that is not http(s), so catching it here gives a row number.
    const images = splitList(cell("images"));
    if (images.length > MAX_IMAGES) problems.push(`no more than ${MAX_IMAGES} images`);
    for (const url of images) {
      if (!/^https?:\/\//i.test(url)) problems.push(`image "${truncate(url, 40)}" must start with http:// or https://`);
    }
    if (images.join("").length > MAX_IMAGES_CHARS) problems.push("images list is too long");

    if (problems.length > 0) {
      errors.push({ row: rowNo, sku, message: problems.join("; ") });
      return;
    }

    rows.push({
      sku,
      name,
      category,
      priceKes: priceKes as number,
      discountPct,
      stockQty: stockQty as number,
      sizes: sizes.length > 0 ? sizes : null,
      colors: colors.length > 0 ? colors : null,
      summary: summary || null,
      description,
      images,
    });
  });

  return { rows, errors, fatal: null };
}

/**
 * Whole number from a spreadsheet cell. Tolerates the thousands separators and
 * currency prefixes a Sheets-formatted price column produces ("KES 1,500"),
 * because rejecting those would fail rows whose value is perfectly clear.
 * Returns null for anything still ambiguous, including decimals: prices and
 * stock are integers in the database, and silently rounding 1500.75 is worse
 * than telling the seller.
 */
function parseWholeNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/^(kes|ksh|sh)/i, "");
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
