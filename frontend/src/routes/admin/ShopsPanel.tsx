import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Store, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { AdminShop, Plan } from "@/types";

const PAGE_SIZE = 20;

const PLANS: { value: Plan | "all"; label: string }[] = [
  { value: "all", label: "All tiers" },
  { value: "explorer", label: "Explorer" },
  { value: "boutique", label: "Boutique" },
  { value: "influencer", label: "Influencer" },
];

const PLAN_LABEL: Record<Plan, string> = {
  explorer: "Explorer",
  boutique: "Boutique",
  influencer: "Influencer",
};

/**
 * The shop register: who is on the platform, on what tier, and whether the tier
 * is buying them anything.
 *
 * WHY THE COUNTS ARE HERE and not a link away. "How many shops" was already on
 * the page as a headline number, which tells the owner the platform is growing
 * and nothing about who is in it. The question that follows a tier list is
 * always the same one — is this shop actually using what it pays for — so the
 * product, order and revenue counts sit on the row rather than behind a click.
 * A shop on Influencer with nothing listed is the row worth finding, and it is
 * only findable if the numbers are next to the tier.
 *
 * THE TIER IS EDITABLE HERE because there is nowhere else it can be. Migration
 * 0041 revoked the seller's UPDATE privilege on merchants.plan on purpose, and
 * billing does not exist yet, so a shop reaches a paid tier when the owner puts
 * it there. Until a payment webhook does that job, this select is the billing
 * system, and pretending otherwise would just mean doing it in psql.
 */
export function ShopsPanel() {
  const [plan, setPlan] = useState<Plan | "all">("all");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [page, setPage] = useState(1);

  // Changing a filter has to reset paging, or narrowing to a tier with three
  // shops while on page 4 shows an empty table that looks like an error.
  const applyPlan = (next: Plan | "all") => {
    setPlan(next);
    setPage(1);
  };
  const applySearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const shopsQ = useQuery({
    queryKey: ["admin-shops", plan, term, page],
    queryFn: () => services.admin.listShops({ plan, search: term, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = shopsQ.data?.total ?? 0;
  const shops = shopsQ.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Shops</h2>
          <p className="mt-0.5 text-xs text-muted">
            {shopsQ.isLoading
              ? "Loading the register…"
              : `${total.toLocaleString()} ${total === 1 ? "shop" : "shops"}${
                  plan === "all" ? " on the platform" : ` on ${PLAN_LABEL[plan]}`
                }`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-btn border border-line p-0.5">
            {PLANS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={plan === p.value}
                onClick={() => applyPlan(p.value)}
                className={cn(
                  "min-h-8 rounded-[10px] px-3 text-xs font-bold transition-colors",
                  plan === p.value ? "bg-primary text-on-accent" : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => applySearch(e.target.value)}
              aria-label="Search shops by name, handle, location or email"
              placeholder="Name, handle, email…"
              className="h-9 w-56 rounded-btn border border-line bg-card pl-8 pr-8 text-sm text-ink outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => applySearch("")}
                className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {shopsQ.isError ? (
        <div className="mt-4">
          <QueryError
            title="Couldn't load the shop register"
            onRetry={() => shopsQ.refetch()}
            retrying={shopsQ.isFetching}
          />
        </div>
      ) : shopsQ.isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : shops.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {term || plan !== "all"
            ? "No shop matches that."
            : "No shops have registered yet."}
        </p>
      ) : (
        <>
          {/* Horizontal scroll rather than hidden columns: this is an internal
              tool on a desktop, and dropping the revenue column on a narrow
              window would hide the number the table exists to show. */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 font-semibold">Shop</th>
                  <th scope="col" className="py-2 font-semibold">Tier</th>
                  <th scope="col" className="py-2 text-right font-semibold">Products</th>
                  <th scope="col" className="py-2 text-right font-semibold">Orders</th>
                  <th scope="col" className="py-2 text-right font-semibold">Gross</th>
                  <th scope="col" className="py-2 text-right font-semibold">Banner</th>
                  <th scope="col" className="py-2 text-right font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <ShopRow key={shop.id} shop={shop} />
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Page {page} of {pageCount}
              </p>
              <div className="flex items-center gap-1">
                <PageButton
                  label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </PageButton>
                <PageButton
                  label="Next page"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </PageButton>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function ShopRow({ shop }: { shop: AdminShop }) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  const setPlan = useMutation({
    mutationFn: (plan: Plan) => services.admin.setShopPlan(shop.id, plan),
    onSuccess: (_data, plan) => {
      push(`${shop.name} moved to ${PLAN_LABEL[plan]}`, "success");
      // The tier list and the plan breakdown on the same screen both change,
      // and so does the shop's own storefront entitlement cache.
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (err: Error) => push(err.message || "Could not change the tier", "danger"),
  });

  return (
    <tr className="border-b border-line-soft last:border-0">
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          {shop.avatarUrl ? (
            <img src={shop.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Store className="size-4 text-primary" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <Link
              to={`/${shop.handle}`}
              className="block truncate font-bold text-ink hover:text-primary hover:underline"
            >
              {shop.name}
            </Link>
            <p className="truncate text-xs text-muted">
              @{shop.handle}
              {shop.email ? ` · ${shop.email}` : ""}
            </p>
          </div>
          {/* A closed or closing shop's tier is still worth seeing, but the
              status changes what the numbers mean, so it is on the row. */}
          {shop.shopStatus !== "open" && (
            <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              {shop.shopStatus}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <label className="sr-only" htmlFor={`plan-${shop.id}`}>
          {`Tier for ${shop.name}`}
        </label>
        <select
          id={`plan-${shop.id}`}
          value={shop.plan}
          disabled={setPlan.isPending}
          onChange={(e) => setPlan.mutate(e.target.value as Plan)}
          className="rounded-btn border border-line bg-card px-2 py-1.5 text-xs font-bold text-ink outline-none focus:border-primary disabled:opacity-60"
        >
          {(["explorer", "boutique", "influencer"] as Plan[]).map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2.5 text-right tabular-nums text-ink">{shop.productCount}</td>
      <td className="py-2.5 text-right tabular-nums text-ink">{shop.orderCount}</td>
      <td className="py-2.5 text-right tabular-nums text-ink">{formatKes(shop.grossKes)}</td>
      <td className="py-2.5 text-right tabular-nums text-muted">
        {shop.bannerCount > 0 ? shop.bannerCount : "—"}
      </td>
      <td className="py-2.5 text-right text-xs text-muted">
        {new Date(shop.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-btn border border-line text-ink transition-colors hover:border-primary/50 disabled:opacity-40 disabled:hover:border-line"
    >
      {children}
    </button>
  );
}
