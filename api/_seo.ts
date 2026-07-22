// GENERATED from frontend/src/lib/seo.ts by frontend/scripts/emit-shell.mjs.
// Do not edit — edit the original.
/* eslint-disable */
/**
 * Titles, descriptions, canonical URLs and JSON-LD for every public page.
 *
 * Shared verbatim by two callers that run in different places:
 *   - api/render.ts, the Vercel Function that serves the HTML a crawler or a
 *     WhatsApp link-preview fetcher receives (they run no JavaScript, so this is
 *     the only version of the page they will ever see);
 *   - lib/useSeo.ts in the browser, which re-applies the same tags after a
 *     client-side navigation.
 *
 * They must agree. A crawler that fetches the URL directly and a crawler that
 * follows a link must not be shown different titles — that reads as cloaking,
 * and it is graded as such. Hence one module, imported by both, with no
 * dependencies and no `@/` alias so the root-level function bundle can pull it
 * in unchanged.
 *
 * SECURITY: everything below composes strings that end up inside raw HTML.
 * Until now this app had no such path — React escapes every value it renders,
 * which is why lib/deeplinks.ts could template URLs without ceremony. Server
 * rendering removes that guarantee: a shop name is seller-controlled text going
 * straight into an attribute, so `escapeHtml` is not defensive tidiness here,
 * it is the only thing standing between a seller and stored XSS on their own
 * storefront. Every interpolation in this file goes through escapeHtml (HTML
 * contexts) or jsonLdScript (script contexts). There are no exceptions and no
 * "this one is safe because it's a number" shortcuts.
 */

export const SITE_NAME = "PulseShop";
export const SITE_ORIGIN = "https://pulseshop.space";
const CURRENCY = "KES";

/**
 * Marks every tag this module emits, server-side and client-side alike.
 *
 * Without it the browser ends up with BOTH sets after hydration: the client
 * cannot tell the server's <link rel="canonical"> from index.html's own static
 * tags, so it leaves them and appends its own. Two canonical links that
 * disagree are worse than none — Google treats conflicting canonicals as noise
 * and picks for itself. Marked tags are the ones useSeo() is allowed to clear.
 */
export const SEO_MANAGED_ATTR = "data-seo-managed";
const SEO_MANAGED = `${SEO_MANAGED_ATTR}=""`;

