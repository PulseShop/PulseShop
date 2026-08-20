import { useMemo } from "react";
import { Link } from "react-router";

import { ProductImage } from "@/components/product/ProductImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { CATEGORY_GROUPS } from "@/lib/constants";
import { categoryPath, categorySlug } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { CategoryShowcase } from "@/types";

/**
 * How many tiles one card shows.
 *
 * Two or four, never three. The tiles sit in a two-column grid, so an odd count
 * leaves a hole in the corner that reads as a failed image rather than as a
 * short list — and with a young catalogue, short lists are the common case.
 * Rounding down to the nearest even number costs at most one tile and makes
 * every card in the wall the same solid rectangle.
 */
function tileBudget(available: number): number {
  if (available >= 4) return 4;
  return available >= 2 ? 2 : 0;
}

/** Below this many stocked leaves a group is not a card. One tile is a link
 * with a heading on top of it, which the category rail above already does
 * better and in less space. */
const MIN_TILES = 2;

type Card = {
  title: string;
  tiles: CategoryShowcase[];
  productCount: number;
};

/**
 * The catalogue as a wall of category cards.
 *
 * WHAT THIS IS FOR. Under it sits a filterable grid of every product on the
 * platform, which is the right tool for a shopper who knows what they want and
 * the wrong one for a shopper who does not: an undifferentiated grid of
 * everything answers "show me the catalogue" and never answers "what is sold
 * here". This is the second answer — the taxonomy drawn as merchandise, so the
 * shape of the marketplace is legible before any filter is touched.
 *
 * CARDS ARE GROUPS, TILES ARE LEAVES. The taxonomy in lib/constants.ts is two
 * levels, and it maps onto this layout exactly: "Consumer Electronics" is a
 * card, "Smartphones" is a tile inside it. Each tile is a real destination —
 * /category/:slug, the page migration 0056 added — so every link in the wall
 * leads somewhere that exists and says what the tile promised.
 *
 * THE CARD HEADING IS NOT A LINK, DELIBERATELY. A group has no page: the
 * category page resolves leaf names, and the product filter takes one category
 * at a time, so there is nothing behind "Consumer Electronics" to link to. The
 * options were to invent a group page, to point the heading at whichever leaf
 * is biggest, or to leave it as a label. The middle one is a link that lies
 * about where it goes, and the first is a page nobody asked for; so the heading
 * carries the group's product count instead, which is information the shopper
 * did not have and no link at all.
 *
 * EMPTY CATEGORIES NEVER APPEAR. Every tile comes from list_category_showcase()
 * (migration 0057), which only returns categories with something in stock and
 * photographed. A taxonomy rendered from lib/constants.ts alone would draw all
 * 37 leaves whether or not anything is for sale behind them, which on a young
 * catalogue is a wall of dead ends — the exact failure the category pages were
 * built to avoid.
 */
