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

/** Exported so the prerenderer prices its grid identically to the title text. */
export const formatKes = (amount: number) =>
  `${CURRENCY} ${Math.round(amount).toLocaleString("en-KE")}`;

/**
 * `<lead> | <detail> | PulseShop`, with the detail sacrificed before the lead.
 *
 * Most-distinctive term first is not cosmetic: the tail is what gets cut, so a
 * "PulseShop | ..." prefix would spend the visible half of every title in the
 * index on the one word that is identical across every page on the domain.
 *
 * One separator for the whole title, and it is the pipe. Mixing an em dash for
 * the first join with a pipe for the second ("Gaming PC — GamerHQ | PulseShop")
 * reads as two different kinds of boundary when there is only one: three
 * equal-weight labels, narrowing left to right.
 */
const TITLE_SEP = " | ";

function composeTitle(lead: string, detail: string): string {
  const suffix = `${TITLE_SEP}${SITE_NAME}`;
  const head = plain(lead);
  const tail = plain(detail);
  const room = TITLE_BUDGET - suffix.length - head.length - TITLE_SEP.length;
  if (!tail || room < 12) return truncate(head, TITLE_BUDGET - suffix.length) + suffix;
  return `${head}${TITLE_SEP}${truncate(tail, room)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Shapes — mirror the seo_shop() / seo_product() RPC payloads (migration 0028)
// ---------------------------------------------------------------------------

/**
 * One row of a storefront's product list, as `seo_shop` returns it (migration
 * 0055).
 *
 * Deliberately thinner than SeoProduct: this shape exists to build a linked
 * grid and an ItemList, not a product page, so it carries only what a card
 * shows. Anything more would be paid for on every crawler request to the shop.
 */
export interface SeoShopProduct {
  name: string;
  slug: string;
  price: number;
  image: string;
  imageAlt: string;
  inStock: boolean;
}

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
  /**
   * Up to 24 of the shop's products, newest first (migration 0055). Optional
   * because a deployment can outlive the migration by a few minutes and a
   * missing key must degrade to "no product list", not to a crash on a page
   * every crawler is fetching.
   */
  products?: SeoShopProduct[];
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
  /**
   * Seller-written alt text, positionally aligned with `images` (migration
   * 0039). Shorter than `images`, or holding a blank at some index, simply means
   * that photo has none — every reader falls back to the product name.
   */
  imageAlts?: string[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  /**
   * Verified-buyer rating and its sample size (migration 0055). Both optional
   * for the same deploy-ordering reason as SeoShop.products, and `rating` is
   * meaningless unless `reviewCount` is above zero — productSeo() gates on the
   * count, never on the rating.
   */
  rating?: number;
  reviewCount?: number;
  /** Phone listings only (0037 specs). Blank on everything else. */
  condition?: string;
  shopName: string;
  shopHandle: string;
  shopLocation: string;
  updatedAt?: string;
}

/** A product as `seo_category` returns it — a shop-grid card plus its shop. */
export interface SeoCategoryProduct extends SeoShopProduct {
  shopName: string;
  shopHandle: string;
}

/** Shape of the `seo_category` RPC payload (migration 0056). */
export interface SeoCategory {
  name: string;
  slug: string;
  productCount: number;
  shopCount: number;
  shops: { name: string; handle: string; location: string; count: number }[];
  products: SeoCategoryProduct[];
}

/**
 * How much stock a category needs before it is worth indexing.
 *
 * The number is a judgement, not a rule from anywhere: below it, a category
 * page is a heading over one or two products that the product pages themselves
 * cover better. Google files pages like that as "crawled, currently not
 * indexed", and a domain that ships thirty of them at once looks like it is
 * generating doorways. Under the threshold the page still WORKS — a shopper who
 * filters into it sees their products — it simply carries noindex until sellers
 * have filled it.
 *
 * Passed to seo_sitemap_categories rather than duplicated in SQL, so the
 * sitemap can never advertise a URL the renderer will answer with noindex.
 */
export const CATEGORY_MIN_PRODUCTS = 3;

/** What a page contributes to <head>. `robots` false means noindex. */
export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  image: string;
  /**
   * Alt text for `image`, emitted as og:image:alt / twitter:image:alt. Blank
   * omits both tags — an empty alt attribute on a share card is worse than none,
   * since it tells a reader the image is decorative when it is the product.
   */
  imageAlt?: string;
  robots: boolean;
  /** OG type — "website" for listings, "product" for a product page. */
  ogType: string;
  /**
   * The image this page's LCP is almost certainly going to be, preloaded in
   * <head> so the browser starts fetching it during HTML parse instead of after
   * the prerendered markup below has been laid out.
   *
   * Server-only, and renderHead() is the only thing that emits it. applySeo()
   * ignores it on purpose: after a client-side navigation the image request is
   * already in flight by the time React commits, so a preload link would be a
   * duplicate fetch hint arriving too late to move anything.
   */
  preloadImage?: string;
  jsonLd: unknown[];
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const shopPath = (handle: string) => `/${handle}`;
export const productPath = (handle: string, slug: string) => `/${handle}/${slug}`;
export const categoryPath = (slug: string) => `/category/${slug}`;

/**
 * Slugify, in the one form both sides of the wire have to agree on.
 *
 * Identical to slugify() in lib/slug.ts, and duplicated rather than imported
 * because this module is copied into the serverless bundle and must stay
 * dependency-free. It also has a third implementation, category_slug() in
 * migration 0056, which resolves the URL this one builds. All three are the
 * same three steps: lowercase, every run of non-alphanumerics to a dash,
 * dashes trimmed off both ends.
 */
export const categorySlug = (category: string) =>
  plain(category)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

/**
 * PulseShop's phone conditions (lib/productSpecs.ts) mapped onto the four
 * schema.org OfferItemCondition values.
 *
 * The mapping is lossy in one direction on purpose. "mint", "good" and "fair"
 * all collapse to UsedCondition because schema.org has no grades between used
 * and refurbished, and picking RefurbishedCondition for "mint" would assert
 * that someone professionally reconditioned the handset. "salvage" is a phone
 * that needs service, which is what DamagedCondition means.
 *
 * Anything not in this table — every non-phone listing, since only phones carry
 * a condition — yields no itemCondition at all rather than a guessed
 * NewCondition. An unstated condition is honest; a wrong one is a misdescribed
 * good in a shopping result.
 */
const CONDITION_SCHEMA: Record<string, string> = {
  new: "https://schema.org/NewCondition",
  mint: "https://schema.org/UsedCondition",
  good: "https://schema.org/UsedCondition",
  fair: "https://schema.org/UsedCondition",
  salvage: "https://schema.org/DamagedCondition",
};

export function homeSeo(origin: string): PageSeo {
  return {
    title: `${SITE_NAME} | Buy from local shops on WhatsApp`,
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
        // The sitelinks search box. Google only ever renders one for a site it
        // already ranks for its own brand, so this is not a shortcut to that —
        // it is what makes the box point at PulseShop's own search rather than
        // Google's when the day comes.
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${origin}/?search={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      /**
       * The entity behind the domain, as distinct from the WebSite above.
       *
       * This is what a brand SERP and a knowledge panel are assembled from, and
       * it is the one place a marketplace can state who it is rather than
       * leaving Google to infer it from a .space TLD with no history. `sameAs`
       * is the corroboration: profiles Google can independently check against
       * each other. Only add a URL here that PulseShop actually controls — an
       * unreachable or wrong one weakens the whole block rather than padding it.
       */
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: `${origin}/`,
        logo: `${origin}/icons/icon-512.png`,
        description:
          "A hosted storefront for independent Kenyan sellers, linked from the social posts they already make.",
        areaServed: { "@type": "Country", name: "Kenya" },
      },
    ],
  };
}

/**
 * The seller pitch, now at /welcome rather than "/" — the marketplace owns the
 * root, so this needs its own indexable entry rather than sharing homeSeo(),
 * which is written for the shopper reading it.
 */
export function welcomeSeo(origin: string): PageSeo {
  return {
    title: `${SITE_NAME} | Turn your bio link into a real store`,
    description:
      "Open a hosted shop behind your Instagram, Facebook or WhatsApp bio link. List products, take orders on the apps you already use, and pay nothing to start.",
    canonical: `${origin}/welcome`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${SITE_NAME} for sellers`,
        url: `${origin}/welcome`,
      },
    ],
  };
}