/** Google truncates a title around here; a description around 155. */
const TITLE_BUDGET = 60;
const DESC_MAX = 155;

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/**
 * HTML-escape for text and double-quoted attribute values.
 *
 * `'` is escaped too. It is not strictly required inside double quotes, but
 * this function is the single escape used for every context in this module and
 * making it context-dependent is how escaping bugs happen.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialise a JSON-LD object into a <script> body.
 *
 * HTML-escaping is WRONG inside a script element — the browser does not decode
 * entities there, so `&quot;` would corrupt the JSON. The actual hazard is
 * different: an HTML parser ends the script at the first literal `</script`,
 * wherever it appears, including inside a JSON string. A product described as
 * `</script><img onerror=...>` would break out. Escaping `<` as `<` closes
 * that, and JSON.parse reads `<` back as `<`, so the data survives intact.
 * `>` and `&` go too, which also neutralises `<!--` comment-state tricks.
 */
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<script type="application/ld+json" ${SEO_MANAGED}>${json}</script>`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Collapse whitespace and strip any markup a seller pasted into a text field. */
export function plain(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trim to a length on a word boundary, with an ellipsis if anything was cut. */
export function truncate(text: string, max: number): string {
  const t = plain(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const formatKes = (amount: number) => `${CURRENCY} ${Math.round(amount).toLocaleString("en-KE")}`;

/**
 * `<lead> — <detail> | PulseShop`, with the detail sacrificed before the lead.
 *
 * Most-distinctive term first is not cosmetic: the tail is what gets cut, so a
 * "PulseShop | ..." prefix would spend the visible half of every title in the
 * index on the one word that is identical across every page on the domain.
 */
function composeTitle(lead: string, detail: string): string {
  const suffix = ` | ${SITE_NAME}`;
  const head = plain(lead);
  const tail = plain(detail);
  const room = TITLE_BUDGET - suffix.length - head.length - 3; // 3 = " — "
  if (!tail || room < 12) return truncate(head, TITLE_BUDGET - suffix.length) + suffix;
  return `${head} — ${truncate(tail, room)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Shapes — mirror the seo_shop() / seo_product() RPC payloads (migration 0028)
// ---------------------------------------------------------------------------

export interface SeoShop {
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  location: string;
  metaDescription: string;
  avatarUrl: string;
  bannerUrl: string;
  productCount: number;
  categories: string[];
  updatedAt?: string;
}

export interface SeoProduct {
  name: string;
  slug: string;
  sku: string;
  category: string;
  summary: string;
  description: string;
  metaDescription: string;
  images: string[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  shopName: string;
  shopHandle: string;
  shopLocation: string;
  updatedAt?: string;
}

/** What a page contributes to <head>. `robots` false means noindex. */
export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  image: string;
  robots: boolean;
  /** OG type — "website" for listings, "product" for a product page. */
  ogType: string;
  jsonLd: unknown[];
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const shopPath = (handle: string) => `/${handle}`;
export const productPath = (handle: string, slug: string) => `/${handle}/${slug}`;

const absolute = (origin: string, pathOrUrl: string) => {
  if (!pathOrUrl) return "";
  // Only http(s) is allowed through. Image URLs are seller-supplied (the
  // `all_http_urls` CHECK in 0021 already enforces this at write time); this is
  // the second line, so a legacy row cannot put `javascript:` in an og:image.
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return origin + pathOrUrl;
  return "";
};

/**
 * Shop handles and product slugs as they may appear in a URL.
 *
 * Checked before either reaches a database call. The RPCs take bound
 * parameters so this is not injection defence — it is there to stop a crawler
 * hitting a junk path from costing a round trip, and to keep the canonical URL
 * we echo back into the page free of anything the seller never chose.
 * Deliberately stricter than it needs to be: `merchants_handle_fmt` and
 * `products_slug_fmt` both restrict these to exactly this alphabet.
 */
export const SEO_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const isValidSlug = (s: string | undefined | null): s is string =>
  typeof s === "string" && SEO_SLUG_RE.test(s);

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

const DEFAULT_IMAGE = "/icons/icon-512.png";

export function homeSeo(origin: string): PageSeo {
  return {
    title: `${SITE_NAME} — Buy from local shops on WhatsApp`,
    description:
      "Discover independent shops in Kenya, browse their products, and order straight over WhatsApp. No app required.",
    canonical: `${origin}/`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_NAME,
        url: `${origin}/`,
      },
    ],
  };
}

export function shopsSeo(origin: string): PageSeo {
  return {
    title: `All shops | ${SITE_NAME}`,
    description: `Browse every shop on ${SITE_NAME} — fashion, beauty, electronics and more from independent Kenyan sellers.`,
    canonical: `${origin}/shops`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `Shops on ${SITE_NAME}`,
        url: `${origin}/shops`,
      },
    ],
  };
}

/** A page that exists but must never be indexed (cart, checkout, account, 404). */
export function privateSeo(): PageSeo {
  return {
    title: SITE_NAME,
    description: "",
    canonical: "",
    image: "",
    robots: false,
    ogType: "website",
    jsonLd: [],
  };
}

export function shopSeo(shop: SeoShop, origin: string): PageSeo {
  const url = origin + shopPath(shop.handle);

  // What the shop is, in the seller's words if they gave us any, else derived
  // from what they actually stock.
  const detail =
    plain(shop.tagline) ||
    [shop.categories.slice(0, 2).join(" & "), shop.location].filter(Boolean).join(", ");

  const description =
    truncate(shop.metaDescription, DESC_MAX) ||
    truncate(shop.bio, DESC_MAX) ||
    truncate(
      `Shop ${shop.productCount} ${shop.productCount === 1 ? "item" : "items"} from ${shop.name}` +
        `${shop.location ? ` in ${shop.location}` : ""}` +
        `${shop.categories.length ? ` — ${shop.categories.slice(0, 3).join(", ")}` : ""}. ` +
        `Order on ${SITE_NAME}.`,
      DESC_MAX,
    );

  return {
    title: composeTitle(shop.name, detail),
    description,
    canonical: url,
    image: absolute(origin, shop.bannerUrl || shop.avatarUrl || DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Store",
        name: shop.name,
        url,
        ...(shop.avatarUrl ? { image: absolute(origin, shop.avatarUrl) } : {}),
        ...(description ? { description } : {}),
        // No `telephone`. The seller's WhatsApp number is on the page for a
        // shopper who navigated there; publishing it as structured data hands
        // it to every scraper that reads JSON-LD, permanently and in bulk.
        ...(shop.location
          ? {
              address: {
                "@type": "PostalAddress",
                addressLocality: shop.location,
                addressCountry: "KE",
              },
            }
          : {}),
      },
      breadcrumbs(origin, [
        { name: "Shops", path: "/shops" },
        { name: shop.name, path: shopPath(shop.handle) },
      ]),
    ],
  };
}

