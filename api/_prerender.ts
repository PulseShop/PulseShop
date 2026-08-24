/**
 * Real, crawlable page CONTENT for the two templates that carry the site's
 * whole long tail: a storefront and a product.
 *
 * WHY THIS EXISTS. api/render.ts already gives every URL a correct <head>. It
 * gives every URL the same empty <div id="root"></div> underneath it. That is
 * enough for a WhatsApp link preview, which only ever reads meta tags, and it
 * is not enough for search:
 *
 *  - Googlebot renders JavaScript, but on its own schedule and out of a budget.
 *    A page whose content only exists after 435 KB of JS parses is a page that
 *    gets indexed late and re-crawled reluctantly.
 *  - Bing, DuckDuckGo and the AI answer crawlers (which is increasingly how
 *    "where can I buy X in Nairobi" gets asked) render little or nothing. To
 *    them PulseShop is currently a few hundred URLs with titles and no bodies.
 *  - Most of all: an empty body has no <a href>. Not one link anywhere on the
 *    domain. Sitemaps get URLs discovered, but they carry no anchor text and
 *    pass no authority, so nothing on the site can vouch for anything else on
 *    it. That is a marketplace with no internal link graph at all.
 *
 * NOT A SECOND UI. Everything below is a subset of what the React page renders
 * from the same rows, in the same order (migration 0055 sorts the shop's
 * products newest-first to match StorefrontPage's default). It has to be. A
 * server response that says something the rendered page does not is cloaking,
 * and Google does not much care that it was an accident.
 *
 * IT IS ALSO THE LOADING STATE. main.tsx mounts with createRoot().render(),
 * which clears the container's children on first commit — so this markup is
 * live for exactly as long as it takes the bundle to boot, and then React
 * replaces it wholesale. That window is currently a blank white screen on a
 * Kenyan mobile connection. Filling it with the shop's real name, banner and
 * products is a straight LCP win as well as an SEO one: the largest element
 * paints from HTML instead of waiting on JavaScript.
 *
 * SECURITY. Same rule as _seo.ts, and it matters more here because this is
 * markup rather than meta tags: every single interpolation goes through
 * escapeHtml(), and image src values additionally go through httpOnly() so a
 * legacy row cannot put `javascript:` in an attribute. There are no exceptions.
 * The styles are one static inline <style> — no seller value ever reaches a CSS
 * context, where escaping would not save us.
 */
import {
  type SeoCategory,
  type SeoProduct,
  type SeoShop,
  categoryCopy,
  categoryPath,
  categoryProducts,
  categorySlug,
  escapeHtml,
  formatKes,
  plain,
  productPath,
  shopPath,
  shopProducts,
  truncate,
} from "./_seo";

/**
 * Only http(s) survives into an attribute.
 *
 * `all_http_urls` (migration 0021) already enforces this at write time, so this
 * is the second line — the one that holds if a row predates the CHECK or a
 * future migration relaxes it.
 */
