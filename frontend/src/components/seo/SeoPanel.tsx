import { Globe, Share2 } from "lucide-react";
import type { PageSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * The seller-facing "Search & sharing" controls.
 *
 * Two previews, because the two things a seller is editing look nothing alike
 * and neither is visible anywhere else in the product:
 *
 *  - the Google result, which is what decides whether someone searching
 *    "shea butter Kilimani" clicks through;
 *  - the WhatsApp/Instagram link card, which is what their customers actually
 *    see, since that is how PulseShop links travel.
 *
 * Showing both is the point. Sellers have no mental model of a <title> tag, but
 * they have a very clear one of "what my link looks like when I paste it in a
 * group", and the same two fields drive both.
 *
 * These fields are optional by design and the previews render fully when they
 * are blank — lib/seo.ts generates a title and description from the shop's own
 * data. An empty field that 90% of sellers will never fill in is worse than a
 * good default, so the default has to be visibly good.
 */

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

/**
 * Length feedback against what actually renders, not an arbitrary limit.
 *
 * Under `ideal` is fine but thin; over `max` is where the text starts getting
 * cut off in a result. Amber rather than red for "too long": the text still
 * works, it just gets truncated, and blocking a save over it would be wrong.
 */
export function CharCount({
  value,
  ideal,
  max,
}: {
  value: string;
  ideal: number;
  max: number;
}) {
  const n = value.trim().length;
  const state = n === 0 ? "empty" : n > max ? "over" : n < ideal ? "short" : "good";
  return (
    <span
      className={cn(
        "text-xs font-semibold tabular-nums",
        state === "good" && "text-primary",
        state === "over" && "text-amber-600",
        (state === "short" || state === "empty") && "text-muted",
      )}
    >
      {n === 0 ? "using the auto-generated one" : `${n}/${max}`}
      {state === "over" && " — will be cut off"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

/** Roughly where Google truncates. Cosmetic — the real cap lives in lib/seo.ts. */
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

function SearchResultPreview({ seo }: { seo: PageSeo }) {
  let display = seo.canonical;
  try {
    const u = new URL(seo.canonical);
    display = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    /* canonical is always absolute in practice; fall back to the raw string */
  }

  return (
    <div className="rounded-btn border border-stone-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">
        <Globe className="size-3.5" aria-hidden />
        <span className="truncate">{display}</span>
      </div>
      <p className="text-base font-medium leading-snug text-[#1a0dab]">
        {clip(seo.title, 60)}
      </p>
      <p className="mt-0.5 text-sm leading-snug text-stone-600">
        {clip(seo.description, 155) || "No description yet."}
      </p>
    </div>
  );
}

function SharePreview({ seo }: { seo: PageSeo }) {
  return (
    <div className="overflow-hidden rounded-btn border border-stone-200 bg-white">
      {seo.image && (
        <img
          src={seo.image}
          alt=""
          className="h-32 w-full bg-stone-100 object-cover"
          loading="lazy"
        />
      )}
      <div className="p-3">
        <p className="truncate text-sm font-bold text-ink">{clip(seo.title, 65)}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">
          {clip(seo.description, 120) || "No description yet."}
        </p>
      </div>
    </div>
  );
}

export function SeoPreviews({ seo }: { seo: PageSeo }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Globe className="size-3.5" aria-hidden /> In Google
        </p>
        <SearchResultPreview seo={seo} />
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Share2 className="size-3.5" aria-hidden /> Shared on WhatsApp
        </p>
        <SharePreview seo={seo} />
      </div>
    </div>
  );
}
