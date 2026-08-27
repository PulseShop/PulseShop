import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5];

/**
 * Read-only stars with fractional fill — a 4.3 average fills 86% of the row
 * rather than rounding up to 4 whole stars.
 */
function AverageStars({ value, compact = false }: { value: number; compact?: boolean }) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100;
  const star = compact ? "size-3.5" : "size-4";
  return (
    <div className="relative inline-flex" aria-hidden>
      <div className="flex gap-0.5">
        {STARS.map((i) => (
          <Star key={i} className={cn(star, "shrink-0 text-faint")} />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <div className="flex gap-0.5">
          {STARS.map((i) => (
            <Star key={i} className={cn(star, "shrink-0 fill-amber-400 text-amber-400")} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The product's average rating. Pass `onRate` to make the stars a rating
 * control — they then reflect the viewer's own rating (or their hover preview)
 * while the average stays visible as the number beside them. Without `onRate`
 * the stars are a plain read-only average.
 */
export function RatingRow({
  rating,
  reviewCount,
  myRating = null,
  onRate,
  pending = false,
  compact = false,
}: {
  rating: number;
  reviewCount: number;
  myRating?: number | null;
  onRate?: (stars: number) => void;
  pending?: boolean;
  /** Tile-sized: smaller stars and a bare "(12)" instead of "(12 reviews)".
   * Ignored when `onRate` is set — the rating control is a touch target and
   * doesn't shrink. */
  compact?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // A product nobody has reviewed renders "0.0" beside five empty stars, which
  // reads as a one-star product rather than a new listing. Say what is actually
  // true instead. (ProductCard already guards this by not mounting RatingRow at
  // 0; the product page mounts it regardless, so the empty state lives here.)
  const unrated = reviewCount === 0;

  const average = (
    <>
      <span className={cn("font-bold text-ink", compact ? "text-xs" : "text-sm")}>
        {rating.toFixed(1)}
      </span>
      <span className={cn("text-muted", compact ? "text-xs" : "text-sm")}>
        {compact ? `(${reviewCount})` : `(${reviewCount} ${reviewCount === 1 ? "review" : "reviews"})`}
      </span>
    </>
  );

  if (!onRate) {
    return (
      // The stars are aria-hidden and the compact form renders a bare "(12)",
      // so the visible text alone announces as "4.3 12" — the label carries the
      // meaning instead.
      <div
        className="flex items-center gap-1.5"
        role="img"
        aria-label={
          unrated
            ? "No reviews yet"
            : `Rated ${rating.toFixed(1)} out of 5 from ${reviewCount} ${
                reviewCount === 1 ? "review" : "reviews"
              }`
        }
      >
        <AverageStars value={rating} compact={compact} />
        <span aria-hidden className="flex items-center gap-1.5">
          {unrated ? (
            <span className={cn("font-medium text-muted", compact ? "text-xs" : "text-sm")}>
              No reviews yet
            </span>
          ) : (
            average
          )}
        </span>
      </div>
    );
  }

  // Hover preview wins, then the viewer's saved rating, then the average.
  const filled = hover ?? myRating ?? Math.round(rating);

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <div
        className="flex gap-0.5"
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label="Rate this product"
      >
        {STARS.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={myRating === i}
            aria-label={`${i} ${i === 1 ? "star" : "stars"}`}
            disabled={pending}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onRate(i)}
            className="-m-0.5 p-0.5 transition-transform active:scale-90 disabled:cursor-wait disabled:opacity-60"
          >
            <Star
              className={cn(
                "size-5",
                i <= filled ? "fill-amber-400 text-amber-400" : "text-faint",
              )}
            />
          </button>
        ))}
      </div>
      {unrated && myRating == null ? (
        <span className="text-sm font-medium text-muted">Be the first to rate</span>
      ) : (
        average
      )}
      {myRating != null && (
        <span className="text-xs font-semibold text-primary">· Your rating</span>
      )}
    </div>
  );
}
