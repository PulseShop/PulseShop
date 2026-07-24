import { ProductImage } from "@/components/product/ProductImage";
import { formatKes } from "@/lib/currency";
import type { Analytics } from "@/types";

/** Shared by AnalyticsPage (full list) and DashboardOverviewPage (top 3) so
 *  the two can't drift into different row markup for the same data. */
export function TopProductsList({
  products,
  emptyMessage = "No sales yet — orders will populate this.",
}: {
  products: Analytics["topProducts"];
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return <p className="mt-3 text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {products.map((p, i) => (
        <div key={p.name} className="flex items-center gap-3">
          <span className="w-5 text-sm font-bold text-muted">{i + 1}</span>
          <ProductImage src={p.image} alt="" className="size-10 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
            <p className="text-xs text-muted">{p.units} sold</p>
          </div>
          <p className="text-sm font-bold text-ink">{formatKes(p.revenue)}</p>
        </div>
      ))}
    </div>
  );
}