export function shopsSeo(origin: string): PageSeo {
  return {
    title: `All shops | ${SITE_NAME}`,
    description: `Browse every shop on ${SITE_NAME}: fashion, beauty, electronics and more from independent Kenyan sellers.`,
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

// ---------------------------------------------------------------------------
// Marketing pages (/prices, /about, /faq)
// ---------------------------------------------------------------------------

export function pricesSeo(origin: string): PageSeo {
  return {
    title: `Pricing, plans for every seller | ${SITE_NAME}`,
    description:
      "Start free with 5 products, or grow with the Boutique and Influencer plans. Simple KES pricing for Kenyan sellers, and no card is needed to open your shop.",
    canonical: `${origin}/prices`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${SITE_NAME} pricing`,
        url: `${origin}/prices`,
      },
    ],
  };
}

export function aboutSeo(origin: string): PageSeo {
  return {
    title: `About ${SITE_NAME} | Helping local shops sell online`,
    description:
      `${SITE_NAME} helps local Kenyan shops evolve into the new generation of online selling, giving them a real storefront behind the social posts they already make.`,
    canonical: `${origin}/about`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: `About ${SITE_NAME}`,
        url: `${origin}/about`,
      },
    ],
  };
}

/**
 * The FAQ content lives HERE, not in the page component, so the FAQPage
 * JSON-LD the server emits and the accordion the browser renders can never
 * drift apart — divergence between the two reads as cloaking to a crawler.
 * FaqPage imports this array and renders it verbatim.
 */
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is PulseShop?",
    a: "PulseShop gives sellers a hosted online shop that lives behind their social posts. You get a link, pulseshop.space/yourshop, to put in your bio; shoppers browse your catalogue in their browser and their orders come straight to your WhatsApp, Instagram or Facebook.",
  },
  {
    q: "How much does it cost?",
    a: "Explorer is free forever, with up to 5 products and 1 GB of storage. Boutique is KES 1,950/month with 100 products and 50 GB. Influencer is KES 6,500/month with everything unlimited. Paid billing is launching soon; today every shop starts free on Explorer.",
  },
  {
    q: "What's the difference between the plans?",
    a: "Explorer covers the essentials: your shop link, product listings and order management. Boutique adds a full dashboard, 30-day analytics, buyer reviews and discount codes. Influencer unlocks everything: unlimited products and storage, full analytics history, the Instagram Story image generator, Phone and Computer listing types with searchable specs, delivery fulfilment options, and search & sharing (SEO) tools.",
  },
  {
    q: "What counts toward my storage?",
    a: "Your product photos, shop banner and profile image. 1 GB comfortably holds several hundred optimised product photos, so the free tier goes a long way for a small catalogue.",
  },
  {
    q: "How do orders reach me?",
    a: "A shopper checks out on your shop page and the order lands in your dashboard, with a prefilled message sent to you on WhatsApp, Instagram or Facebook, whichever channels you've connected. You confirm and arrange fulfilment directly with the buyer.",
  },
  {
    q: "How do I get paid?",
    a: "Today you arrange payment directly with your buyer: M-Pesa, cash on pickup or delivery, whatever works for you both. Integrated M-Pesa and PayPal checkout is on the way.",
  },
  {
    q: "Do my customers need to install anything?",
    a: "No. Your shop link opens in any browser on any phone, with no app and no account required to browse or order. Signed-in shoppers additionally get synced carts, favourites and order history across devices.",
  },
  {
    q: "How do discount codes work?",
    a: "Sellers on Boutique and Influencer can create percentage-off codes with an expiry date, a redemption cap, and optionally limited to specific products. Buyers enter the code in their cart or at checkout. If a product already has its own discount, the better of the two applies; discounts never stack.",
  },
  {
    q: "How do product reviews work?",
    a: "Only verified buyers, meaning people who actually ordered a product, can rate and review it. Reviews appear on your product pages on every plan; the seller-side reviews dashboard is available from Boutique up.",
  },
  {
    q: "What happens if I reach my product limit?",
    a: "Nothing is ever deleted. Your existing products stay live and sellable; you just can't add new listings until you upgrade or remove one. The same applies if you ever downgrade.",
  },
];

export function faqSeo(origin: string): PageSeo {
  return {
    title: `FAQ, common questions answered | ${SITE_NAME}`,
    description:
      `How ${SITE_NAME} works: pricing and plans, storage, how orders reach you on WhatsApp, getting paid, discount codes and reviews.`,
    canonical: `${origin}/faq`,
    image: absolute(origin, DEFAULT_IMAGE),
    robots: true,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
}

/**
 * A category across every shop that stocks it.
 *
 * This is the page that answers "gaming consoles in kenya", the query with
 * volume that neither a storefront nor a product page competes for. The title
 * therefore leads with the category and carries the country, because that is
 * the phrase being matched — the shop name, which leads a product title, would
 * be the wrong thing in front here.
 */
export function categorySeo(category: SeoCategory, origin: string): PageSeo {
  const name = plain(category.name);
  const url = origin + categoryPath(category.slug);
  const count = Number(category.productCount) || 0;
  const shopCount = Number(category.shopCount) || 0;
  const products = categoryProducts(category);

  const description = truncate(
    `Compare ${count} ${name.toLowerCase()} ${count === 1 ? "listing" : "listings"} ` +
      `from ${shopCount} independent ${shopCount === 1 ? "shop" : "shops"} in Kenya. ` +
      `Browse prices and order over WhatsApp on ${SITE_NAME}.`,
    DESC_MAX,
  );

  const indexable = count >= CATEGORY_MIN_PRODUCTS;

  return {
    title: composeTitle(name, "Buy online in Kenya"),
    description,
    canonical: url,
    image: absolute(origin, products[0]?.image || DEFAULT_IMAGE),
    // The first card is the LCP element on a grid page, exactly as the hero is
    // on a product page.
    preloadImage: absolute(origin, products[0]?.image || ""),
    robots: indexable,
    ogType: "website",
    // A thin category still gets its breadcrumbs and its ItemList — the markup
    // is correct either way, and it is `robots` that decides whether the page
    // enters the index. Emitting one and not the other would just mean the page
    // arrives incomplete on the day it crosses the threshold.
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${name} on ${SITE_NAME}`,
        url,
        description,
      },
      breadcrumbs(origin, [
        { name: "Shops", path: "/shops" },
        { name, path: categoryPath(category.slug) },
      ]),
      ...(products.length
        ? [
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name,
              numberOfItems: products.length,
              itemListElement: products.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: origin + productPath(p.shopHandle, p.slug),
                name: plain(p.name),
              })),
            },
          ]
        : []),
    ],
  };
}

