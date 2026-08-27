import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileText,
  Gauge,
  Megaphone,
  Receipt,
  Rocket,
  Settings,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The control room's sections.
 *
 * Ordered by how often the owner needs them, not by category: the dashboard is
 * the landing, promotions and shops are the two things with money and people
 * attached, and settings is the one nobody opens twice a month.
 *
 * `id` is what goes in the URL. Sections are a query parameter rather than
 * nested routes because every one of them is the same page with a different
 * panel — routing them separately would mean seven route entries, seven
 * api/render.ts SEO entries for a page that must never be indexed, and no gain.
 */
export const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "promotions", label: "Promotions", icon: Megaphone },
  { id: "shops", label: "Shops", icon: Store },
  { id: "early-access", label: "Early access", icon: Rocket },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type SectionId = (typeof SECTIONS)[number]["id"];

export const isSectionId = (value: string | null): value is SectionId =>
  SECTIONS.some((s) => s.id === value);

/**
 * Rail on desktop, scrolling chip row on a phone.
 *
 * Two arrangements of one list rather than a collapsing drawer: the control
 * room has seven destinations and a drawer would hide all of them behind a tap
 * to save a strip of screen on a page nobody browses one-handed.
 */
export function ControlSidebar({
  active,
  onSelect,
  counts,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  /** Optional badge per section — an overdue-invoice count is the reason this
   *  exists, because it is the one number that should chase the owner. */
  counts?: Partial<Record<SectionId, number>>;
}) {
  return (
    <>
      {/* Phone: a horizontal rail under the header. */}
      <nav
        aria-label="Control room sections"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={active === id ? "page" : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
              active === id ? "bg-primary text-on-accent" : "bg-card text-muted shadow-soft",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            <Badge count={counts?.[id]} subtle={active === id} />
          </button>
        ))}
      </nav>

      {/* Desktop: a sticky rail. Sticky rather than fixed so it scrolls with a
          short viewport instead of clipping its own last item. */}
      <nav
        aria-label="Control room sections"
        className="hidden w-52 shrink-0 lg:block"
      >
        <div className="sticky top-6 space-y-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={active === id ? "page" : undefined}
              onClick={() => onSelect(id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-btn px-3 py-2.5 text-sm font-semibold transition-colors",
                active === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-fill hover:text-ink",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{label}</span>
              <Badge count={counts?.[id]} />
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

function Badge({ count, subtle }: { count?: number; subtle?: boolean }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
        subtle ? "bg-on-accent/25 text-on-accent" : "bg-danger/12 text-danger",
      )}
    >
      {count}
    </span>
  );
}
