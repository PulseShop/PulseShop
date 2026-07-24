/**
 * export-products — the whole-catalogue CSV export, delivered by email.
 *
 * Why this is a function and not a client-side download: the dashboard only
 * ever holds one page of products, and the catalogue is paged server-side on
 * purpose (see the note on search_products in InventoryPage). A seller with 400
 * products asking for "export" would otherwise mean 400 rows pulled into the
 * browser just to be turned into text and thrown away. Small catalogues still
 * download instantly in the browser; above EXPORT_DOWNLOAD_LIMIT the file is
 * built here and mailed instead, so the size of a shop's catalogue never
 * becomes the size of a page load.
 *
 * The file is only ever built for, and sent to, the CALLER'S OWN account email,
 * read from the verified JWT. There is no recipient parameter, deliberately: an
 * endpoint that mails an arbitrary address is an open relay, and one that mails
 * an arbitrary merchant's catalogue is a data leak. Both are closed by not
 * accepting the input in the first place.
 *
 * Deployment:
 *   supabase secrets set RESEND_API_KEY=re_xxx
 *   supabase secrets set EXPORT_FROM_EMAIL="PulseShop <exports@yourdomain.com>"
 *   supabase functions deploy export-products
 * The sending domain must be verified with the mail provider. With the secrets
 * unset the function stays live and returns `email_not_configured`, which the
 * dashboard shows as a plain "not set up yet" message rather than a crash.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EXPORT_FROM_EMAIL = Deno.env.get("EXPORT_FROM_EMAIL") ?? "";

/** Hard ceiling on one emailed export. Bounds this function's memory and the
 * attachment size; a shop past it needs a paged export, not a bigger email. */
const MAX_EXPORT_PRODUCTS = 5000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * MUST stay identical, in name and order, to PRODUCT_CSV_COLUMNS in
 * frontend/src/lib/productCsv.ts. Import and export share one column contract
 * so an emailed file can be edited and uploaded straight back; drift here
 * breaks that silently, producing a file the importer rejects for a missing
 * column. Duplicated rather than imported because this runs in Deno and that
 * module is part of the Vite app, behind an `@/` alias Deno cannot resolve.
 */
const COLUMNS = [
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

const LIST_SEPARATOR = ";";

interface ProductRow {
  sku: string;
  name: string;
  category: string;
  price_kes: number;
  discount_pct: number | null;
  stock_qty: number;
  sizes: string[] | null;
  colors: string[] | null;
  summary: string | null;
  description: string | null;
  images: string[] | null;
}

const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;
const encodeField = (v: string) => (NEEDS_QUOTING.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Byte-order mark so Excel reads the file as UTF-8; CRLF per RFC 4180. Mirrors
 * encodeCsv() in frontend/src/lib/csv.ts. */
function encodeCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(encodeField).join(",")).join("\r\n") + "\r\n";
}

function toCsv(products: ProductRow[]): string {
  return encodeCsv([
    [...COLUMNS],
    ...products.map((p) => [
      p.sku ?? "",
      p.name ?? "",
      p.category ?? "",
      String(p.price_kes ?? 0),
      p.discount_pct == null ? "" : String(p.discount_pct),
      String(p.stock_qty ?? 0),
      (p.sizes ?? []).join(LIST_SEPARATOR),
      (p.colors ?? []).join(LIST_SEPARATOR),
      p.summary ?? "",
      p.description ?? "",
      (p.images ?? []).join(LIST_SEPARATOR),
    ]),
  ]);
}

/** Chunked so a large catalogue does not blow the argument limit on spread. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!RESEND_API_KEY || !EXPORT_FROM_EMAIL) {
    return json({ error: "email_not_configured" }, 501);
  }

  // A verified session is required, and the anon key has to be excluded by
  // hand: supabase-js sends it as the bearer when nobody is signed in, and it
  // is itself a valid project JWT, so without this check every signed-out
  // caller would look like a user to getUser().
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt || jwt === ANON_KEY) return json({ error: "not signed in" }, 401);

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData } = await anon.auth.getUser(jwt);
  const user = userData.user;
  if (!user?.email) return json({ error: "not signed in" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Scoped to the caller's own id. This client holds the service-role key and
  // so bypasses RLS entirely, which makes this filter the ONLY thing standing
  // between one seller and every other seller's catalogue. It is not a
  // convenience; do not remove it in favour of an RLS assumption.
  const { data, error, count } = await admin
    .from("products")
    .select(
      "sku, name, category, price_kes, discount_pct, stock_qty, sizes, colors, summary, description, images",
      { count: "exact" },
    )
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_PRODUCTS);

  if (error) return json({ error: error.message }, 500);

  const products = (data ?? []) as ProductRow[];
  if (products.length === 0) return json({ error: "no_products" }, 400);
  if ((count ?? products.length) > MAX_EXPORT_PRODUCTS) {
    return json({ error: "too_many_products" }, 413);
  }

  const day = new Date().toISOString().slice(0, 10);
  const filename = `pulseshop-products-${day}.csv`;
  const csv = toCsv(products);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EXPORT_FROM_EMAIL,
      to: [user.email],
      subject: `Your product export (${products.length} products)`,
      html: `
        <p>Your catalogue export is attached as <strong>${escapeHtml(filename)}</strong>.</p>
        <p>It holds <strong>${products.length}</strong> products. Open it in Excel or
        Google Sheets, edit what you need, then upload the same file back through
        Inventory &rarr; Import to apply your changes.</p>
        <p style="color:#78716c;font-size:13px">Rows are matched on SKU: an existing
        SKU updates that product, a new one creates it.</p>
      `,
      attachments: [{ filename, content: toBase64(csv) }],
    }),
  });

  if (!res.ok) {
    // The provider's own message (unverified domain, bad key) is the useful
    // half here, but it is operator detail, not seller detail: log it and hand
    // the caller a stable code.
    console.error("resend failed", res.status, await res.text());
    return json({ error: "email_send_failed" }, 502);
  }

  return json({ email: user.email, count: products.length });
});
