import { Link } from "react-router";
import { categoryPath, categorySlug } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { CategoryShowcase } from "@/types";

/**
 * A phone-only quick-jump into the biggest in-stock categories, sitting directly
 * under the search field at the very top of the marketplace.
 *
 * WHY IT LEADS THE PAGE ON A PHONE. The marketplace opens on the paid promo row
 * (deliberately — that row is the platform's revenue unit), then Clearance, then
 * the full "Shop by category" wall. On a phone that is roughly two screens of
 * scrolling before a shopper who arrived knowing what they want can pick a
 * shelf. This is the faster on-ramp: one tappable row of the real, stocked
 * categories, so "I want phones" is one tap from the top instead of a scroll
 * past two adverts and a clearance rail. It is a thin single line, so it gives a
 * browse path without displacing the promo row that follows it.
 *
 * EVERY CHIP IS A REAL DESTINATION. It is drawn from the SAME showcase rows the
 * category wall uses (list_category_showcase, migration 0057), which only
 * returns categories with something in stock and photographed, so a chip can
 * never lead to an empty grid — the same promise the wall's tiles make.
 *
 * DESKTOP HIDES IT. Up there the paid row and the wall already sit side by side
 * in a wide viewport, so the scroll this shortcut removes is not a problem worth
 * spending a row of chrome on.
 */
export function CategoryQuickNav({
  entries,
  className,
}: {
  entries: CategoryShowcase[];
  className?: string;
}) {
  // Biggest shelves first, capped: a quick-nav is a shortlist a thumb can flick
  // through, not the whole taxonomy — the wall below is the whole taxonomy.
  const top = [...entries].sort((a, b) => b.productCount - a.productCount).slice(0, 10);

  // One chip is not a nav, it is a lone button; the wall says the same thing
  // better. Below two categories there is nothing to jump between.
  if (top.length < 2) return null;

  return (
    <nav
      aria-label="Jump to a category"
      className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden", className)}
    >
      {top.map((entry) => (
        <Link
          key={entry.category}
          to={categoryPath(categorySlug(entry.category))}
          className="flex min-h-9 shrink-0 items-center rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-ink shadow-soft transition-colors hover:border-primary/50 hover:text-primary"
        >
          {entry.category}
        </Link>
      ))}
    </nav>
  );
}
