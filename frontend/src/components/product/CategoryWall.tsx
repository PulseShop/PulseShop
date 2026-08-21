import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { ProductImage } from "@/components/product/ProductImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { CATEGORY_GROUPS } from "@/lib/constants";
import { formatKes } from "@/lib/currency";
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

/**
 * When one leaf category stops being a tile and becomes a card of its own.
 *
 * FIVE — "more than four". Four is a full row of tiles inside a group card, so
 * a leaf that has outgrown that number has outgrown the box it was being drawn
 * in: "Smartphones, 9 products" inside a Consumer Electronics card is a
 * thumbnail with a name under it, exactly like "Smart Home Gadgets, 1 product"
 * beside it, and the wall says nothing about which of the two is worth opening.
 *
 * The wall used to be a fixed shape — one card per taxonomy group, forever, and
 * a lone leaf with thirty products in it disappeared into "More to explore".
 * This is what makes it follow the catalogue instead: the shelves that fill up
 * get their own card, in the taxonomy's order, at every width.
 */
const SOLO_CARD_MIN = 5;

type Card = {
  title: string;
  tiles: CategoryShowcase[];
  productCount: number;
  /**
   * Set when the card IS a single leaf category rather than a group of them.
   *
   * It changes what the card is made of: one picture at card width instead of
   * four tiles, and the whole card is a link, because unlike a group this title
   * has a page behind it.
   */
  leaf?: CategoryShowcase;
};

/**
 * One picture in the curated card.
 *
 * Deliberately not a Product. The wall knows about categories and pictures, and
 * handing it the whole product model to draw four thumbnails would make a
 * layout component depend on the catalogue's shape for no gain.
 */