/** Same linkability filter as shopProducts(), plus the shop handle it links through. */
export function categoryProducts(category: SeoCategory): SeoCategoryProduct[] {
  return (category.products ?? []).filter(
    (p) => p && isValidSlug(p.slug) && isValidSlug(p.shopHandle) && plain(p.name),
  );
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
  const products = shopProducts(shop);

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
        `${shop.categories.length ? `, stocking ${shop.categories.slice(0, 3).join(", ")}` : ""}. ` +
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
    // The banner if there is one, else the avatar — the same order the
    // storefront paints them in, and the same order that decides which of the
    // two is the LCP element.
    preloadImage: absolute(origin, shop.bannerUrl || shop.avatarUrl || ""),
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
      // No aggregateRating on the Store, even though merchants carry one.
      // Google has ignored self-serving reviews on Organization and
      // LocalBusiness since 2019 — a business rating itself is not a signal —
      // so it would buy nothing and put an unverifiable claim in the markup.
      // Product ratings, which come from verified buyers, are the ones that
      // count and they live on the product pages.
      ...(products.length
        ? [
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `Products from ${shop.name}`,
              numberOfItems: products.length,
              itemListElement: products.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: origin + productPath(shop.handle, p.slug),
                name: plain(p.name),
              })),
            },
          ]
        : []),
    ],
  };
}

