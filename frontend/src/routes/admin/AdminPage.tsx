import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import type { GrowthPoint } from "@/types";

/**
 * The owner's control room, at /admindev.
 *
 * READ THIS BEFORE ADDING ANYTHING. This page is not what keeps the numbers
 * private. The browser holds the anon key, so anyone can call the same RPCs
 * this calls; what refuses them is platform_stats() and platform_growth()
 * asserting is_platform_admin() in the database (migration 0047). The
 * `isAdmin` query below only decides whether to render a dashboard or a polite
 * refusal. Never move a check here that belongs there.
 *
 * Being an internal tool is not a reason for it to be ugly, but it is a reason
 * not to give it navigation, SEO or a mobile-first layout. It is deliberately
 * standalone: no MobileShell, no DashboardShell, no bottom nav.
 */
export function AdminPage() {
  const session = useAuth((s) => s.session);
  const [days, setDays] = useState(30);

  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => services.admin.isAdmin() });
  const isAdmin = adminQ.data === true;

  const statsQ = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => services.admin.stats(),
    enabled: isAdmin,
  });

  const growthQ = useQuery({
    queryKey: ["platform-growth", days],
    queryFn: () => services.admin.growth(days),
    enabled: isAdmin,
  });

  if (adminQ.isLoading) {
    return (
      <Gate>
        <Skeleton className="h-8 w-56" />
      </Gate>
    );
  }

  if (!isAdmin) {
    return (
      <Gate>
        <span className="flex size-12 items-center justify-center rounded-full bg-fill">
          {session ? (
            <ShieldAlert className="size-6 text-danger" aria-hidden />
          ) : (
            <Lock className="size-6 text-muted" aria-hidden />
          )}
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          {session ? "Not an owner account" : "Owners only"}
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          {session
            ? "This account isn't on the platform admin list, so there's nothing to show you here."
            : "Sign in with the PulseShop owner account to see platform statistics."}
        </p>
        <Link
          to={session ? "/" : "/login"}
          className="mt-5 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-on-accent"
        >
          {session ? "Back to PulseShop" : "Sign in"}
        </Link>
      </Gate>
    );
  }

  const stats = statsQ.data;

  return (
    <main className="min-h-dvh bg-surface px-4 py-6 lg:px-8">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-ink">Control room</h1>
            <p className="text-xs text-muted">
              {stats
                ? `Updated ${new Date(stats.generatedAt).toLocaleString()}`
                : "Loading platform statistics…"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            statsQ.refetch();
            growthQ.refetch();
          }}
          className="flex min-h-10 items-center gap-2 rounded-btn border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-primary/50"
        >
          <RefreshCw className={cn("size-4", statsQ.isFetching && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </header>

      <div className="mx-auto mt-6 max-w-6xl space-y-6">
        {statsQ.isError ? (
          <QueryError
            title="Couldn't load platform statistics"
            onRetry={() => statsQ.refetch()}
            retrying={statsQ.isFetching}
          />
        ) : !stats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            <section aria-label="Headline numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Shops registered"
                value={stats.shops.total}
                detail={`${stats.shops.open} open · ${stats.shops.closed + stats.shops.closing} closed`}
              />
              <StatTile
                label="Sellers"
                value={stats.users.sellers}
                detail={`${stats.shops.withProducts} have listed stock`}
              />
              <StatTile
                label="Buyers"
                value={stats.users.shoppers}
                detail={`${stats.users.newLast30d} new accounts in 30 days`}
              />
              <StatTile
                label="Products listed"
                value={stats.products.total}
                detail={`${stats.products.out} out of stock`}
              />
              <StatTile
                label="Orders"
                value={stats.orders.total}
                detail={`${stats.orders.last30d} in the last 30 days`}
              />
              <StatTile
                label="Gross order value"
                value={formatKes(stats.orders.grossKes)}
                detail="Excludes failed payments"
              />
              <StatTile
                label="Shops selling"
                value={stats.shops.soldLast30d}
                detail="At least one order in 30 days"
              />
              <StatTile
                label="Products with a photo"
                value={stats.products.withPhoto}
                detail={`of ${stats.products.total} listed`}
              />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Breakdown
                title="Plans"
                caption="Every shop is on Explorer until billing exists."
                rows={[
                  { label: "Explorer", value: stats.plans.explorer },
                  { label: "Boutique", value: stats.plans.boutique },
                  { label: "Influencer", value: stats.plans.influencer },
                ]}
              />
              <Breakdown
                title="Shop status"
                caption="Closing shops are hidden from the marketplace."
                rows={[
                  { label: "Open", value: stats.shops.open },
                  { label: "Closed", value: stats.shops.closed },
                  { label: "Closing", value: stats.shops.closing },
                ]}
              />
            </div>
          </>
        )}

        <GrowthCard
          points={growthQ.data ?? []}
          loading={growthQ.isLoading}
          error={growthQ.isError}
          onRetry={() => growthQ.refetch()}
          days={days}
          onDaysChange={setDays}
        />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------------- */

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 text-center">
      {children}
    </main>
  );
}