export type CuratedTile = {
  id: string;
  image?: string;
  imageAlt?: string;
  /** Where the tile leads — the product it is a photograph of. */
  href: string;
  name: string;
  /** The cheapest reachable price, matching what a product card would quote. */
  price: number;
  /** True when variants make that figure a floor rather than the price. */
  ranged?: boolean;
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
 * CARDS ARE GROUPS, TILES ARE LEAVES — until a leaf outgrows that. The taxonomy
 * in lib/constants.ts is two levels and maps onto this layout exactly:
 * "Consumer Electronics" is a card, "Smartphones" is a tile inside it. Each
 * tile is a real destination — /category/:slug, the page migration 0056 added —
 * so every link in the wall leads somewhere that exists and says what the tile
 * promised.
 *
 * THE WALL FOLLOWS THE CATALOGUE, IT IS NOT A FIXED SHAPE. Any leaf carrying
 * more than four products leaves its group and becomes a card in its own right
 * (see SOLO_CARD_MIN), at every width. Without that rule the wall was frozen at
 * one card per taxonomy group: a category with thirty products in it drew the
 * same 80px thumbnail as one with a single item, and a lone big leaf whose
 * siblings were empty vanished into "More to explore" entirely.
 *
 * A GROUP HEADING IS NOT A LINK, DELIBERATELY. A group has no page: the
 * category page resolves leaf names, and the product filter takes one category
 * at a time, so there is nothing behind "Consumer Electronics" to link to. The
 * options were to invent a group page, to point the heading at whichever leaf
 * is biggest, or to leave it as a label. The middle one is a link that lies
 * about where it goes, and the first is a page nobody asked for; so the heading
 * carries the group's product count instead, which is information the shopper
 * did not have and no link at all. A SOLO card is the opposite case and is a
 * link end to end — its title is a leaf, and that leaf has a page.
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
  curated,
  curatedLoading = false,
  className,
}: {
  entries: CategoryShowcase[];
  loading: boolean;
  /**
   * The free hourly rotation, drawn as one more card in the wall.
   *
   * It used to be a panel of its own at the top of the marketplace, beside the
   * promoted hero. That put it in the one row on the page that is otherwise
   * paid inventory, and gave a shopper two large photographs to scroll past
   * before reaching anything they could navigate by. It is a WAY IN, exactly
   * like a category is, so it belongs in the wall of ways in — leading it,
   * because it is the only card here that changes hour to hour.
   *
   * Empty or absent means no card: a curated shelf with nothing on it is worse
   * than one fewer card in the row.
   */
  curated?: CuratedTile[];
  curatedLoading?: boolean;
  className?: string;
}) {
  const cards = useMemo(() => buildCards(entries), [entries]);
  const curatedTiles = (curated ?? []).filter((t) => t.image).slice(0, 4);
  const hasCurated = curatedLoading || curatedTiles.length >= MIN_TILES;

  if (loading) {
    return (
      <section className={className} aria-label="Shop by category">
        <WallHeading />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CategoryCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Nothing stocked in two leaves of any one group, and no curated rotation
  // either. Rendering a heading over an empty row would announce a section the
  // catalogue cannot fill yet.
  if (cards.length === 0 && !hasCurated) return null;

  const total = cards.length + (hasCurated ? 1 : 0);

  return (
    <section className={className} aria-label="Shop by category">
      <WallHeading />
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
          total === 1 ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {hasCurated && <CuratedCard tiles={curatedTiles} loading={curatedLoading} />}
        {cards.map((card) =>
          card.leaf ? (
            <SoloCategoryCard key={card.title} card={card} leaf={card.leaf} />
          ) : (
            <CategoryCard key={card.title} card={card} />
          ),
        )}
      </div>
    </section>
  );
}

/**
 * The wall's heading, centred.
 *
 * Centred because this is now the page's main section rather than a strip
 * between two bigger ones: the marketplace opens on the promoted banners and
 * then hands the shopper the taxonomy, and a left-aligned label on a
 * full-width grid of cards reads as a rail's caption rather than as the thing
 * the page is about.
 */
function WallHeading() {
  return (
    <div className="mb-4 text-center lg:mb-5">
      <h2 className="text-lg font-extrabold text-ink lg:text-2xl">Shop by category</h2>
      <p className="mt-1 text-xs text-muted lg:text-sm">
        Every shelf on PulseShop, and what is actually stocked on it.
      </p>
    </div>
  );
}

/**
 * The free hourly rotation, wearing a category card's clothes.
 *
 * NOTHING HERE IS BOUGHT. The card used to say so in two paragraphs — a
 * subtitle over the pictures and a disclaimer under them — which between them
 * took more of the card than the merchandise did. The pictures are the point;
 * the tiles now carry a name and a price like every other product on the site,
 * so what is on the shelf is legible without opening anything. The heading and
 * the link to the shops are what is left of the words, and they are enough to
 * place the card: it is the one in the wall that changes hour to hour, and the
 * things above it in the paid row are the ones wearing a Promoted badge.
 *
 * The tiles are products and the heading leads to /shops, which is the honest
 * pair: the picture is a specific thing you can buy, and the card as a whole
 * stands for "the shops here", which is a place that exists.
 */
function CuratedCard({ tiles, loading }: { tiles: CuratedTile[]; loading: boolean }) {
  return (
    <article className="flex flex-col rounded-bento bg-primary/5 p-3 shadow-soft ring-1 ring-primary/15 lg:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2 lg:mb-3">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold leading-snug text-ink lg:text-[15px]">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          Curated
        </h3>
        <Link
          to="/shops"
          className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
        >
          All shops
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="mt-1.5 h-3 w-3/4 rounded" />
                <Skeleton className="mt-1 h-3 w-1/2 rounded" />
              </div>
            ))
          : tiles.map((tile) => (
              <Link
                key={tile.id}
                to={tile.href}
                className={cn(
                  "group min-w-0 rounded-xl focus-visible:outline-none",
                  "focus-visible:ring-2 focus-visible:ring-primary",
                )}
              >
                <div className="overflow-hidden rounded-xl bg-fill">
                  <ProductImage
                    src={tile.image}
                    alt={tile.imageAlt ?? ""}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                  />
                </div>
                {/* One line, not two. The price is the fact the shopper came
                    for and it has to sit on a predictable baseline across the
                    four tiles; a name allowed to wrap moves it on one tile and
                    not the others. */}
                <p className="mt-1.5 truncate text-[11px] font-semibold leading-tight text-muted transition-colors group-hover:text-primary">
                  {tile.name}
                </p>
                <p className="text-[11px] font-extrabold text-ink lg:text-xs">
                  {tile.ranged && <span className="font-semibold text-muted">from </span>}
                  {formatKes(tile.price)}
                </p>
              </Link>
            ))}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Turns the flat per-category rows into cards.
 *
 * THE TAXONOMY DRIVES THE ORDER AND THE DATA DRIVES THE SHAPE. Groups stay in
 * the order lib/constants.ts declares them, so the wall does not reshuffle
 * itself between visits as counts move around. What each group produces depends
 * on what is actually stocked behind it:
 *
 *   - a leaf with more than four products becomes a CARD OF ITS OWN, emitted
 *     just ahead of its group so it stays next to its family (SOLO_CARD_MIN);
 *   - whatever is left of the group becomes a group card if two or more leaves
 *     survive, with the biggest leading;
 *   - anything still unclaimed falls to the catch-all at the end.
 *
 * Pulling a big leaf out can leave its group with one leaf and therefore no
 * card. That is the right outcome rather than a regression: the group was only
 * ever a container for the leaves worth showing, and a card labelled "Health,
 * Beauty & Personal Care" holding one thumbnail says less than a card labelled
 * with the shelf a shopper can actually walk down. The stranded sibling is not
 * lost — it lands in the catch-all below with the rest.
 *
 * NOTHING STOCKED IS DISCARDED. That catch-all is the last card, and two
 * different kinds of leftover end up in it. `products.category` is a free-text
 * column and the fixed taxonomy is recent, so shops carry names ("Tops") that
 * belong to no group at all — see isLegacyCategory. And a group with a single
 * stocked leaf is not a card, which would otherwise delete that leaf from the
 * page; on a young catalogue spread thinly across 37 leaves, that is most of
 * the taxonomy. Both are real merchandise a shopper can buy, so both are
 * collected here rather than dropped — except where they are big enough to have
 * earned a card of their own, which the same rule grants them.
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

    // The big ones leave first, in the group's own declared order rather than
    // by size, so their cards keep a stable place in the wall as counts move.
    for (const leaf of items
      .map((name) => byName.get(name))
      .filter((e): e is CategoryShowcase => e != null && e.productCount >= SOLO_CARD_MIN)) {
      claimed.add(leaf.category);
      cards.push(soloCard(leaf));
    }

    const rest = stocked.filter((e) => !claimed.has(e.category));
    const budget = tileBudget(rest.length);
    if (budget < MIN_TILES) continue;

    // Claimed only once the group has actually become a card. A group with a
    // single stocked leaf is not a card, and marking its leaf claimed anyway
    // would delete it from the wall entirely — the catch-all below is exactly
    // where a lone category belongs, and on a young catalogue that is most of
    // the taxonomy. Overflow leaves of a group that DID become a card stay
    // claimed: the card stands for the whole group and its count already says
    // there is more behind it than the four tiles shown.
    for (const entry of rest) claimed.add(entry.category);

    cards.push({
      title: group,
      tiles: rest.slice(0, budget),
      // The count is the group's whole REMAINING stock, not the four tiles
      // shown, so it stays honest when a group has more leaves than the card
      // has room for. Leaves that left for a card of their own are not counted
      // here as well: the group no longer stands for them.
      productCount: rest.reduce((n, e) => n + e.productCount, 0),
    });
  }

  const orphans = entries
    .filter((e) => !claimed.has(e.category))
    .sort((a, b) => b.productCount - a.productCount);

  // A category the taxonomy has never heard of is still a shelf, and the same
  // rule reaches it: past four products it gets a card rather than a tile in
  // the catch-all.
  for (const orphan of orphans.filter((e) => e.productCount >= SOLO_CARD_MIN)) {
    claimed.add(orphan.category);
    cards.push(soloCard(orphan));
  }

  const leftovers = orphans.filter((e) => !claimed.has(e.category));
  const orphanBudget = tileBudget(leftovers.length);
  if (orphanBudget >= MIN_TILES) {
    cards.push({
      title: "More to explore",
      tiles: leftovers.slice(0, orphanBudget),
      productCount: leftovers.reduce((n, e) => n + e.productCount, 0),
    });
  }

  return cards;
}

