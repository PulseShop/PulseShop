import { useEffect } from "react";
import {
  type PageSeo,
  SEO_MANAGED_ATTR,
  SITE_NAME,
  escapeHtml,
  jsonLdScript,
  privateSeo,
} from "@/lib/seo";

/**
 * Re-apply a page's <head> after a client-side navigation.
 *
 * api/render.ts already gives every crawler and link-preview fetcher the right
 * tags on a cold load, which is the half that matters for SEO. This is the
 * other half: once React Router takes over, the document keeps whatever title
 * the first page had. That shows up in the browser tab, in a bookmark, in the
 * browser's own history search, and in the title a shopper sees when they share
 * from the OS share sheet — all user-facing, none of it fixed by the server.
 *
 * It deliberately reuses the same builders as the server (lib/seo.ts), so a
 * crawler that renders JavaScript sees the tags it already received rather than
 * a second, different set. Divergence between the two is what cloaking looks
 * like to a search engine, whether or not anyone meant it that way.
 */

const MANAGED = SEO_MANAGED_ATTR;

/**
 * Remove every tag this system owns — both the ones a previous client-side page
 * installed AND the ones api/render.ts server-rendered into the document, which
 * carry the same marker. Missing the server's set is what leaves a hydrated page
 * with two canonical links and two copies of its JSON-LD.
 *
 * index.html's own tags (viewport, theme-color, the apple-* PWA set) are
 * unmarked and survive untouched.
 */
function clearManaged() {
  document.querySelectorAll(`[${MANAGED}]`).forEach((el) => el.remove());
}

function addTag(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  if (!node) return;
  node.setAttribute(MANAGED, "");
  document.head.appendChild(node);
}

export function applySeo(seo: PageSeo) {
  document.title = seo.title || SITE_NAME;
  clearManaged();

  const meta = (attr: "name" | "property", key: string, value: string) => {
    if (value) addTag(`<meta ${attr}="${key}" content="${escapeHtml(value)}" />`);
  };

  meta("name", "description", seo.description);

  if (seo.robots) {
    addTag(`<meta name="robots" content="index, follow, max-image-preview:large" />`);
    if (seo.canonical) addTag(`<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  } else {
    addTag(`<meta name="robots" content="noindex, nofollow" />`);
  }

  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:type", seo.ogType);
  meta("property", "og:title", seo.title);
  meta("property", "og:description", seo.description);
  meta("property", "og:url", seo.canonical);
  meta("property", "og:image", seo.image);
  meta("name", "twitter:card", seo.image ? "summary_large_image" : "summary");
  meta("name", "twitter:title", seo.title);
  meta("name", "twitter:description", seo.description);
  meta("name", "twitter:image", seo.image);

  for (const block of seo.jsonLd) addTag(jsonLdScript(block));
}

/**
 * Install a page's tags for as long as it is mounted.
 *
 * Pass `null` while the page's data is still loading — the previous page's
 * title is a better thing to show for 200ms than a flash of the wrong one, and
 * a page whose data failed to load stays noindex rather than being described by
 * whatever was on screen before it.
 */
export function useSeo(seo: PageSeo | null) {
  useEffect(() => {
    if (!seo) return;
    applySeo(seo);
  }, [seo && JSON.stringify(seo)]); // eslint-disable-line react-hooks/exhaustive-deps

  // On unmount, fall back to noindex rather than leaving a product's canonical
  // tag pointing at a page the shopper has navigated away from.
  useEffect(
    () => () => {
      clearManaged();
      applySeo(privateSeo());
    },
    [],
  );
}
