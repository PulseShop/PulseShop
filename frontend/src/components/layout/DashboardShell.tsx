import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  LayoutDashboard,
  MessageSquare,
  Link2,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { APP_VERSION_LABEL } from "@/lib/version";
import { services } from "@/services";
import { Logo } from "@/components/common/Logo";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { to: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
  { to: "/dashboard/reviews", label: "Reviews", icon: MessageSquare },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/share", label: "Share links", icon: Link2 },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

// The phone tab bar carries the management essentials a seller reaches for away
// from a desk — what they stock, what's been ordered, and their profile — plus
// the overview as home. Reviews and Analytics stay desktop-first (dense charts,
// long tables) and are still reachable from the overview and by direct link.
const mobileNav = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { to: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const merchantQ = useQuery({ queryKey: ["merchant"], queryFn: services.products.getMerchant });
  // Just the pending count for the sidebar badge — not the shopper-side
  // order-history store (that's this device's own placed orders), and not a
  // full order+line-item fetch (that belongs to the Orders page itself).
  const orderCountQ = useQuery({
    queryKey: ["orders-pending-count"],
    queryFn: services.orders.countPendingOrders,
  });
  const orderCount = orderCountQ.data ?? 0;
  const merchant = merchantQ.data;

  return (
    // No data-theme pin here any more. This subtree used to be nailed to light
    // because the dashboard pages carried literal stone/white classes that could
    // not flip; they are roles now, so the shell inherits whatever the shopper —
    // who is the same person as the seller — picked on their device.
    //
    // Unpinning also fixes a split that was visible before any page converted:
    // Radix portals its dialogs into document.body, OUTSIDE this div, so every
    // modal the seller opened rendered in the real theme while the dashboard
    // behind it stayed light.
    <div className="flex h-dvh flex-col overflow-hidden bg-surface lg:block lg:h-auto lg:min-h-dvh lg:overflow-visible">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[230px] flex-col border-r border-line bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo size={36} />
          <div>
            <p className="text-sm font-extrabold leading-tight text-ink">PulseShop</p>
            <p className="text-[11px] text-muted">Merchant Studio</p>
          </div>
        </div>

        {/* Way out of the dashboard: /shop renders the merchant's own
            storefront exactly as a buyer sees it. */}
        <Link
          to="/shop"
          className="group mx-3 mb-2 flex items-center gap-3 rounded-btn border border-line px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
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
                    ? "bg-primary-deep text-on-accent"
                    : "text-muted hover:bg-fill hover:text-ink",
                )
              }
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {label === "Orders" && orderCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-favorite px-1.5 text-[11px] font-bold text-on-accent">
                  {orderCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {merchantQ.isError ? (
          <div className="m-3 flex items-center gap-2 rounded-card bg-danger/5 p-3">
            <AlertTriangle className="size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-danger">Couldn't load your profile</p>
              <button
                type="button"
                onClick={() => merchantQ.refetch()}
                className="text-xs font-bold text-danger underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                Retry
              </button>
            </div>
          </div>
        ) : merchant ? (
          <div className="m-3 flex items-center gap-3 rounded-card bg-fill-soft p-3">
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
        ) : null}

        <p className="px-5 pb-4 text-[11px] font-medium text-muted">{APP_VERSION_LABEL}</p>
      </aside>

      {/* mobile top bar — the sidebar's identity + "view as buyer" collapsed to
          a header, since the phone layout has no room for a rail. It's a static
          row of the app-shell frame (shrink-0), so it stays pinned at the top
          while only the main pane below it scrolls. */}
      <header className="glass-header z-30 flex shrink-0 items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <Logo size={32} />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight text-ink">
              {merchant?.name ?? "PulseShop"}
            </p>
            <p className="text-[11px] text-muted">Merchant Studio</p>
          </div>
        </Link>
        <Link
          to="/shop"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:border-primary/30 hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> View shop
        </Link>
      </header>

      {/* Content renders once. On phones this is the app-shell's one scrolling
          pane (flex-1 overflow-y-auto): it runs full width beneath the static
          header, with a deep floor so the last row scrolls clear of the fixed
          tab bar (see .pb-bottom-bar in tokens.css). On desktop it reverts to
          normal page flow and clears the fixed sidebar rail. */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-bottom-bar lg:ml-[230px] lg:flex-none lg:overflow-visible lg:p-8">
        {children}
      </main>

      {/* mobile bottom nav */}
      <nav className="glass-bar fixed-stable fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="mx-auto flex h-[var(--bottom-bar-h)] max-w-md items-center px-2">
          {mobileNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  "group relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-muted",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full transition-all duration-200",
                      isActive
                        ? "bg-primary/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                        : "group-active:scale-90",
                    )}
                  >
                    <Icon className="size-[21px]" />
                    {label === "Orders" && orderCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-favorite px-1 text-[10px] font-bold text-on-accent ring-2 ring-card/70">
                        {orderCount}
                      </span>
                    )}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
