import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Monitor,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { services } from "@/services";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { to: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const merchantQ = useQuery({ queryKey: ["merchant"], queryFn: services.products.getMerchant });
  // Orders *received* by this merchant that still need action — not the
  // shopper-side order-history store (that's this device's own placed orders).
  const ordersQ = useQuery({ queryKey: ["orders-received"], queryFn: services.orders.listOrders });
  const orderCount = (ordersQ.data ?? []).filter((o) => o.paymentStatus === "pending").length;
  const merchant = merchantQ.data;

  return (
    <>
      {/* small-screen notice */}
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center lg:hidden">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Monitor className="size-8 text-primary" />
        </div>
        <div>
          <p className="text-lg font-extrabold text-ink">Best viewed on desktop</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            The merchant dashboard is designed for screens 1024px and wider. Please open it on a
            larger device.
          </p>
        </div>
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-white"
        >
          <ArrowLeft className="size-4" />
          Go to your shop
        </Link>
      </div>

      <div className="hidden min-h-dvh bg-surface lg:flex">
        {/* sidebar */}
        <aside className="fixed inset-y-0 left-0 flex w-[230px] flex-col border-r border-stone-200 bg-card">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
              <span className="text-lg font-extrabold">P</span>
            </div>
            <div>
              <p className="text-sm font-extrabold leading-tight text-ink">PulseShop</p>
              <p className="text-[11px] text-muted">Merchant Studio</p>
            </div>
          </div>

          {/* Way out of the dashboard: /shop renders the merchant's own
              storefront exactly as a buyer sees it. */}
          <Link
            to="/shop"
            className="group mx-3 mb-2 flex items-center gap-3 rounded-btn border border-stone-200 px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <ArrowLeft className="size-[18px] transition-transform group-hover:-translate-x-0.5" />
            View as buyer
          </Link>

          <nav className="flex-1 space-y-1 px-3 py-2">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-primary-deep text-white"
                      : "text-muted hover:bg-stone-100 hover:text-ink",
                  )
                }
              >
                <Icon className="size-[18px]" />
                <span className="flex-1">{label}</span>
                {label === "Orders" && orderCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-favorite px-1.5 text-[11px] font-bold text-white">
                    {orderCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {merchant && (
            <div className="m-3 flex items-center gap-3 rounded-card bg-stone-50 p-3">
              <img
                src={merchant.avatarUrl}
                alt={merchant.name}
                className="size-10 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{merchant.name}</p>
                <p className="truncate text-xs text-muted">@{merchant.handle}</p>
              </div>
            </div>
          )}

          <p className="px-5 pb-4 text-[11px] font-medium text-muted">PulseShop v22.1539</p>
        </aside>

        <main className="ml-[230px] flex-1 p-8">{children}</main>
      </div>
    </>
  );
}
