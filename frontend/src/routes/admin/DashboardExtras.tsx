import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Star } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";

/** The brand coral (DESIGN.md {colors.primary}). Single-series revenue line, so
 *  there is no adjacent-hue separation to preserve — it just carries the brand. */
const REVENUE_HUE = "#cc785c";

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

/**
 * Gross order value over time.
 *
 * GROSS, and labelled as such: PulseShop takes no cut of a sale, so this is
 * what flowed through the platform, not what the platform earned. Calling it
 * "profit" — as the dashboard mock-ups tend to — would put a number on the
 * screen that means nothing and would be believed anyway. What the platform
 * actually earns is on the Invoices screen.
 */
export function RevenueCard() {
  const [days, setDays] = useState(30);

  const q = useQuery({
    queryKey: ["admin-revenue", days],
    queryFn: () => services.admin.revenueSeries(days),
  });

  const points = q.data ?? [];
  const total = points.reduce((n, p) => n + p.grossKes, 0);
  const orders = points.reduce((n, p) => n + p.orders, 0);

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Gross order value</h2>
          <p className="mt-0.5 text-xs text-muted">
            What flowed through the platform. PulseShop takes no cut of a sale, so this is not
            revenue — see Invoices for that.
          </p>
        </div>
        <div className="flex items-center rounded-btn border border-line p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "min-h-8 rounded-[10px] px-3 text-xs font-bold transition-colors",
                days === r.days ? "bg-primary text-on-accent" : "text-muted hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-3xl font-extrabold tabular-nums text-ink">{formatKes(total)}</p>
      <p className="text-xs text-muted">
        {orders.toLocaleString()} {orders === 1 ? "order" : "orders"} in {days} days
      </p>

      {q.isError ? (
        <div className="mt-4">
          <QueryError title="Couldn't load revenue" onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <Skeleton className="mt-4 h-48 w-full" />
      ) : (
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REVENUE_HUE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={REVENUE_HUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-muted)" }}
                // Recharts types the value as possibly-undefined, so this
                // coerces rather than asserting a number that may not be one.
                formatter={(value) => [formatKes(Number(value ?? 0)), "Gross"]}
              />
              <Area
                type="monotone"
                dataKey="grossKes"
                stroke={REVENUE_HUE}
                strokeWidth={2}
                fill="url(#revenue-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/**
 * How many buyers came back.
 *
 * The denominator is printed under the figure on purpose. This is measured on
 * signed-in buyers only — a guest checkout has no identity to match a second
 * order against — so "38%" of eleven people is a very different claim from 38%
 * of eleven thousand, and a rate without its base is a rumour.
 */
export function RepeatRateCard() {
  const q = useQuery({
    queryKey: ["admin-repeat-rate"],
    queryFn: () => services.admin.repeatCustomerRate(90),
  });

  const data = q.data;
  const pct = data?.ratePct ?? 0;

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <h2 className="text-sm font-bold text-ink">Repeat customer rate</h2>
      <p className="mt-0.5 text-xs text-muted">Signed-in buyers with more than one order.</p>

      {q.isError ? (
        <div className="mt-4">
          <QueryError title="Couldn't load the repeat rate" onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading || !data ? (
        <Skeleton className="mt-6 h-32 w-full" />
      ) : data.trackedBuyers === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No signed-in buyer has ordered in the last {data.days} days, so there is nothing to
          measure yet.
        </p>
      ) : (
        <div className="mt-5">
          {/* A bar, not a donut: this is one number against a 0–100 baseline,
              which a length shows accurately and an arc does not. */}
          <p className="text-4xl font-extrabold tabular-nums text-ink">{pct}%</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fill" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {data.repeatBuyers.toLocaleString()} of {data.trackedBuyers.toLocaleString()} tracked
            buyers, last {data.days} days. Guest checkouts are not counted — they carry no identity
            to match a second order against.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Best sellers across every shop.
 *
 * Figures come from order_items, which stores the name and unit price as they
 * were at the time of sale, so renaming or repricing a product does not rewrite
 * last month's numbers.
 */
export function TopProductsCard() {
  const [days, setDays] = useState(30);

  const q = useQuery({
    queryKey: ["admin-top-products", days],
    queryFn: () => services.admin.topProducts(days, 8),
  });

  const rows = q.data ?? [];

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Best selling products</h2>
          <p className="mt-0.5 text-xs text-muted">
            Across every shop, by revenue. Priced as sold, not as listed today.
          </p>
        </div>
        <div className="flex items-center rounded-btn border border-line p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "min-h-8 rounded-[10px] px-3 text-xs font-bold transition-colors",
                days === r.days ? "bg-primary text-on-accent" : "text-muted hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {q.isError ? (
        <div className="mt-4">
          <QueryError title="Couldn't load best sellers" onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing has sold in the last {days} days, so there is no ranking to show.
        </p>
      ) : (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2 pr-3 font-bold">Product</th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">Sold</th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">Revenue</th>
                <th scope="col" className="pb-2 text-right font-bold">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-b border-line-soft last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-fill">
                        {r.image && <img src={r.image} alt="" className="size-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{r.name}</span>
                        <span className="block truncate text-xs text-muted">{r.shopName}</span>
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink">
                    {r.units.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-ink">
                    {formatKes(r.revenueKes)}
                  </td>
                  <td className="py-2.5 text-right">
                    {r.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1 tabular-nums text-ink">
                        <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                        {r.rating.toFixed(1)}
                      </span>
                    ) : (
                      // Not "0.0": an unreviewed product is not a bad one.
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
