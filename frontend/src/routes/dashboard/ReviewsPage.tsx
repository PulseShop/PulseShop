import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquare, Star } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { services } from "@/services";

const PAGE_SIZE = 20;
const STARS = [5, 4, 3, 2, 1] as const;

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
                  <li key={`${r.productId}-${r.createdAt}-${i}`} className="rounded-card bg-card p-4 shadow-soft">
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
