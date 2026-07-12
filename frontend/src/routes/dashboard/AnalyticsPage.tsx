import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Receipt, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { OrderChannel } from "@/types";

import { RevenueChart } from "./RevenueChart";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  direct: "Direct",
};

/** The merchant's own timezone — revenue is bucketed by *their* calendar day,
 * so a 01:00 Nairobi sale doesn't get counted against the previous day. */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** "2026-07-11" -> "Sat". The server returns calendar days; the weekday label
 * is presentation, so it stays here. Parsed as local noon to dodge the
 * off-by-one an ISO date string parsed as UTC midnight would cause. */
const weekdayLabel = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-KE", { weekday: "short" });
};

/**
 * Every number on this page comes from one server-side aggregate
 * (merchant_analytics, migration 0020). It used to download every order the
 * shop had ever received — with every line item — plus the entire product
 * catalogue, and reduce all of it in the browser. That payload only ever grew.
 */
export function AnalyticsPage() {
  const analyticsQ = useQuery({
    queryKey: ["analytics", TZ],
    queryFn: () => services.analytics.getAnalytics(TZ, 7),
  });

  const a = analyticsQ.data;
  const totalChannelOrders = Math.max(1, a?.orderCount ?? 0);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">Dashboard / Analytics</p>
          <h1 className="text-2xl font-extrabold text-ink">Analytics</h1>
        </div>

        {analyticsQ.isError ? (
          <QueryError
            title="Couldn't load analytics"
            onRetry={() => analyticsQ.refetch()}
            retrying={analyticsQ.isFetching}
          />
        ) : analyticsQ.isLoading || !a ? (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              <Kpi icon={DollarSign} label="Revenue (paid)" value={formatKes(a.revenue)} tone="text-success bg-success/10" />
              <Kpi icon={Receipt} label="Orders" value={String(a.orderCount)} tone="text-primary bg-primary/10" />
              <Kpi icon={TrendingUp} label="Avg order" value={formatKes(a.aov)} tone="text-primary bg-primary/10" />
              <Kpi icon={AlertTriangle} label="Low / out of stock" value={String(a.lowStockCount)} tone="text-warning bg-warning/10" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 7-day revenue (Now using Recharts) */}
              <section className="rounded-card bg-card p-6 shadow-soft">
                <h2 className="text-lg font-extrabold text-ink">Revenue · last 7 days</h2>
                {/* Recharts automatically fills the container width/height you give it */}
                <div className="-ml-5 mt-4 h-80 w-full flex-1">
                  <RevenueChart
                    data={a.days.map((d) => ({ name: weekdayLabel(d.date), total: d.total }))}
                  />
                </div>
              </section>

              {/* channels */}
              <section className="rounded-card bg-card p-6 shadow-soft">
                <h2 className="text-lg font-extrabold text-ink">Orders by channel</h2>
                <div className="mt-5 space-y-3">
                  {(Object.keys(a.channels) as OrderChannel[]).map((ch) => {
                    const count = a.channels[ch];
                    const pct = Math.round((count / totalChannelOrders) * 100);
                    return (
                      <div key={ch}>
                        <div className="mb-1 flex justify-between text-xs font-semibold">
                          <span className="text-ink">{CHANNEL_LABEL[ch]}</span>
                          <span className="text-muted">{count}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* top products */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <h2 className="text-lg font-extrabold text-ink">Top products</h2>
              {a.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No sales yet — orders will populate this.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {a.topProducts.map((p, i) => (
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
              )}
            </section>

            {/* low stock alert — the server returns the worst 8 plus the full count */}
            {a.lowStockCount > 0 && (
              <section className="rounded-card border border-warning/30 bg-warning/5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-warning" />
                    <h2 className="text-base font-extrabold text-ink">
                      {a.lowStockCount} product{a.lowStockCount === 1 ? "" : "s"} need restocking
                    </h2>
                  </div>
                  <Link to="/dashboard/inventory" className="text-sm font-bold text-primary">
                    Manage inventory →
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.lowStock.map((p) => (
                    <span
                      key={p.id}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-bold",
                        p.status === "out" ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning",
                      )}
                    >
                      {p.name} · {p.stockQty}
                    </span>
                  ))}
                  {a.lowStockCount > a.lowStock.length && (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-muted">
                      +{a.lowStockCount - a.lowStock.length} more
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-card bg-card p-5 shadow-soft">
      <div className={cn("flex size-10 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}