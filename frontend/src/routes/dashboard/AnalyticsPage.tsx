import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { TopProductsList } from "@/components/dashboard/TopProductsList";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { LOCAL_TZ as TZ } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { OrderChannel } from "@/types";

import { FollowersChart } from "./FollowersChart";
import { RevenueChart } from "./RevenueChart";

const FOLLOWER_DAYS = 30;

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  direct: "Direct",
};

/** "2026-07-11" -> "Sat". The server returns calendar days; the weekday label
 * is presentation, so it stays here. Parsed as local noon to dodge the
 * off-by-one an ISO date string parsed as UTC midnight would cause. */
const weekdayLabel = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-KE", { weekday: "short" });
};

/** "2026-07-11" -> "Jul 11". The followers chart spans up to 90 days, where a
 * weekday name alone would repeat several times over — same off-by-one
 * dodge as weekdayLabel. */
const monthDayLabel = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
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
  const followersQ = useQuery({
    queryKey: ["follower-series", TZ, FOLLOWER_DAYS],
    queryFn: () => services.follows.getFollowerSeries(TZ, FOLLOWER_DAYS),
  });

  const a = analyticsQ.data;
  const totalChannelOrders = Math.max(1, a?.orderCount ?? 0);

  const f = followersQ.data;
  const followerDelta = f ? (f.days.at(-1)?.followers ?? f.baseline) - f.baseline : 0;

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

            {/* followers growth — a running total, so an unfollow shows as a
                dip rather than disappearing from history (migration 0034) */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-ink">Followers · last {FOLLOWER_DAYS} days</h2>
                {f && followerDelta !== 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                      followerDelta > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                    )}
                  >
                    {followerDelta > 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {followerDelta > 0 ? "+" : ""}
                    {followerDelta}
                  </span>
                )}
              </div>
              {followersQ.isError ? (
                <p className="mt-4 text-sm text-muted">Couldn't load follower history.</p>
              ) : followersQ.isLoading || !f ? (
                <Skeleton className="mt-4 h-64 w-full rounded-lg" />
              ) : (
                <div className="-ml-5 mt-4 h-64 w-full flex-1">
                  <FollowersChart
                    data={f.days.map((d) => ({ name: monthDayLabel(d.date), followers: d.followers }))}
                  />
                </div>
              )}
            </section>

            {/* top products */}
            <section className="rounded-card bg-card p-6 shadow-soft">
              <h2 className="text-lg font-extrabold text-ink">Top products</h2>
              <TopProductsList products={a.topProducts} />
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