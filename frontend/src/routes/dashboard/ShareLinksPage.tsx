import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { shareUrl } from "@/lib/shareLinks";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { ShareChannel, ShareLink } from "@/types";
import { useToasts } from "@/stores/toast";

const CHANNEL_LABEL: Record<ShareChannel, string> = {
  status: "WhatsApp Status",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  other: "Anywhere else",
};

/**
 * Clicks-to-orders, as a percentage.
 *
 * Shown only once a link has been opened at all: 0 clicks and 0 orders is
 * "nobody has seen it yet", which is a different fact from "nobody who saw it
 * bought", and rendering both as 0% conflates them.
 */
function conversion(link: ShareLink): string | null {
  if (link.clickCount === 0) return null;
  return `${Math.round((link.orderCount / link.clickCount) * 100)}%`;
}

/**
 * Share links and what each one earned (migration 0052).
 *
 * The question this page exists to answer is the one no Kenyan social seller
 * can currently answer: which post paid. Everything on it is arranged around
 * that — clicks, orders and PAID revenue side by side per link, so a channel
 * that draws a crowd and sells nothing is visibly different from one that
 * draws four people who all buy.
 *
 * Deliberately read-only apart from copy and delete. Links are created where
 * sharing happens (the share sheet on a product), because a link the seller
 * has to come here and mint first is a link they will not use.
 */
export function ShareLinksPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const linksQ = useQuery({
    queryKey: ["share-links"],
    queryFn: services.shareLinks.listLinks,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => services.shareLinks.deleteLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-links"] });
      push("Link deleted. Orders it already earned keep their credit.", "success");
    },
    onError: () => push("Couldn't delete that link", "danger"),
  });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(code));
      push("Link copied", "success");
    } catch {
      push(`Copy this link: ${shareUrl(code)}`);
    }
  };

  const links = linksQ.data ?? [];
  const totals = links.reduce(
    (acc, l) => ({
      clicks: acc.clicks + l.clickCount,
      orders: acc.orders + l.orderCount,
      revenue: acc.revenue + l.revenueKes,
    }),
    { clicks: 0, orders: 0, revenue: 0 },
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted">
            <Link to="/dashboard" className="hover:text-ink">
              Dashboard
            </Link>{" "}
            / Share links
          </p>
          <h1 className="text-2xl font-extrabold text-ink">Share links</h1>
          <p className="mt-1 text-sm text-muted">
            Every link you share from a product gets a short code. When someone buys after
            tapping it, the sale is credited here.
          </p>
        </div>

        {linksQ.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : linksQ.isError ? (
          <p className="rounded-card border border-line-soft bg-card p-6 text-sm text-muted">
            Couldn't load your links. Check your connection and try again.
          </p>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line-soft bg-card px-6 py-12 text-center">
            <Link2 className="size-8 text-muted" />
            <div>
              <p className="text-base font-bold text-ink">No links yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Open any of your products and use the share button. Post the short link to your
                WhatsApp Status or bio, and what it earns shows up here.
              </p>
            </div>
            <Link
              to="/dashboard/inventory"
              className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Go to your products
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line-soft bg-line-soft">
              <Total label="Taps" value={totals.clicks.toLocaleString()} />
              <Total label="Orders" value={totals.orders.toLocaleString()} />
              <Total label="Paid" value={formatKes(totals.revenue)} />
            </div>

            <div className="flex flex-col gap-3">
              {links.map((link) => {
                const rate = conversion(link);
                return (
                  <div
                    key={link.id}
                    className="rounded-card border border-line-soft bg-card p-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">
                          {link.productName || "Whole shop"}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-muted">
                          {CHANNEL_LABEL[link.channel]}
                          {link.label ? ` · ${link.label}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copy(link.code)}
                          aria-label={`Copy the link for ${link.productName || "your shop"}`}
                          className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-fill-soft hover:text-ink"
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMut.mutate(link.id)}
                          disabled={deleteMut.isPending}
                          aria-label={`Delete the link for ${link.productName || "your shop"}`}
                          className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        >
                          {deleteMut.isPending && deleteMut.variables === link.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 break-all font-mono text-xs font-semibold text-primary">
                      {shareUrl(link.code)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-soft pt-3">
                      <Stat label="taps" value={link.clickCount.toLocaleString()} />
                      <Stat label="orders" value={link.orderCount.toLocaleString()} />
                      <Stat label="paid" value={formatKes(link.revenueKes)} />
                      {rate && (
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2.5 py-1 text-xs font-bold",
                            link.orderCount > 0
                              ? "bg-success/10 text-success"
                              : "bg-fill text-muted",
                          )}
                        >
                          {rate} bought
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3 text-center">
      <p className="text-lg font-extrabold tabular-nums text-ink">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs font-semibold text-muted">
      <span className="text-sm font-extrabold tabular-nums text-ink">{value}</span> {label}
    </span>
  );
}
