import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Star } from "lucide-react";
import { useState } from "react";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5];
const MAX_COMMENT = 500;

/**
 * The written-reviews block on a product page: the list of reviews other buyers
 * left, plus — for a shopper who actually ordered this product — a form to add
 * or update their own. Eligibility (`canReview`) mirrors the RLS rule in
 * migration 0029; a non-buyer sees the reviews but not the form.
 */
export function ReviewsSection({
  productId,
  canReview,
  isOwner,
  signedIn,
  myRating,
  onRated,
}: {
  productId: string;
  canReview: boolean;
  isOwner: boolean;
  signedIn: boolean;
  myRating: number | null;
  onRated: () => void;
}) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const reviewsQ = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => services.reviews.listReviews(productId),
    enabled: Boolean(productId),
  });

  const [stars, setStars] = useState<number>(myRating ?? 0);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const submitMut = useMutation({
    mutationFn: () => services.reviews.rateProduct(productId, stars, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
      qc.setQueryData(["my-rating", productId], stars);
      onRated();
      setComment("");
      push("Thanks for your review!", "success");
    },
    onError: () => push("Couldn't post your review — try again", "danger"),
  });

  const reviews = reviewsQ.data ?? [];
  const filled = hover ?? stars;

  return (
    <section className="mt-8 space-y-4 lg:mt-10">
      <h2 className="text-sm font-bold text-ink lg:text-base">Reviews</h2>

      {/* write / update — only a buyer who ordered this product */}
      {canReview && (
        <div className="space-y-3 rounded-card bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold text-ink">
            {myRating != null ? "Update your review" : "Rate & review this product"}
          </p>
          <div
            className="flex gap-1"
            onMouseLeave={() => setHover(null)}
            role="radiogroup"
            aria-label="Your rating"
          >
            {STARS.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={stars === i}
                aria-label={`${i} ${i === 1 ? "star" : "stars"}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setStars(i)}
                className="-m-0.5 p-0.5 transition-transform active:scale-90"
              >
                <Star
                  className={cn("size-7", i <= filled ? "fill-amber-400 text-amber-400" : "text-stone-300")}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
            placeholder="Share what you thought — fit, quality, delivery…"
            rows={3}
            className="w-full resize-none rounded-btn border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {comment.length}/{MAX_COMMENT}
            </span>
            <button
              type="button"
              disabled={stars === 0 || submitMut.isPending}
              onClick={() => submitMut.mutate()}
              className="flex items-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {submitMut.isPending && <Loader2 className="size-4 animate-spin" />}
              {myRating != null ? "Update review" : "Post review"}
            </button>
          </div>
        </div>
      )}

      {/* the reason there's no form, when there isn't one */}
      {!canReview && !isOwner && (
        <div className="flex items-center gap-2 rounded-card bg-stone-50 px-4 py-3 text-sm text-muted">
          <Lock className="size-4 shrink-0" />
          {signedIn
            ? "Only buyers who've ordered this product can leave a review."
            : "Buy this product to leave a review."}
        </div>
      )}

      {/* the list */}
      {reviewsQ.isLoading ? (
        <p className="text-sm text-muted">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">No written reviews yet.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r, i) => (
            <li key={i} className="rounded-card bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">{r.reviewerName || "Verified buyer"}</span>
                <span className="text-xs text-muted">
                  {new Date(r.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="mt-1 flex gap-0.5" aria-label={`${r.stars} out of 5 stars`}>
                {STARS.map((s) => (
                  <Star
                    key={s}
                    className={cn("size-3.5", s <= r.stars ? "fill-amber-400 text-amber-400" : "text-stone-300")}
                  />
                ))}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-ink/90">{r.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