/** A leaf that outgrew its group, as a card standing for itself. */
function soloCard(leaf: CategoryShowcase): Card {
  return { title: leaf.category, tiles: [leaf], productCount: leaf.productCount, leaf };
}

/* ------------------------------------------------------------------------- */

/**
 * A leaf category with enough behind it to be worth a card.
 *
 * ONE PICTURE AT CARD WIDTH, not four thumbnails, because there is only one
 * category here to illustrate — the showcase returns a single rotating cover
 * per category (migration 0057), and four copies of it would be a lie about
 * variety. The square keeps this card roughly the height of the four-tile cards
 * beside it, which is what stops the wall going ragged as categories cross the
 * threshold in and out.
 *
 * A LINK END TO END, unlike a group card. Its title is a leaf, and a leaf has a
 * page — /category/:slug, the one migration 0056 added — so there is no reason
 * to make the shopper find the small print inside the card to get there.
 */
function SoloCategoryCard({ card, leaf }: { card: Card; leaf: CategoryShowcase }) {
  return (
    <Link
      to={categoryPath(categorySlug(leaf.category))}
      className={cn(
        "group flex flex-col rounded-bento bg-card p-3 shadow-soft transition-shadow hover:shadow-md lg:p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <div className="mb-2.5 min-w-0 lg:mb-3">
        <h3 className="line-clamp-2 text-sm font-extrabold leading-snug text-ink transition-colors group-hover:text-primary lg:text-[15px]">
          {leaf.category}
        </h3>
        <p className="mt-0.5 text-[11px] font-semibold text-muted">
          {card.productCount} {card.productCount === 1 ? "product" : "products"}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-fill">
        <ProductImage
          src={leaf.image}
          /* The picture stands for the CATEGORY, not for the product that
             happens to be illustrating it this hour, so the seller's alt text
             would describe the wrong thing. The heading above already names the
             destination. */
          alt=""
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
        />
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-primary lg:text-xs">
        Shop all
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </p>
    </Link>
  );
}

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
