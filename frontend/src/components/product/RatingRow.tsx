import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5];

/**
 * Read-only stars with fractional fill — a 4.3 average fills 86% of the row
 * rather than rounding up to 4 whole stars.
 */
function AverageStars({ value }: { value: number }) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100;
  return (
    <div className="relative inline-flex" aria-hidden>
      <div className="flex gap-0.5">
        {STARS.map((i) => (
          <Star key={i} className="size-4 shrink-0 text-stone-300" />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <div className="flex gap-0.5">
          {STARS.map((i) => (
            <Star key={i} className="size-4 shrink-0 fill-amber-400 text-amber-400" />
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
}: {
  rating: number;
  reviewCount: number;
  myRating?: number | null;
  onRate?: (stars: number) => void;
  pending?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const average = (
    <>
      <span className="text-sm font-bold text-ink">{rating.toFixed(1)}</span>
      <span className="text-sm text-muted">
        ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
      </span>
    </>
  );

  if (!onRate) {
    return (
      <div className="flex items-center gap-1.5">
        <AverageStars value={rating} />
        {average}
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
                i <= filled ? "fill-amber-400 text-amber-400" : "text-stone-300",
              )}
            />
          </button>
        ))}
      </div>
      {average}
      {myRating != null && (
        <span className="text-xs font-semibold text-primary">· Your rating</span>
      )}
    </div>
  );
}
