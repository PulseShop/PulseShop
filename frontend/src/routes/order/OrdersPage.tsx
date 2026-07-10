import { Package } from "lucide-react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { Badge } from "@/components/ui/Badge";
import { formatKes } from "@/lib/currency";
import { useOrderHistory } from "@/stores/orderHistory";
import { useShopHome } from "@/stores/shop";

export function OrdersPage() {
  const orders = useOrderHistory((s) => s.orders);
  const home = useShopHome();

  return (
    <MobileShell homeTo={home}>
      <header className="px-4 pt-5">
        <h1 className="text-xl font-extrabold text-ink">Orders</h1>
        <p className="text-sm text-muted">
          {orders.length} {orders.length === 1 ? "order" : "orders"} placed
        </p>
      </header>

      <section className="space-y-3 px-4 py-4">
        {orders.length === 0 ? (
          <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
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
          orders.map((o) => (
            <div key={o.reference} className="flex gap-3 rounded-card bg-card p-3 shadow-soft">
              <img src={o.image} alt={o.productName} className="size-16 rounded-xl object-cover" />
              <div className="flex flex-1 flex-col justify-between py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{o.productName}</p>
                    <p className="text-xs text-muted">
                      {o.size ? `Size ${o.size} · ` : ""}Qty {o.qty} ·{" "}
                      {new Date(o.placedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={o.paymentMethod ? "success" : "primary"}>
                    {o.paymentMethod ? "Paid" : "Sent"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">{o.reference}</span>
                  <span className="text-sm font-extrabold text-ink">{formatKes(o.totalKes)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </MobileShell>
  );
}
