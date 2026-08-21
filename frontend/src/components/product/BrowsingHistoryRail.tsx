import { useRef } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { ProductImage } from "@/components/product/ProductImage";
import { RailArrow, useRailScroll } from "@/components/ui/RailArrow";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useBrowsingHistory } from "@/stores/browsingHistory";

/**
 * "Your browsing history" — the products this device has opened, newest first.
 *
 * Thumbnails and a price, not full product cards. The rail's job is
 * recognition, not persuasion: a shopper scanning it is looking for the thing
 * they saw twenty minutes ago and did not buy, and they find it by its picture.
 * Stars, stock badges and an add-to-cart button on fifteen tiles would be a
 * second product grid competing with the real one directly above it.
 *
 * Renders nothing on a first visit rather than an empty frame — a heading over
 * a blank strip is a promise the page cannot keep yet.
 *
 * Reads straight from the local store (stores/browsingHistory.ts), so it costs
 * no request and paints with the rest of the page. The trade is that a price
 * here can be stale; see the note on ViewedProduct.
 */
export function BrowsingHistoryRail({ className }: { className?: string }) {
  const viewed = useBrowsingHistory((s) => s.viewed);
  const remove = useBrowsingHistory((s) => s.remove);
  const clear = useBrowsingHistory((s) => s.clear);
  const rail = useRef<HTMLDivElement>(null);

  if (viewed.length === 0) return null;

  const { canLeft, canRight, scrollBy } = useRailScroll(rail, viewed.length);

  return (
    <section aria-label="Your browsing history" className={cn("relative", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Your browsing history</h2>
        <button
          type="button"
          onClick={clear}
          className="text-xs font-semibold text-muted hover:text-ink hover:underline"
        >
          Clear history
        </button>
      </div>

      <div className="relative">
        {/* Desktop only: a touch device scrolls the rail directly, and arrows
            there would sit on top of the thing they scroll. */}
        {canLeft && <RailArrow side="left" label="your history" onClick={() => scrollBy(-1)} />}
        {canRight && <RailArrow side="right" label="your history" onClick={() => scrollBy(1)} />}

        <div
          ref={rail}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:-mx-6 lg:px-6"
        >
          {viewed.map((item) => (
            <div key={item.id} className="group relative w-28 shrink-0 snap-start sm:w-32">
              <Link to={productPath(item)} className="block">
                <div className="overflow-hidden rounded-card bg-fill shadow-soft">
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-4 text-ink">
                  {item.name}
                </p>
                <p className="text-xs font-extrabold text-primary">{formatKes(item.priceKes)}</p>
              </Link>

              {/* Per-tile removal, because "I do not want my partner seeing
                  that one" is the actual reason people open a browsing history,
                  and clearing all of it to solve that is too blunt. */}
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.name} from your browsing history`}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-card/90 text-muted opacity-0 shadow-soft backdrop-blur transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The canonical product URL, with the legacy id form as the fallback — same
 *  rule as lib/productUrl, restated here because a stored snapshot is not a
 *  Product and may predate a slug being recorded. */
const productPath = (item: { id: string; slug: string; shopSlug?: string }) =>
  item.shopSlug && item.slug ? `/${item.shopSlug}/${item.slug}` : `/product/${item.id}`;
