import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-stone-200/70", className)} />;
}

/** Mirrors ProductCard's real geometry: square image (the crop applied at
 *  upload), a two-line title block, then rating, price and stock. It was a 3:4
 *  image over two lines, so every grid visibly reflowed the moment the products
 *  landed. Takes the same `layout` as ProductCard, so switching the storefront
 *  to list view doesn't reintroduce that reflow on the next load. */
export function ProductCardSkeleton({ layout = "grid" }: { layout?: "grid" | "row" }) {
  if (layout === "row") {
    return (
      <div className="flex gap-3 rounded-card bg-card p-3 shadow-soft">
        <Skeleton className="size-28 shrink-0 rounded-xl sm:size-32" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3.5 w-1/3 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="mt-auto h-5 w-20 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card bg-card shadow-soft">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-1.5 p-3">
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-4 w-1/2 rounded" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}