/**
 * The shop's products, filtered to the ones that can actually be linked.
 *
 * A row whose slug does not match SEO_SLUG_RE cannot appear in a URL this
 * module is willing to emit, and a broken href in an ItemList is worse than a
 * shorter list. Shared by shopSeo() and the prerenderer so the JSON-LD and the
 * visible grid can never list different products.
 */
export function shopProducts(shop: SeoShop): SeoShopProduct[] {
  return (shop.products ?? []).filter((p) => p && isValidSlug(p.slug) && plain(p.name));
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
        `${product.shopLocation ? ` in ${product.shopLocation}` : ""}, ${priced}. ` +
        `Order on ${SITE_NAME}.`,
      DESC_MAX,
    );

  const images = product.images.map((i) => absolute(origin, i)).filter(Boolean);

  // Clamped rather than trusted. `rating` is a numeric(2,1) with a 0..5 CHECK
  // and `review_count` a non-negative integer, so these can only fire if a
  // future migration relaxes one of those — but an out-of-range ratingValue
  // invalidates the whole Product block, taking the price and availability down
  // with the stars, so it is not a failure worth inheriting.
  const reviewCount = Math.max(0, Math.trunc(Number(product.reviewCount) || 0));
  const rating = Math.min(5, Math.max(1, Number(product.rating) || 0));
  const condition = CONDITION_SCHEMA[plain(product.condition).toLowerCase()] ?? "";
  // The share card shows images[0], so its alt is the one that matters here.
  // Falls back to the product name rather than going blank: a card whose image
  // announces nothing is worse for a screen reader than a slightly generic one.
  const imageAlt = plain(product.imageAlts?.[0]) || plain(product.name);

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
    imageAlt,
    robots: true,
    ogType: "product",
    // The gallery's first photo is the product page's LCP element in every
    // layout, so it is worth the head start. Not the DEFAULT_IMAGE fallback:
    // preloading the app icon would spend the hint on something that never
    // becomes the LCP.
    preloadImage: images[0] || "",
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
        ...(condition ? { itemCondition: condition } : {}),
        offers: {
          ...offer,
          seller: { "@type": "Organization", name: product.shopName },
        },
        // Present only when there is something real to report. 0028 left this
        // out because nothing wrote to the reviews table; services/api/reviews.ts
        // does now, and only a verified buyer can write a row, so these are
        // genuine. The `reviewCount > 0` gate is the load-bearing part —
        // emitting a 0-review rating to win a star in the results is exactly
        // what earns a manual action, and a product nobody has reviewed yet
        // must advertise nothing at all.
        ...(reviewCount > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: Number(rating.toFixed(1)),
                reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        // NOT emitted, deliberately: priceValidUntil, shippingDetails and
        // hasMerchantReturnPolicy. Google flags all three as missing, but each
        // is a promise made to a buyer on the seller's behalf — a delivery cost,
        // a returns window, a date this price stops applying — and PulseShop
        // stores none of them. Filling them with plausible defaults would be
        // publishing terms no seller agreed to. They go in when the seller
        // settings that hold them exist.
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

  if (seo.preloadImage) {
    tags.push(
      `<link rel="preload" as="image" href="${escapeHtml(seo.preloadImage)}" fetchpriority="high" ${SEO_MANAGED} />`,
    );
  }

  tags.push(meta("property", "og:site_name", SITE_NAME));
  tags.push(meta("property", "og:type", seo.ogType));
  tags.push(meta("property", "og:title", seo.title));
  tags.push(meta("property", "og:description", seo.description));
  tags.push(meta("property", "og:url", seo.canonical));
  tags.push(meta("property", "og:image", seo.image));
  // Only alongside an actual image — an alt for an image that isn't there is
  // an orphan tag, and both consumers ignore it anyway.
  if (seo.image) tags.push(meta("property", "og:image:alt", seo.imageAlt ?? ""));

  tags.push(meta("name", "twitter:card", seo.image ? "summary_large_image" : "summary"));
  tags.push(meta("name", "twitter:title", seo.title));
  tags.push(meta("name", "twitter:description", seo.description));
  tags.push(meta("name", "twitter:image", seo.image));
  if (seo.image) tags.push(meta("name", "twitter:image:alt", seo.imageAlt ?? ""));

  for (const block of seo.jsonLd) tags.push(jsonLdScript(block));

  return tags.filter(Boolean).join("\n    ");
}
