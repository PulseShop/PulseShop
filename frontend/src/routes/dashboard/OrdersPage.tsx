import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, Package, ShoppingCart } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { LOCAL_TZ as TZ } from "@/lib/timezone";
import { variantLabel } from "@/lib/variant";
import { toWhatsAppDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { MerchantOrder, OrderChannel, Paged, PaymentStatus } from "@/types";
import { useToasts } from "@/stores/toast";

const PAGE_SIZE = 20;

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

  /**
   * Paged, newest first. This list grows for the life of the shop — it used to
   * fetch every order ever received, with every line item nested, on each visit.
   */
  const ordersQ = useInfiniteQuery({
    queryKey: ["orders-received"],
    queryFn: ({ pageParam }) =>
      services.orders.listOrders({ page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
  });

  const orders = ordersQ.data?.pages.flatMap((p) => p.items) ?? [];

  /**
   * The three stat cards count *all* orders, not the pages loaded so far, so
   * they have to be a server-side aggregate. merchant_analytics already returns
   * exactly these three numbers, and react-query shares the cached result with
   * the analytics dashboard rather than issuing a second query for them.
   */
  const statsQ = useQuery({
    queryKey: ["analytics", TZ],
    queryFn: () => services.analytics.getAnalytics(TZ, 7),
  });

  const stats = {
    total: statsQ.data?.orderCount ?? 0,
    paid: statsQ.data?.paidCount ?? 0,
    pending: statsQ.data?.pendingCount ?? 0,
  };

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PaymentStatus }) =>
      services.orders.updateOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["orders-received"] });
      const prev = qc.getQueryData<InfiniteData<Paged<MerchantOrder>>>(["orders-received"]);
      qc.setQueryData<InfiniteData<Paged<MerchantOrder>>>(["orders-received"], (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((o) =>
                  o.id === id ? { ...o, paymentStatus: status } : o,
                ),
              })),
            }
          : old,
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
      // The paid/pending stat cards are a server aggregate, so they move too.
      qc.invalidateQueries({ queryKey: ["analytics"] });
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
          <QueryError
            title="Couldn't load orders"
            onRetry={() => ordersQ.refetch()}
            retrying={ordersQ.isFetching}
          />
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
                    {o.discountCode && o.discountKes > 0 && (
                      <p className="text-xs font-semibold text-success">
                        {o.discountCode} · −{formatKes(o.discountKes)}
                      </p>
                    )}
                    {o.paymentMethod && (
                      <p className="text-xs font-medium text-muted uppercase">{o.paymentMethod}</p>
                    )}
                  </div>
                </div>

                {/* items */}
                <div className="mt-4 space-y-2 border-y border-stone-100 py-3">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <ProductImage src={it.image} alt="" className="size-10 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{it.productName}</p>
                        <p className="text-xs text-muted">
                          {it.qty} × {formatKes(it.unitPriceKes)}
                          {variantLabel(it.size, it.color) ? ` · ${variantLabel(it.size, it.color)}` : ""}
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

            {ordersQ.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => ordersQ.fetchNextPage()}
                  disabled={ordersQ.isFetchingNextPage}
                >
                  {ordersQ.isFetchingNextPage ? "Loading…" : "Load more orders"}
                </Button>
              </div>
            )}
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