export function CategoryWall({
  entries,
  loading,
  className,
}: {
  entries: CategoryShowcase[];
  loading: boolean;
  className?: string;
}) {
  const cards = useMemo(() => buildCards(entries), [entries]);

  if (loading) {
    return (
      <section className={className} aria-label="Shop by category">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CategoryCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Nothing stocked in two leaves of any one group. Rendering a heading over an
  // empty row would announce a section the catalogue cannot fill yet.
  if (cards.length === 0) return null;

  return (
    <section className={className} aria-label="Shop by category">
      <h2 className="mb-3 text-base font-extrabold text-ink lg:text-lg">Shop by category</h2>
      {/* Two columns on a phone, four on desktop — except at one card, where
          two columns would leave half the row empty beside it and read as a
          tile that failed to load rather than as a short list. A partly filled
          LAST row is ordinary grid behaviour and needs no such treatment; a
          grid whose only row is half empty is not. */}
      {/* items-start, so a card is as tall as its own content.
          Grid items stretch to the tallest in the row by default, which puts a
          two-tile card next to a four-tile one as a half-empty box with a
          hand's width of nothing under the pictures — it reads as content that
          failed to load. Amazon's equivalent wall can stretch because every
          card there is guaranteed four tiles; ours cannot promise that on a
          catalogue this young, so the cards hug instead and the row bottoms go
          ragged, which is the honest shape of the data. */}
      <div
        className={cn(
          "grid items-start gap-3 lg:grid-cols-4 lg:gap-4",
          cards.length === 1 ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {cards.map((card) => (
          <CategoryCard key={card.title} card={card} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Turns the flat per-category rows into cards.
 *
 * The taxonomy drives the grouping and the DATA drives what survives: a group
 * keeps only the leaves that came back with stock, and becomes a card only if
 * at least two did. Groups stay in the order lib/constants.ts declares them, so
 * the wall does not reshuffle itself between visits as counts move around;
 * within a card the biggest leaf leads.
 *
 * NOTHING STOCKED IS DISCARDED. The last card is the catch-all, and two
 * different kinds of leftover end up in it. `products.category` is a free-text
 * column and the fixed taxonomy is recent, so shops carry names ("Tops") that
 * belong to no group at all — see isLegacyCategory. And a group with a single
 * stocked leaf is not a card, which would otherwise delete that leaf from the
 * page; on a young catalogue spread thinly across 37 leaves, that is most of
 * the taxonomy. Both are real merchandise a shopper can buy, so both are
 * collected here rather than dropped.
 */
function buildCards(entries: CategoryShowcase[]): Card[] {
  const byName = new Map(entries.map((e) => [e.category, e]));
  const claimed = new Set<string>();
  const cards: Card[] = [];

  for (const { group, items } of CATEGORY_GROUPS) {
    const stocked = items
      .map((leaf) => byName.get(leaf))
      .filter((e): e is CategoryShowcase => Boolean(e))
      .sort((a, b) => b.productCount - a.productCount);

    const budget = tileBudget(stocked.length);
    if (budget < MIN_TILES) continue;

    // Claimed only once the group has actually become a card. A group with a
    // single stocked leaf is not a card, and marking its leaf claimed anyway
    // would delete it from the wall entirely — the catch-all below is exactly
    // where a lone category belongs, and on a young catalogue that is most of
    // the taxonomy. Overflow leaves of a group that DID become a card stay
    // claimed: the card stands for the whole group and its count already says
    // there is more behind it than the four tiles shown.
    for (const entry of stocked) claimed.add(entry.category);

    cards.push({
      title: group,
      tiles: stocked.slice(0, budget),
      // The count is the group's WHOLE stock, not the four tiles shown, so it
      // stays honest when a group has more leaves than the card has room for.
      productCount: stocked.reduce((n, e) => n + e.productCount, 0),
    });
  }

  const orphans = entries
    .filter((e) => !claimed.has(e.category))
    .sort((a, b) => b.productCount - a.productCount);

  const orphanBudget = tileBudget(orphans.length);
  if (orphanBudget >= MIN_TILES) {
    cards.push({
      title: "More to explore",
      tiles: orphans.slice(0, orphanBudget),
      productCount: orphans.reduce((n, e) => n + e.productCount, 0),
    });
  }

  return cards;
}

/* ------------------------------------------------------------------------- */

function CategoryCard({ card }: { card: Card }) {
  return (
    <article className="flex flex-col rounded-bento bg-card p-3 shadow-soft lg:p-4">
      <div className="mb-2.5 min-w-0 lg:mb-3">
        <h3 className="line-clamp-2 text-sm font-extrabold leading-snug text-ink lg:text-[15px]">
          {card.title}
        </h3>
        <p className="mt-0.5 text-[11px] font-semibold text-muted">
          {card.productCount} {card.productCount === 1 ? "product" : "products"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {card.tiles.map((tile) => (
          <CategoryTile key={tile.category} tile={tile} />
        ))}
      </div>
    </article>
  );
}

/**
 * One leaf category: a photograph of something actually in it, and its name.
 *
 * The label sits UNDER the picture rather than over it. Text on top of an
 * arbitrary seller photo is a contrast lottery — some products are shot on
 * white, some on black — and the scrim that would fix it costs the picture the
 * clarity it is there for.
 */
function CategoryTile({ tile }: { tile: CategoryShowcase }) {
  return (
    <Link
      to={categoryPath(categorySlug(tile.category))}
      className={cn(
        "group min-w-0 rounded-btn focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      )}
    >
      <div className="overflow-hidden rounded-xl bg-fill">
        <ProductImage
          src={tile.image}
          /* The tile stands for the CATEGORY, not for the product that happens
             to be illustrating it this hour, so the seller's alt text would
             describe the wrong thing to a screen reader. The link's own text
             below already names the destination, which makes the image
             decorative here. */
          alt=""
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
        />
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-muted transition-colors group-hover:text-primary lg:text-xs">
        {tile.category}
      </p>
    </Link>
  );
}

function CategoryCardSkeleton() {
  return (
    <div className="rounded-bento bg-card p-3 shadow-soft lg:p-4">
      <Skeleton className="h-4 w-2/3 rounded" />
      <Skeleton className="mt-1.5 h-3 w-14 rounded" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
