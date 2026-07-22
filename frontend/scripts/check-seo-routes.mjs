/**
 * Fail the build when main.tsx grows a top-level route that api/render.ts does
 * not know about.
 *
 * The renderer treats any unrecognised single path segment as a shop handle.
 * That is what makes `/zawadishops` work without a route table — but it also
 * means adding `<Route path="/wishlist">` to main.tsx and nothing else would
 * have the server look up a shop called "wishlist", miss, and answer 404 with
 * noindex. The page would still render (React Router takes over on the client),
 * so this breaks quietly: a real page that search engines are told does not
 * exist, and that returns the wrong status to anything checking.
 *
 * Cheap to enforce, and the failure mode is otherwise invisible until someone
 * wonders why a page never appears in search.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mainTsx = readFileSync(path.resolve(here, "../src/main.tsx"), "utf8");
const renderTs = readFileSync(path.resolve(here, "../../api/render.ts"), "utf8");

/** First path segment of every literal route in main.tsx. */
const routeSegments = new Set();
for (const m of mainTsx.matchAll(/<Route\s+path="([^"]+)"/g)) {
  const first = m[1].split("/").filter(Boolean)[0];
  // "/" and the "*" catch-all have no segment; ":param" routes are the shop
  // and product patterns the renderer resolves against the database.
  if (!first || first === "*" || first.startsWith(":")) continue;
  routeSegments.add(first);
}

const reservedBlock = /const RESERVED = new Set\(\[([\s\S]*?)\]\)/.exec(renderTs);
if (!reservedBlock) {
  console.error("check-seo-routes: could not find the RESERVED set in api/render.ts");
  process.exit(1);
}
const reserved = new Set([...reservedBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

const missing = [...routeSegments].filter((s) => !reserved.has(s));

if (missing.length) {
  console.error(
    `\ncheck-seo-routes: main.tsx routes not listed in RESERVED in api/render.ts:\n` +
      missing.map((s) => `  - "${s}"`).join("\n") +
      `\n\nAdd them to RESERVED (and to PRIVATE_ROOTS if the page is not meant to\n` +
      `be indexed). Without this the renderer treats "${missing[0]}" as a shop\n` +
      `handle, fails to find it, and serves the page as a noindex 404.\n`,
  );
  process.exit(1);
}

console.log(`check-seo-routes: ${routeSegments.size} routes, all reserved.`);