const httpOnly = (url: string) => (/^https?:\/\//i.test(url) ? url : "");

const img = (src: string, alt: string, cls: string, eager = false) => {
  const safe = httpOnly(src);
  if (!safe) return "";
  return (
    `<img class="${cls}" src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}"` +
    // The hero is the LCP candidate and is preloaded in <head>; everything
    // below the fold is lazy so a 24-product grid does not open 24 connections
    // before the bundle has even been requested.
    (eager ? ` fetchpriority="high" decoding="async" />` : ` loading="lazy" decoding="async" />`)
  );
};

/**
 * Styles for the prerendered block only.
 *
 * Plain CSS, not Tailwind classes. Tailwind v4 scans the frontend source to
 * decide which utilities to emit, and this file is neither in that source nor
 * even written before the CSS is built — every class used here would be purged
 * and the markup would render unstyled. Custom properties are safe to reach for
 * because they are declared on :root in styles/tokens.css, which the shell
 * already links, and index.html stamps data-theme before first paint, so this
 * block comes up in the right theme rather than flashing white on a dark phone.
 */
const STYLE = `<style>
#ps-pre{font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);color:var(--color-ink,#1c1917);max-width:1120px;margin:0 auto;padding:0 16px 48px}
#ps-pre a{color:inherit;text-decoration:none}
#ps-pre .ps-banner{width:100%;height:112px;object-fit:cover;display:block}
#ps-pre .ps-avatar{width:80px;height:80px;border-radius:9999px;object-fit:cover}
#ps-pre h1{font-size:1.4rem;font-weight:800;margin:12px 0 4px;line-height:1.2}
#ps-pre h2{font-size:.95rem;font-weight:700;margin:28px 0 12px}
#ps-pre .ps-muted{color:var(--color-muted,#78716c);font-size:.875rem;margin:0 0 8px}
#ps-pre .ps-bio{font-size:.9rem;line-height:1.5;max-width:60ch;margin:0 0 8px}
#ps-pre .ps-grid{list-style:none;padding:0;margin:0;display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:768px){#ps-pre .ps-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
#ps-pre .ps-card{background:var(--color-card,#fff);border-radius:var(--radius-card,16px);box-shadow:var(--shadow-soft,0 1px 4px rgba(0,0,0,.06));overflow:hidden;display:block;height:100%}
#ps-pre .ps-card img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
#ps-pre .ps-card span{display:block;padding:0 10px}
#ps-pre .ps-name{font-size:.8rem;font-weight:600;line-height:1.35;padding-top:10px}
#ps-pre .ps-price{font-size:.85rem;font-weight:800;padding-bottom:10px;padding-top:4px}
#ps-pre .ps-hero{width:100%;max-width:520px;aspect-ratio:1/1;object-fit:cover;border-radius:var(--radius-card,16px);display:block}
#ps-pre .ps-crumbs{font-size:.78rem;color:var(--color-muted,#78716c);padding:14px 0 0}
#ps-pre .ps-crumbs a{text-decoration:underline}
#ps-pre .ps-bigprice{font-size:1.3rem;font-weight:800;margin:10px 0 6px}
#ps-pre .ps-desc{font-size:.9rem;line-height:1.6;max-width:70ch}
#ps-pre .ps-tags{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-wrap:wrap;gap:8px}
#ps-pre .ps-tags a{display:inline-block;background:var(--color-fill,#f5f5f4);border-radius:9999px;padding:6px 12px;font-size:.78rem;font-weight:600}
#ps-pre .ps-copy{margin:0;max-width:70ch;font-size:.9rem;line-height:1.6}
#ps-pre .ps-copy dt{display:inline;font-weight:700}
#ps-pre .ps-copy dd{display:inline;margin:0;color:var(--color-muted,#78716c)}
#ps-pre .ps-copy dd::after{content:"";display:block;height:8px}
</style>`;

const wrap = (body: string) => `${STYLE}<div id="ps-pre">${body}</div>`;

/**
 * A product card, used by both templates — the shop's own grid and the
 * product page's "more from this shop" tail. One function so the two can never
 * drift into linking the same product two different ways.
 */
function card(
  handle: string,
  p: { name: string; slug: string; price: number; image: string; imageAlt: string },
  /**
   * True for the first card only. On a category page there is no banner, so
   * that tile IS the LCP element and <head> preloads it — leaving it
   * `loading="lazy"` would tell the browser to defer the one image the preload
   * just asked it to hurry, which is how a preload ends up costing a request
   * and buying nothing.
   */
  eager = false,
): string {
  const name = plain(p.name);
  return (
    `<li><a class="ps-card" href="${escapeHtml(productPath(handle, p.slug))}">` +
    img(p.image, plain(p.imageAlt) || name, "", eager) +
    `<span class="ps-name">${escapeHtml(truncate(name, 70))}</span>` +
    `<span class="ps-price">${escapeHtml(formatKes(p.price))}</span>` +
    `</a></li>`
  );
}

/**
 * A pill row of links.
 *
 * This is the site's cross-linking, and it is the reason the three page types
 * form a graph rather than three unconnected piles. A product links up to its
 * category, a category links out to the shops stocking it, a shop links across
 * to the categories it sells in. Every one of those is a link a crawler can
 * follow to a page it has a reason to care about, with anchor text that says
 * what it will find.
 */
const tags = (items: { href: string; label: string }[]) =>
  items.length
    ? `<ul class="ps-tags">${items
        .map(
          (t) =>
            `<li><a href="${escapeHtml(t.href)}">${escapeHtml(truncate(t.label, 40))}</a></li>`,
        )
        .join("")}</ul>`
    : "";

/**
 * A storefront: who the shop is, then everything it sells, linked.
 *
 * The <h1> is the shop name and nothing else. It is the strongest on-page
 * signal a storefront has for its own brand query ("gamerhq"), and padding it
 * with categories to chase a second keyword weakens the one it can actually win.
 */
export function renderShopBody(shop: SeoShop): string {
  const name = plain(shop.name);
  const products = shopProducts(shop);

  const meta = [shop.handle ? `@${plain(shop.handle)}` : "", plain(shop.location)]
    .filter(Boolean)
    .join(" · ");

  const blurb = truncate(plain(shop.bio) || plain(shop.tagline), 300);

  const head =
    img(shop.bannerUrl, "", "ps-banner", true) +
    img(shop.avatarUrl, name, "ps-avatar", !httpOnly(shop.bannerUrl)) +
    `<h1>${escapeHtml(name)}</h1>` +
    (meta ? `<p class="ps-muted">${escapeHtml(meta)}</p>` : "") +
    (blurb ? `<p class="ps-bio">${escapeHtml(blurb)}</p>` : "");

  // Up to the category pages for everything this shop sells. A storefront is
  // the natural place for these: it is the only page that knows the full set,
  // and it sends a crawler somewhere broader rather than deeper.
  const cats = tags(
    (shop.categories ?? [])
      .map((c) => plain(c))
      .filter(Boolean)
      .slice(0, 8)
      .map((c) => ({ href: categoryPath(categorySlug(c)), label: c })),
  );

  if (!products.length) return wrap(head + cats);

  return wrap(
    head +
      cats +
      // Named rather than a bare "Products": the heading is anchor context for
      // every link beneath it, and "Products from GamerHQ" says which shop.
      `<h2>Products from ${escapeHtml(name)}</h2>` +
      `<ul class="ps-grid">${products.map((p) => card(shop.handle, p)).join("")}</ul>`,
  );
}

/**
 * A category across every shop that stocks it.
 *
 * The shop links matter as much as the product grid. A category page that only
 * links down to products is a leaf that hoards whatever authority it earns; one
 * that also links across to the storefronts stocking the category passes it to
 * the pages that convert, and gives each shop an inbound link whose anchor text
 * is the thing it sells.
 */
export function renderCategoryBody(category: SeoCategory): string {
  const name = plain(category.name);
  const products = categoryProducts(category);
  const count = Number(category.productCount) || 0;
  const shopCount = Number(category.shopCount) || 0;

  const head =
    `<p class="ps-crumbs"><a href="/shops">Shops</a> › ${escapeHtml(name)}</p>` +
    `<h1>${escapeHtml(name)} in Kenya</h1>` +
    `<p class="ps-bio">${escapeHtml(
      `${count} ${count === 1 ? "listing" : "listings"} from ` +
        `${shopCount} independent ${shopCount === 1 ? "shop" : "shops"}, ` +
        `ordered over WhatsApp.`,
    )}</p>`;

  const shops = tags(
    (category.shops ?? [])
      .filter((s) => s && plain(s.name) && s.handle)
      .slice(0, 12)
      .map((s) => ({ href: shopPath(s.handle), label: plain(s.name) })),
  );

  const grid = products.length
    ? `<h2>${escapeHtml(name)} on PulseShop</h2>` +
      `<ul class="ps-grid">${products.map((p, i) => card(p.shopHandle, p, i === 0)).join("")}</ul>`
    : "";

  /* The hand-written copy, AFTER the grid.
     Same order the React page puts it in (see CategoryPage), because that is
     the whole requirement: a crawler that renders this response and one that
     renders the app must see the same document. Two categories have copy and
     the rest emit nothing; see CATEGORY_COPY in _seo.ts for why prose is
     authored rather than generated. */
  const copy = categoryCopy(category.slug);
  const prose = copy
    ? `<h2>${escapeHtml(copy.heading)}</h2>` +
      `<p class="ps-bio">${escapeHtml(copy.intro)}</p>` +
      `<h2>${escapeHtml(copy.pointsHeading)}</h2>` +
      `<dl class="ps-copy">${copy.points
        .map(
          (point) =>
            `<dt>${escapeHtml(point.term)}</dt><dd>${escapeHtml(point.detail)}</dd>`,
        )
        .join("")}</dl>`
    : "";

  return wrap(
    head + (shops ? `<h2>Shops stocking ${escapeHtml(name)}</h2>${shops}` : "") + grid + prose,
  );
}

/**
 * A product: breadcrumbs up to the shop, the hero photo, price, description.
 *
 * The breadcrumb links are the reason a product page is not a dead end for a
 * crawler. Without them every product is a leaf with no way back up to the
 * storefront that should be collecting the authority they earn.
 */
export function renderProductBody(product: SeoProduct): string {
  const name = plain(product.name);
  const shopName = plain(product.shopName);
  const handle = product.shopHandle;

  const price =
    product.minPrice === product.maxPrice
      ? formatKes(product.minPrice)
      : `From ${formatKes(product.minPrice)}`;

  const hero = product.images[0] ?? "";
  const heroAlt = plain(product.imageAlts?.[0]) || name;

  const crumbs =
    `<p class="ps-crumbs">` +
    `<a href="/shops">Shops</a> › ` +
    `<a href="${escapeHtml(shopPath(handle))}">${escapeHtml(shopName)}</a> › ` +
    `${escapeHtml(truncate(name, 60))}</p>`;

  const body =
    truncate(plain(product.description) || plain(product.summary), 1200);

  // Availability is stated in words, not just in the JSON-LD, because the
  // JSON-LD is for the engine and this line is for the person reading the
  // snippet — and because an out-of-stock product that reads as available is
  // the fastest way to lose a shopper's trust in the whole marketplace.
  const stock = product.inStock ? "In stock" : "Out of stock";

  return wrap(
    crumbs +
      img(hero, heroAlt, "ps-hero", true) +
      `<h1>${escapeHtml(name)}</h1>` +
      `<p class="ps-muted">by <a href="${escapeHtml(shopPath(handle))}">${escapeHtml(shopName)}</a>` +
      (plain(product.shopLocation) ? ` · ${escapeHtml(plain(product.shopLocation))}` : "") +
      `</p>` +
      `<p class="ps-bigprice">${escapeHtml(price)}</p>` +
      `<p class="ps-muted">${escapeHtml(stock)}</p>` +
      (body ? `<p class="ps-desc">${escapeHtml(body)}</p>` : "") +
      // The way out of a leaf. Without this a product page links only upward to
      // its own shop, so the deepest and most numerous pages on the site pass
      // nothing sideways to the category pages that need it most.
      (plain(product.category)
        ? tags([
            {
              href: categoryPath(categorySlug(product.category)),
              label: `More ${plain(product.category)}`,
            },
          ])
        : ""),
  );
}
