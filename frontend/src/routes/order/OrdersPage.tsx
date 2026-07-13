import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { QueryError } from "@/components/common/QueryError";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { ProductImage } from "@/components/product/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { formatKes } from "@/lib/currency";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useOrderHistory } from "@/stores/orderHistory";
import { useShopHome } from "@/stores/shop";

/** One rendered line — a single product within an order. */
interface OrderCard {
  key: string;
  reference: string;
  productName: string;
  image: string;
  size: string | null;
  qty: number;
  lineTotalKes: number;
  paid: boolean;
  placedAt: string;
}

export function OrdersPage() {
  const session = useAuth((s) => s.session);
  const localOrders = useOrderHistory((s) => s.orders);
  const home = useShopHome();

  // Signed-in shoppers get their authoritative, cross-device order history from
  // the DB (RLS-scoped to their own customer_id — never anyone else's). Guests
  // fall back to this device's local history, keyed by the secret access token
  // saved at checkout. A signed-in user still sees any guest orders they placed
  // before logging in (those live only locally), merged in by reference.
  const dbQ = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => services.orders.listMyOrders(),
    enabled: Boolean(session),
  });

  const dbCards: OrderCard[] = (dbQ.data ?? []).flatMap((o) =>
    o.items.map((it, idx) => ({
      key: `${o.reference}-${it.productName}-${it.size ?? "one"}-${idx}`,
      reference: o.reference,
      productName: it.productName,
      image: it.image,
      size: it.size,
      qty: it.qty,
      lineTotalKes: it.lineTotalKes,
      paid: o.paymentStatus === "paid",
      placedAt: o.placedAt,
    })),
  );

  const dbRefs = new Set((dbQ.data ?? []).map((o) => o.reference));
  const localCards: OrderCard[] = localOrders
    .filter((o) => !dbRefs.has(o.reference))
    .map((o) => ({
      key: `${o.reference}-${o.productId}-${o.size ?? "one"}`,
      reference: o.reference,
      productName: o.productName,
      image: o.image,
      size: o.size,
      qty: o.qty,
      lineTotalKes: o.totalKes,
      paid: Boolean(o.paymentMethod),
      placedAt: o.placedAt,
    }));

  const cards = [...dbCards, ...localCards].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
  );
  const orderCount = new Set(cards.map((c) => c.reference)).size;

  return (
    <MobileShell homeTo={home} wide>
      <header className="pt-safe flex items-center justify-between px-4 lg:px-6">
        <div>
          <h1 className="text-xl font-extrabold text-ink lg:text-2xl">Orders</h1>
          <p className="text-sm text-muted">
            {orderCount} {orderCount === 1 ? "order" : "orders"} placed
          </p>
        </div>
        <DesktopQuickNav />
      </header>

      <section className="space-y-3 px-4 py-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-6 xl:grid-cols-3">
        {/* A failed history fetch must not read as "you have no orders". Any
            local guest orders still render underneath — this only says the
            server-side history couldn't be reached. */}
        {session && dbQ.isError && (
          <div className="lg:col-span-full">
            <QueryError
              title="Couldn't load your order history"
              message="Orders placed on this device are still shown below."
              onRetry={() => dbQ.refetch()}
              retrying={dbQ.isFetching}
            />
          </div>
        )}

        {cards.length === 0 && !(session && dbQ.isError) ? (
          <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center lg:col-span-full">
            <div className="flex size-20 items-center justify-center rounded-full bg-card shadow-soft">
              <Package className="size-9 text-stone-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">No orders yet</p>
              <p className="mt-1 text-sm text-muted">Your orders will show up here.</p>
            </div>
            <Link
              to={home}
              className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft"
            >
              Browse products
            </Link>
          </div>
        ) : (
          cards.map((c) => (
            // A cart checkout records one card per line item, all sharing the
            // same order reference — key on the line, not just the order.
            <div key={c.key} className="flex gap-3 rounded-card bg-card p-3 shadow-soft">
              <ProductImage src={c.image} alt={c.productName} className="size-16 rounded-xl object-cover" />
              <div className="flex flex-1 flex-col justify-between py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{c.productName}</p>
                    <p className="text-xs text-muted">
                      {c.size ? `Size ${c.size} · ` : ""}Qty {c.qty} ·{" "}
                      {new Date(c.placedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={c.paid ? "success" : "primary"}>{c.paid ? "Paid" : "Sent"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">{c.reference}</span>
                  <span className="text-sm font-extrabold text-ink">{formatKes(c.lineTotalKes)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </MobileShell>
  );
}
