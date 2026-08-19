import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Printer } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Printable platform reports.
 *
 * WHY window.print() AND NOT A PDF LIBRARY. The browser's own print pipeline
 * produces a PDF with selectable text, working links, real page breaks and the
 * reader's chosen paper size, at zero bundle cost. jsPDF would add ~350KB to
 * every page of the app to produce a worse artefact, and the html2canvas route
 * already in the bundle rasterises — a report you cannot select a figure out of
 * is a screenshot with delusions.
 *
 * The trade is that the reader picks "Save as PDF" in the print dialog rather
 * than getting a file straight away. That is one extra click for a document
 * generated a handful of times a month.
 *
 * The print rules live in tokens.css under @media print: everything outside
 * .report-sheet is hidden, so what prints is this section and nothing else —
 * no sidebar, no buttons, no app chrome.
 */

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
];

export function ReportsPanel() {
  const [days, setDays] = useState(30);

  const statsQ = useQuery({ queryKey: ["platform-stats"], queryFn: () => services.admin.stats() });
  const revenueQ = useQuery({
    queryKey: ["admin-revenue", days],
    queryFn: () => services.admin.revenueSeries(days),
  });
  const topQ = useQuery({
    queryKey: ["admin-top-products", days],
    queryFn: () => services.admin.topProducts(days, 10),
  });
  const billingQ = useQuery({
    queryKey: ["admin-billing-summary"],
    queryFn: () => services.admin.billingSummary(),
  });
  const repeatQ = useQuery({
    queryKey: ["admin-repeat-rate"],
    queryFn: () => services.admin.repeatCustomerRate(90),
  });

  const loading =
    statsQ.isLoading || revenueQ.isLoading || topQ.isLoading || billingQ.isLoading;
  const failed = statsQ.isError || revenueQ.isError || topQ.isError || billingQ.isError;

  const stats = statsQ.data;
  const revenue = revenueQ.data ?? [];
  const top = topQ.data ?? [];
  const billing = billingQ.data;
  const repeat = repeatQ.data;

  const gross = revenue.reduce((n, p) => n + p.grossKes, 0);
  const orders = revenue.reduce((n, p) => n + p.orders, 0);
  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? `Last ${days} days`;

  return (
    <div className="space-y-4">
      {/* The controls. Hidden when printing — see .print-hide in tokens.css. */}
      <section className="print-hide rounded-card bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Platform report</h2>
            <p className="mt-0.5 text-xs text-muted">
              Pick a window, then Print and choose "Save as PDF" as the destination. The document
              below is exactly what prints.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loading || failed}
            className="flex min-h-10 items-center gap-2 rounded-btn bg-primary px-4 text-sm font-bold text-on-accent disabled:opacity-50"
          >
            <Printer className="size-4" aria-hidden />
            Print / Save as PDF
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "min-h-9 rounded-btn px-3 text-xs font-bold transition-colors",
                days === r.days
                  ? "bg-primary text-on-accent"
                  : "border border-line text-muted hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {failed ? (
        <QueryError
          title="Couldn't build the report"
          onRetry={() => {
            statsQ.refetch();
            revenueQ.refetch();
            topQ.refetch();
            billingQ.refetch();
          }}
        />
      ) : loading || !stats || !billing ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <section className="report-sheet rounded-card bg-card p-6 shadow-soft lg:p-8">
          <header className="border-b border-line pb-4">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">
              PulseShop platform report
            </h1>
            <p className="mt-1 text-sm text-muted">
              {rangeLabel} · generated {new Date().toLocaleString()}
            </p>
          </header>

          <ReportBlock title="Marketplace">
            <Figure label="Shops registered" value={stats.shops.total.toLocaleString()} />
            <Figure
              label="Open shops"
              value={stats.shops.open.toLocaleString()}
              note={`${stats.shops.closed + stats.shops.closing} closed or closing`}
            />
            <Figure label="Products listed" value={stats.products.total.toLocaleString()} />
            <Figure
              label="Out of stock"
              value={stats.products.out.toLocaleString()}
              note={`${stats.products.withPhoto} have a photo`}
            />
            <Figure label="Sellers" value={stats.users.sellers.toLocaleString()} />
            <Figure
              label="Buyers"
              value={stats.users.shoppers.toLocaleString()}
              note={`${stats.users.newLast30d} new in 30 days`}
            />
          </ReportBlock>

          <ReportBlock title={`Trade — ${rangeLabel.toLowerCase()}`}>
            <Figure label="Gross order value" value={formatKes(gross)} note="Excludes failed payments" />
            <Figure label="Orders" value={orders.toLocaleString()} />
            <Figure
              label="Shops that sold"
              value={stats.shops.soldLast30d.toLocaleString()}
              note="at least one order in 30 days"
            />
            {repeat && (
              <Figure
                label="Repeat customer rate"
                value={`${repeat.ratePct}%`}
                note={`${repeat.repeatBuyers} of ${repeat.trackedBuyers} signed-in buyers, 90 days`}
              />
            )}
          </ReportBlock>

          {/* The platform's own money, kept apart from the marketplace's. Gross
              order value is what sellers took; this is what PulseShop earned. */}
          <ReportBlock title="Subscriptions">
            <Figure label="Monthly recurring" value={formatKes(billing.mrrKes)} note="from current tiers" />
            <Figure label="Collected, 30 days" value={formatKes(billing.collected30dKes)} />
            <Figure label="Collected, all time" value={formatKes(billing.collectedAllKes)} />
            <Figure
              label="Outstanding"
              value={formatKes(billing.outstandingKes)}
              note={`${billing.overdueCount} overdue`}
            />
            <Figure label="Explorer shops" value={stats.plans.explorer.toLocaleString()} />
            <Figure
              label="Paid shops"
              value={(stats.plans.boutique + stats.plans.influencer).toLocaleString()}
              note={`${stats.plans.boutique} Boutique · ${stats.plans.influencer} Influencer`}
            />
          </ReportBlock>

          {top.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                Best sellers — {rangeLabel.toLowerCase()}
              </h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                    <th scope="col" className="pb-2 pr-3 font-bold">Product</th>
                    <th scope="col" className="pb-2 pr-3 font-bold">Shop</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-bold">Sold</th>
                    <th scope="col" className="pb-2 text-right font-bold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={r.productId} className="border-b border-line-soft last:border-0">
                      <td className="py-2 pr-3 font-semibold text-ink">{r.name}</td>
                      <td className="py-2 pr-3 text-muted">{r.shopName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {r.units.toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums text-ink">
                        {formatKes(r.revenueKes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
            <p>
              {APP_VERSION_LABEL} · Figures come from the live database at generation time. Gross
              order value is what shoppers paid sellers; PulseShop takes no cut of a sale, so
              platform earnings are the Subscriptions block alone.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}

function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums text-ink">{value}</dd>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
