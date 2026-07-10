import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Receipt, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { MerchantOrder, OrderChannel } from "@/types";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  direct: "Direct",
};

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

function computeAnalytics(orders: MerchantOrder[]) {
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const revenue = paid.reduce((s, o) => s + o.totalKes, 0);
  const aov = paid.length ? Math.round(revenue / paid.length) : 0;

  // units + revenue per product name
  const byProduct = new Map<string, { units: number; revenue: number; image: string }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = byProduct.get(it.productName) ?? { units: 0, revenue: 0, image: it.image };
      cur.units += it.qty;
      cur.revenue += it.lineTotalKes;
      if (!cur.image) cur.image = it.image;
      byProduct.set(it.productName, cur);
    }
  }
  const topProducts = [...byProduct.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  // channel breakdown
  const channels = { whatsapp: 0, instagram: 0, facebook: 0, direct: 0 } as Record<
    OrderChannel,
    number
  >;
  for (const o of orders) channels[o.channel] += 1;

  // last 7 days revenue (paid)
  const days: { label: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = paid.filter((o) => dayKey(o.placedAt) === key).reduce((s, o) => s + o.totalKes, 0);
    days.push({ label: d.toLocaleDateString("en-KE", { weekday: "short" }), total });
  }

  return {
    revenue,
    aov,
    orderCount: orders.length,
    paidCount: paid.length,
    pendingCount: orders.filter((o) => o.paymentStatus === "pending").length,
    topProducts,
    channels,
    days,
  };
}

export function AnalyticsPage() {
  const ordersQ = useQuery({ queryKey: ["orders-received"], queryFn: services.orders.listOrders });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: services.products.listProducts });

  const a = useMemo(() => computeAnalytics(ordersQ.data ?? []), [ordersQ.data]);
  const lowStock = (productsQ.data ?? []).filter((p) => p.status !== "available");
  const maxDay = Math.max(1, ...a.days.map((d) => d.total));
  const totalChannelOrders = Math.max(1, a.orderCount);

  const loading = ordersQ.isLoading || productsQ.isLoading;

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">Dashboard / Analytics</p>
          <h1 className="text-2xl font-extrabold text-ink">Analytics</h1>
        </div>

        {loading ? (
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
              <Kpi icon={AlertTriangle} label="Low / out of stock" value={String(lowStock.length)} tone="text-warning bg-warning/10" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 7-day revenue */}
              <section className="rounded-card bg-card p-6 shadow-soft">
                <h2 className="text-lg font-extrabold text-ink">Revenue · last 7 days</h2>
                <div className="mt-6 flex h-40 items-end justify-between gap-2">
                  {a.days.map((d, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-md bg-primary/80 transition-all"
                          style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%` }}
                          title={formatKes(d.total)}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-muted">{d.label}</span>
                    </div>
                  ))}
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
                      {p.image ? (
                        <img src={p.image} alt="" className="size-10 rounded-lg object-cover" />
                      ) : (
                        <div className="size-10 rounded-lg bg-stone-100" />
                      )}
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

            {/* low stock alert */}
            {lowStock.length > 0 && (
              <section className="rounded-card border border-warning/30 bg-warning/5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-warning" />
                    <h2 className="text-base font-extrabold text-ink">
                      {lowStock.length} product{lowStock.length === 1 ? "" : "s"} need restocking
                    </h2>
                  </div>
                  <Link to="/dashboard/inventory" className="text-sm font-bold text-primary">
                    Manage inventory →
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lowStock.slice(0, 8).map((p) => (
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