export function productSeo(product: SeoProduct, origin: string): PageSeo {
  const url = origin + productPath(product.shopHandle, product.slug);
  const priced =
    product.minPrice === product.maxPrice
      ? formatKes(product.minPrice)
      : `from ${formatKes(product.minPrice)}`;

  const description =
    truncate(product.metaDescription, DESC_MAX) ||
    truncate(product.summary, DESC_MAX) ||
    truncate(product.description, DESC_MAX) ||
    truncate(
      `${product.name} from ${product.shopName}` +
        `${product.shopLocation ? ` in ${product.shopLocation}` : ""} — ${priced}. ` +
        `Order on ${SITE_NAME}.`,
      DESC_MAX,
    );

  const images = product.images.map((i) => absolute(origin, i)).filter(Boolean);

  const offer =
    product.minPrice === product.maxPrice
      ? {
          "@type": "Offer",
          price: product.minPrice,
          priceCurrency: CURRENCY,
          availability: `https://schema.org/${product.inStock ? "InStock" : "OutOfStock"}`,
          url,
        }
      : {
          "@type": "AggregateOffer",
          lowPrice: product.minPrice,
          highPrice: product.maxPrice,
          priceCurrency: CURRENCY,
          availability: `https://schema.org/${product.inStock ? "InStock" : "OutOfStock"}`,
          url,
        };

  return {
    title: composeTitle(product.name, product.shopName),
    description,
    canonical: url,
    image: images[0] || absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "product",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        ...(images.length ? { image: images } : {}),
        ...(description ? { description } : {}),
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.category ? { category: product.category } : {}),
        brand: { "@type": "Brand", name: product.shopName },
        offers: {
          ...offer,
          seller: { "@type": "Organization", name: product.shopName },
        },
        // No aggregateRating. The reviews table exists but nothing writes to
        // it, so every product would advertise 0 reviews — and inventing the
        // field to win a star rating in the results is exactly what earns a
        // manual action. It goes in when reviews are real.
      },
      breadcrumbs(origin, [
        { name: "Shops", path: "/shops" },
        { name: product.shopName, path: shopPath(product.shopHandle) },
        { name: product.name, path: productPath(product.shopHandle, product.slug) },
      ]),
    ],
  };
}

function breadcrumbs(origin: string, trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: origin + crumb.path,
    })),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * The full <head> fragment for a page. Every dynamic value passes through
 * escapeHtml on the way in; nothing is concatenated raw.
 */
export function renderHead(seo: PageSeo): string {
  // <title> is deliberately NOT marked: the client sets document.title, which
  // rewrites this element in place. Clearing it first would briefly leave the
  // document without one.
  const tags: string[] = [`<title>${escapeHtml(seo.title)}</title>`];

  const meta = (attr: "name" | "property", key: string, value: string) =>
    value ? `<meta ${attr}="${key}" content="${escapeHtml(value)}" ${SEO_MANAGED} />` : "";

  tags.push(meta("name", "description", seo.description));

  if (seo.robots) {
    tags.push(
      `<meta name="robots" content="index, follow, max-image-preview:large" ${SEO_MANAGED} />`,
    );
    if (seo.canonical) {
      tags.push(`<link rel="canonical" href="${escapeHtml(seo.canonical)}" ${SEO_MANAGED} />`);
    }
  } else {
    tags.push(`<meta name="robots" content="noindex, nofollow" ${SEO_MANAGED} />`);
  }

  tags.push(meta("property", "og:site_name", SITE_NAME));
  tags.push(meta("property", "og:type", seo.ogType));
  tags.push(meta("property", "og:title", seo.title));
  tags.push(meta("property", "og:description", seo.description));
  tags.push(meta("property", "og:url", seo.canonical));
  tags.push(meta("property", "og:image", seo.image));

  tags.push(meta("name", "twitter:card", seo.image ? "summary_large_image" : "summary"));
  tags.push(meta("name", "twitter:title", seo.title));
  tags.push(meta("name", "twitter:description", seo.description));
  tags.push(meta("name", "twitter:image", seo.image));

  for (const block of seo.jsonLd) tags.push(jsonLdScript(block));

  return tags.filter(Boolean).join("\n    ");
}
