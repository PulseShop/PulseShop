import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, Star, Store } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { MerchantReviewItem } from "@/types";

const PAGE_SIZE = 20;
const STARS = [5, 4, 3, 2, 1] as const;
/** Matches the reviews_merchant_reply_len CHECK in migration 0040. */
const MAX_REPLY = 500;

function StarRow({ stars, size = "size-3.5" }: { stars: number; size?: string }) {
  return (
    <div className="flex gap-0.5" aria-label={`${stars} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(size, s <= stars ? "fill-amber-400 text-amber-400" : "text-stone-300")}
        />
      ))}
    </div>
  );
}

/**
 * The seller's public answer to one review.
 *
 * Optional, and deliberately collapsed to a single link until they want it: a
 * reply box open under every review reads as an inbox demanding to be cleared,
 * when in practice a seller answers the two reviews that need answering and
 * leaves the rest.
 *
 * Replies are PUBLIC — they render under the review on the product page, which
 * is the whole point of having them, and the copy says so. Saving an empty box
 * retracts an existing reply, which is the only way to take one back.
 */
function ReplyBox({ review }: { review: MerchantReviewItem }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const existing = review.merchantReply ?? "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(existing);

  const mutation = useMutation({
    mutationFn: () => services.reviews.replyToReview(review.reviewId, draft),
    onSuccess: (saved) => {
      // Refetch rather than patching the cache: the server trims and may reject,
      // and the same review is also being read by the public product page.
      qc.invalidateQueries({ queryKey: ["merchant-reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews", review.productId] });
      setOpen(false);
      push(saved.merchantReply ? "Reply posted" : "Reply removed", "success");
    },
    onError: () => push("Couldn't save your reply — try again", "danger"),
  });

  // Nothing to address a reply to. Only reachable in mock mode against records
  // written before replies existed; the RPC always returns an id.
  if (!review.reviewId) return null;

  if (!open) {
    return (
      <div className="mt-3">
        {existing ? (
          <div className="rounded-btn border-l-2 border-primary/40 bg-stone-50 py-2.5 pl-3 pr-3">
            <div className="flex items-center gap-1.5">
              <Store className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="text-xs font-bold text-ink">Your reply</span>
              <span className="text-xs text-muted">· shown on the product page</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{existing}</p>
            <button
              type="button"
              onClick={() => {
                setDraft(existing);
                setOpen(true);
              }}
              className="mt-1.5 text-xs font-bold text-primary hover:underline"
            >
              Edit reply
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setOpen(true);
            }}
            className="text-xs font-bold text-primary hover:underline"
          >
            Reply to this review
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-btn border border-stone-200 bg-stone-50 p-3">
      <label className="block text-xs font-bold text-ink" htmlFor={`reply-${review.reviewId}`}>
        Your reply <span className="font-medium text-muted">— shown publicly under this review</span>
      </label>
      <textarea
        id={`reply-${review.reviewId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_REPLY))}
        rows={3}
        placeholder="Thanks for the feedback — we've switched couriers since, so delivery is now next-day."
        className="w-full resize-none rounded-btn border border-stone-200 bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {draft.length}/{MAX_REPLY}
          {existing && !draft.trim() && " · saving blank removes your reply"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
            className="rounded-btn px-3 py-1.5 text-xs font-bold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || draft.trim() === existing.trim()}
            className="flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {!draft.trim() && existing ? "Remove reply" : "Post reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every rating left on the merchant's own products, in one place — separate
 * from Analytics (which answers "how much did I sell") rather than folded
 * into it, so a seller checking "how is this specific product doing" has one
 * screen to look at.
 */
export function ReviewsDashboardPage() {
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage] = useState(1);

  // Just for the filter dropdown's labels — a plain, generously-sized page
  // rather than a second paginated control on this screen.
  const productsQ = useQuery({
    queryKey: ["reviews-product-options"],
    queryFn: () => services.products.listProducts({ page: 1, pageSize: 200 }),
  });

  const reviewsQ = useQuery({
    queryKey: ["merchant-reviews", productFilter, page],
    queryFn: () =>
      services.reviews.getMerchantReviews({
        productId: productFilter || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const data = reviewsQ.data;
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const maxBucket = data ? Math.max(1, ...STARS.map((s) => data.distribution[s])) : 1;

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">Dashboard / Reviews</p>
          <h1 className="text-2xl font-extrabold text-ink">Reviews</h1>
        </div>

        {reviewsQ.isError ? (
          <QueryError
            title="Couldn't load reviews"
            onRetry={() => reviewsQ.refetch()}
            retrying={reviewsQ.isFetching}
          />
        ) : reviewsQ.isLoading || !data ? (
          <div className="space-y-6">
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* summary */}
            <section className="grid grid-cols-1 gap-6 rounded-card bg-card p-6 shadow-soft sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center justify-center gap-1 sm:pr-6 sm:border-r sm:border-stone-100">
                <p className="text-4xl font-extrabold text-ink">{data.avgRating.toFixed(1)}</p>
                <StarRow stars={Math.round(data.avgRating)} size="size-4" />
                <p className="text-xs text-muted">
                  {data.totalReviews} rating{data.totalReviews === 1 ? "" : "s"}
                </p>
              </div>
              <div className="space-y-1.5">
                {STARS.map((s) => {
                  const count = data.distribution[s];
                  const pct = Math.round((count / maxBucket) * 100);
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="w-3 text-xs font-semibold text-muted">{s}</span>
                      <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-6 text-right text-xs text-muted">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* filter */}
            <div className="flex items-center justify-between">
              <select
                value={productFilter}
                onChange={(e) => {
                  setProductFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by product"
                className="h-10 rounded-btn border border-stone-200 bg-card px-3 text-sm font-semibold outline-none focus:border-primary"
              >
                <option value="">All products</option>
                {(productsQ.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* list */}
            {data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-card bg-card p-10 text-center shadow-soft">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquare className="size-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-ink">
                    {productFilter ? "No reviews yet for this product" : "No reviews yet"}
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-muted">
                    Reviews appear once buyers who ordered from you rate their purchase.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.items.map((r, i) => (
                  <li key={r.reviewId || `${r.productId}-${r.createdAt}-${i}`} className="rounded-card bg-card p-4 shadow-soft">
                    <div className="flex items-start gap-3">
                      <ProductImage src={r.image} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold text-ink">{r.productName}</p>
                          <span className="shrink-0 text-xs text-muted">
                            {new Date(r.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <StarRow stars={r.stars} />
                          <span className="text-xs text-muted">{r.reviewerName || "Verified buyer"}</span>
                        </div>
                        {r.comment ? (
                          <p className="mt-2 whitespace-pre-line text-sm text-ink/90">{r.comment}</p>
                        ) : (
                          <p className="mt-2 text-sm italic text-muted">No written comment.</p>
                        )}
                        <ReplyBox review={r} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* pagination */}
            {totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between rounded-card bg-card px-4 py-3 shadow-soft">
                <p className="text-xs font-medium text-muted">
                  Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, totalCount)} of{" "}
                  {totalCount}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage(pageSafe - 1)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted disabled:opacity-30 hover:bg-stone-100"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage(pageSafe + 1)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted disabled:opacity-30 hover:bg-stone-100"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
