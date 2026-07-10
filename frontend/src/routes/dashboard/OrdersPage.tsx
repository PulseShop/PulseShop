import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Package, ShoppingCart } from "lucide-react";
import { useMemo } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { toWhatsAppDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { MerchantOrder, OrderChannel, PaymentStatus } from "@/types";
import { useToasts } from "@/stores/toast";

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  direct: "Direct",
};

const STATUS_TONE: Record<PaymentStatus, string> = {
  paid: "bg-success/10 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-danger/10 text-danger",
  idle: "bg-stone-100 text-muted",
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function OrdersDashboardPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const ordersQ = useQuery({ queryKey: ["orders-received"], queryFn: services.orders.listOrders });
  const orders = ordersQ.data ?? [];

  const stats = useMemo(
    () => ({
      total: orders.length,
      paid: orders.filter((o) => o.paymentStatus === "paid").length,
      pending: orders.filter((o) => o.paymentStatus === "pending").length,
    }),
    [orders],
  );

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PaymentStatus }) =>
      services.orders.updateOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["orders-received"] });
      const prev = qc.getQueryData<MerchantOrder[]>(["orders-received"]);
      qc.setQueryData<MerchantOrder[]>(["orders-received"], (old) =>
        (old ?? []).map((o) => (o.id === id ? { ...o, paymentStatus: status } : o)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["orders-received"], ctx?.prev);
      push("Couldn't update order", "danger");
    },
    onSuccess: () => push("Order updated", "success"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["orders-received"] });
      // Keeps the DashboardShell sidebar's pending-count badge in sync — it
      // reads a lighter count query instead of this page's full order list.
      qc.invalidateQueries({ queryKey: ["orders-pending-count"] });
    },
  });

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">Dashboard / Orders</p>
          <h1 className="text-2xl font-extrabold text-ink">Orders</h1>
        </div>

        {/* stats */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <StatCard icon={ShoppingCart} label="Total" value={stats.total} tone="text-primary bg-primary/10" />
          <StatCard icon={CheckCircle2} label="Paid" value={stats.paid} tone="text-success bg-success/10" />
          <StatCard icon={Clock} label="Pending" value={stats.pending} tone="text-warning bg-warning/10" />
        </div>

        {ordersQ.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-card" />
            ))}
          </div>
        ) : ordersQ.isError ? (
          <div className="rounded-card bg-card p-8 text-center shadow-soft">
            <p className="font-semibold text-ink">Couldn't load orders</p>
            <Button className="mt-3" onClick={() => ordersQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-12 text-center shadow-soft">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Package className="size-7 text-primary" />
            </div>
            <p className="text-lg font-bold text-ink">No orders yet</p>
            <p className="text-sm text-muted">Orders from your shoppers will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <article key={o.id} className="rounded-card bg-card p-5 shadow-soft">
                {/* header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">{o.reference}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold capitalize",
                          STATUS_TONE[o.paymentStatus],
                        )}
                      >
                        {o.paymentStatus}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {CHANNEL_LABEL[o.channel]} · {timeAgo(o.placedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-ink">{formatKes(o.totalKes)}</p>
                    {o.paymentMethod && (
                      <p className="text-xs font-medium text-muted uppercase">{o.paymentMethod}</p>
                    )}
                  </div>
                </div>

                {/* items */}
                <div className="mt-4 space-y-2 border-y border-stone-100 py-3">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {it.image ? (
                        <img src={it.image} alt="" className="size-10 rounded-lg object-cover" />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-lg bg-stone-100">
                          <Package className="size-4 text-muted" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{it.productName}</p>
                        <p className="text-xs text-muted">
                          {it.qty} × {formatKes(it.unitPriceKes)}
                          {it.size ? ` · Size ${it.size}` : ""}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-ink">{formatKes(it.lineTotalKes)}</p>
                    </div>
                  ))}
                </div>

                {/* footer: customer + actions */}
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{o.customerName}</p>
                    <p className="truncate text-xs text-muted">{o.customerPhone}</p>
                    {o.customerNotes && (
                      <p className="mt-0.5 truncate text-xs italic text-muted">“{o.customerNotes}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={`https://wa.me/${toWhatsAppDigits(o.customerPhone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-whatsapp px-3 text-xs font-bold text-white"
                    >
                      <WhatsAppIcon className="size-4" /> Chat
                    </a>
                    {o.paymentStatus !== "paid" && (
                      <Button
                        size="sm"
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ id: o.id, status: "paid" })}
                      >
                        {statusMut.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Mark paid
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShoppingCart;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-card p-5 shadow-soft">
      <div className={cn("flex size-11 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-ink">{value}</p>
        <p className="text-xs font-semibold text-muted">{label}</p>
      </div>
    </div>
  );
}