/**
 * A headline number. The value is the largest thing in the tile because the
 * label is read once and the number is read every time.
 */
function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="rounded-card bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-ink">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

/**
 * A small part-to-whole list.
 *
 * A bar per row rather than a pie: comparing lengths against a shared baseline
 * is a judgement people make accurately, and comparing angles is not. The bars
 * are one hue at one step because these rows are magnitudes of the same thing,
 * not four different identities that need telling apart.
 */
function Breakdown({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{caption}</p>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3">
            <dt className="truncate text-sm font-medium text-ink">{r.label}</dt>
            <div className="h-2 overflow-hidden rounded-full bg-fill" aria-hidden>
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
            <dd className="text-right text-sm font-bold tabular-nums text-ink">
              {r.value}
              {total > 0 && (
                <span className="ml-1 text-xs font-medium text-muted">
                  {Math.round((r.value / total) * 100)}%
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Growth                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Series colours.
 *
 * NOT the brand teal (#0f766e). That token is tuned for UI surfaces and its
 * chroma is low enough that as a thin chart mark it reads grey. #0d9488 is the
 * next step up the same teal ramp and passes as a data colour in both themes.
 * The pair was validated rather than eyeballed: lightness band, chroma floor,
 * colour-blind separation (worst adjacent deltaE 13.6 deutan, well clear of the
 * floor of 8) and contrast against both surfaces.
 *
 * Dark mode is a separate selection, not an automatic lightening: the dark
 * lightness band is narrower, so only the amber changes step.
 */
const SERIES = {
  sellers: { light: "#0d9488", dark: "#0d9488", label: "Sellers" },
  buyers: { light: "#b45309", dark: "#d97706", label: "Buyers" },
} as const;

const RANGES = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

function GrowthCard({
  points,
  loading,
  error,
  onRetry,
  days,
  onDaysChange,
}: {
  points: GrowthPoint[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Accounts over time</h2>
          <p className="mt-0.5 text-xs text-muted">
            Running totals, so the line only ever goes up. A flat stretch is a quiet week.
          </p>
        </div>
        {/* Filters in one row above the chart, never beside it. */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-btn border border-line p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={days === r.days}
                onClick={() => onDaysChange(r.days)}
                className={cn(
                  "min-h-8 rounded-[10px] px-3 text-xs font-bold transition-colors",
                  days === r.days ? "bg-primary text-on-accent" : "text-muted hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="min-h-8 rounded-btn border border-line px-3 text-xs font-bold text-muted hover:text-ink"
          >
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <QueryError title="Couldn't load the growth curve" onRetry={onRetry} />
        </div>
      ) : loading ? (
        <Skeleton className="mt-4 h-64 w-full" />
      ) : points.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No signups in this window yet.</p>
      ) : showTable ? (
        <GrowthTable points={points} />
      ) : (
        <GrowthChart points={points} />
      )}
    </section>
  );
}

/** The accessible twin of the chart. Always reachable, not a fallback. */
function GrowthTable({ points }: { points: GrowthPoint[] }) {
  // Newest first: the interesting end of a growth table is the current total.
  const rows = [...points].reverse();
  return (
    <div className="mt-4 max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 font-semibold">Day</th>
            <th scope="col" className="py-2 text-right font-semibold">Sellers</th>
            <th scope="col" className="py-2 text-right font-semibold">Buyers</th>
            <th scope="col" className="py-2 text-right font-semibold">New</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.day} className="border-t border-line-soft">
              <td className="py-1.5 text-muted">{p.day}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                {p.sellersTotal}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                {p.shoppersTotal}
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted">
                {p.sellers + p.shoppers > 0 ? `+${p.sellers + p.shoppers}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// padR is sized for the direct labels, not for looks: "1234 sellers" at 11px is
// ~73px, and it has to fit between the last point and the right edge.
const VB = { w: 720, h: 240, padL: 40, padR: 92, padT: 14, padB: 26 };
/** Minimum vertical gap between the two end labels before they read as one. */
const LABEL_MIN_GAP = 14;

/**
 * Two running totals over time.
 *
 * One y-axis, deliberately. Sellers and buyers are the same unit (accounts), so
 * they belong on a shared scale where the gap between the lines is the real
 * gap. A second axis would let any two series be drawn as though they were
 * converging or crossing, which is a picture of the scaling, not the data.
 */
function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { plotW, plotH, max, xOf, yOf } = useMemo(() => {
    const plotW = VB.w - VB.padL - VB.padR;
    const plotH = VB.h - VB.padT - VB.padB;
    const peak = Math.max(1, ...points.map((p) => Math.max(p.sellersTotal, p.shoppersTotal)));
    // Round the ceiling up so the axis lands on readable numbers.
    const step = Math.max(1, Math.ceil(peak / 4));
    const max = step * 4;
    const xOf = (i: number) =>
      VB.padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yOf = (v: number) => VB.padT + plotH - (v / max) * plotH;
    return { plotW, plotH, max, xOf, yOf };
  }, [points]);

  const path = (key: "sellersTotal" | "shoppersTotal") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p[key])}`).join(" ");

  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const last = points[points.length - 1];
  const active = hover != null ? points[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <figure className="mt-4">
      {/* Legend is always present for two series, so identity never rests on
          colour alone for someone who cannot separate the hues. */}
      <figcaption className="flex flex-wrap items-center gap-4">
        {(["sellers", "buyers"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: SERIES[k].light }}
            />
            {SERIES[k].label}
          </span>
        ))}
        {active && (
          <span className="ml-auto text-xs font-semibold tabular-nums text-ink">
            {active.day}: {active.sellersTotal} sellers · {active.shoppersTotal} buyers
          </span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="mt-2 w-full"
        style={{ height: 240 }}
        role="img"
        aria-label={`Account growth over ${points.length} days. Sellers reached ${last.sellersTotal}, buyers ${last.shoppersTotal}.`}
      >
        {/* Recessive grid: it orients the eye and then gets out of the way. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={VB.padL}
              x2={VB.padL + plotW}
              y1={yOf(t)}
              y2={yOf(t)}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={VB.padL - 8}
              y={yOf(t) + 4}
              textAnchor="end"
              className="fill-muted"
              style={{ fontSize: 11 }}
            >
              {Math.round(t)}
            </text>
          </g>
        ))}

        {(["sellersTotal", "shoppersTotal"] as const).map((key) => {
          const colour = key === "sellersTotal" ? SERIES.sellers.light : SERIES.buyers.light;
          return (
            <path
              key={key}
              d={path(key)}
              fill="none"
              stroke={colour}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Direct labels at the live end, so the two lines are identified where
            the eye already is rather than only in the legend.

            When the totals are close the two labels would overlap and read as
            one smudge, which is worse than no label. They get nudged apart just
            far enough to separate; the dots stay on the true values, so nothing
            about the data moves. */}
        {last &&
          (() => {
            const x = xOf(points.length - 1);
            const rows = [
              { key: "s", y: yOf(last.sellersTotal), text: `${last.sellersTotal} sellers`, fill: SERIES.sellers.light },
              { key: "b", y: yOf(last.shoppersTotal), text: `${last.shoppersTotal} buyers`, fill: SERIES.buyers.light },
            ].sort((a, b) => a.y - b.y);
            if (rows[1].y - rows[0].y < LABEL_MIN_GAP) {
              const mid = (rows[0].y + rows[1].y) / 2;
              rows[0].y = mid - LABEL_MIN_GAP / 2;
              rows[1].y = mid + LABEL_MIN_GAP / 2;
            }
            return (
              <>
                <circle cx={x} cy={yOf(last.sellersTotal)} r={4} fill={SERIES.sellers.light} />
                <circle cx={x} cy={yOf(last.shoppersTotal)} r={4} fill={SERIES.buyers.light} />
                {rows.map((r) => (
                  <text
                    key={r.key}
                    x={x + 10}
                    y={r.y + 4}
                    className="fill-ink"
                    style={{ fontSize: 11, fontWeight: 700 }}
                  >
                    {r.text}
                  </text>
                ))}
              </>
            );
          })()}

        {/* Crosshair. Drawn under the hit area so it never eats the pointer. */}
        {active && hover != null && (
          <g pointerEvents="none">
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={VB.padT}
              y2={VB.padT + plotH}
              className="stroke-muted"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            {/* A surface ring keeps the marker readable where the lines cross. */}
            <circle cx={xOf(hover)} cy={yOf(active.sellersTotal)} r={5} fill={SERIES.sellers.light} className="stroke-card" strokeWidth={2} />
            <circle cx={xOf(hover)} cy={yOf(active.shoppersTotal)} r={5} fill={SERIES.buyers.light} className="stroke-card" strokeWidth={2} />
          </g>
        )}

        <rect
          x={VB.padL}
          y={VB.padT}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
    </figure>
  );
}
