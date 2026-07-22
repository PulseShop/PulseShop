/**
 * XML sitemaps for every public shop and product.
 *
 * Serves three shapes, wired up by the rewrites in vercel.json:
 *   /sitemap.xml              — the index, listing the child sitemaps below
 *   /sitemap-shops-1.xml      — storefront URLs, 1000 per page
 *   /sitemap-products-1.xml   — product URLs, 1000 per page, with image tags
 *
 * A sitemap does not make a page rank, but it is how a brand-new URL on a
 * domain with no inbound links gets discovered at all — which describes every
 * product a seller adds. The `lastmod` dates are what tell a crawler to come
 * back for a price change rather than re-reading everything on a fixed cycle.
 *
 * SECURITY / ABUSE.
 *  - Anon key only, same as api/render.ts. Reads the seo_sitemap_* RPCs, which
 *    return handles, slugs, a first image and a timestamp — no seller contacts,
 *    no prices, no stock levels, no ids.
 *  - Pagination is clamped in SQL (5000 hard ceiling) and again here, so
 *    `?page=99999999` is a cheap 404 rather than a full table scan someone can
 *    issue in a loop.
 *  - Shops with no products are excluded upstream: submitting empty storefronts
 *    earns a "crawled, currently not indexed" verdict that costs the shops
 *    which do have stock.
 */
import { escapeHtml } from "./_seo";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const PAGE_SIZE = 1000;
/** Sitemaps top out at 50,000 URLs; 1,000 keeps each file small and quick. */
const MAX_PAGES = 50;

interface ShopRow {
  handle: string;
  updated_at: string;
  total_count: number;
}
interface ProductRow {
  handle: string;
  slug: string;
  image: string;
  updated_at: string;
  total_count: number;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as T[]) : [];
  } catch {
    return [];
  }
}

const xmlDate = (value: string | null | undefined) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

/**
 * A URL entry.
 *
 * `loc` is assembled from a handle and a slug that both matched
 * `^[a-z0-9-]+$` in the database, so it cannot contain XML metacharacters —
 * but it is escaped anyway. The image URL genuinely can contain `&` (query
 * strings on a CDN link), and an unescaped one is a malformed document that
 * makes a crawler discard the entire file, not just that entry.
 */
function urlEntry(loc: string, lastmod: string, image?: string): string {
  return [
    "  <url>",
    `    <loc>${escapeHtml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    image
      ? `    <image:image><image:loc>${escapeHtml(image)}</image:loc></image:image>`
      : "",
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

const doc = (body: string, withImages = false) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` +
  (withImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : "") +
  `>\n${body}\n</urlset>\n`;

const xml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Long edge cache: a sitemap changing within the hour helps nobody, and
      // this is the one endpoint a bot is most likely to hammer.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  const host = url.host;
  const origin =
    /^([a-z0-9-]+\.)*pulseshop\.space$/i.test(host) || /\.vercel\.app$/i.test(host)
      ? `https://${host}`
      : "https://pulseshop.space";

  const kind = url.searchParams.get("kind");
  const page = Math.min(MAX_PAGES, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const offset = (page - 1) * PAGE_SIZE;

  if (kind === "shops") {
    const rows = await rpc<ShopRow>("seo_sitemap_shops", { p_limit: PAGE_SIZE, p_offset: offset });
    if (!rows.length) return xml(doc(""), 404);
    return xml(doc(rows.map((r) => urlEntry(`${origin}/${r.handle}`, xmlDate(r.updated_at))).join("\n")));
  }

  if (kind === "products") {
    const rows = await rpc<ProductRow>("seo_sitemap_products", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (!rows.length) return xml(doc("", true), 404);
    return xml(
      doc(
        rows
          .map((r) =>
            urlEntry(
              `${origin}/${r.handle}/${r.slug}`,
              xmlDate(r.updated_at),
              /^https?:\/\//i.test(r.image) ? r.image : undefined,
            ),
          )
          .join("\n"),
        true,
      ),
      200,
    );
  }

  if (kind === "static") {
    // The handful of URLs that are neither a shop nor a product.
    const today = new Date().toISOString().slice(0, 10);
    return xml(doc([urlEntry(`${origin}/`, today), urlEntry(`${origin}/shops`, today)].join("\n")));
  }

  // The index. One probe row of each kind gives the total, which is all that is
  // needed to work out how many child sitemaps to advertise.
  const [shopProbe, productProbe] = await Promise.all([
    rpc<ShopRow>("seo_sitemap_shops", { p_limit: 1, p_offset: 0 }),
    rpc<ProductRow>("seo_sitemap_products", { p_limit: 1, p_offset: 0 }),
  ]);

  /**
   * Zero rows means zero child sitemaps — NOT one empty one. Advertising a
   * child that 404s is a reported error in Search Console, and a brand-new or
   * freshly-reset database is exactly the state where that would happen.
   */
  const pagesFor = (total: number) =>
    Math.min(MAX_PAGES, Math.ceil(Number(total || 0) / PAGE_SIZE));

  const children: string[] = [`${origin}/sitemap-static.xml`];
  for (let i = 1; i <= pagesFor(shopProbe[0]?.total_count ?? 0); i++) {
    children.push(`${origin}/sitemap-shops-${i}.xml`);
  }
  for (let i = 1; i <= pagesFor(productProbe[0]?.total_count ?? 0); i++) {
    children.push(`${origin}/sitemap-products-${i}.xml`);
  }

  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      children.map((loc) => `  <sitemap><loc>${escapeHtml(loc)}</loc></sitemap>`).join("\n") +
      `\n</sitemapindex>\n`,
  );
}
