import { useEffect, useState } from "react";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * A price BAND, not a ceiling.
 *
 * The filter this replaces was a single slider labelled "under X". That answers
 * one question — how little am I willing to spend — and a shopper who wants the
 * KES 3,000 to 5,000 shelf has no way to ask for it: dragging the ceiling to
 * 5,000 still buries them under every phone case on the platform. Both ends are
 * now real, and either can be left alone.
 *
 * TWO THUMBS, ONE TRACK. Two range inputs stacked on the same track rather than
 * a drag library. The upper one is transparent to the pointer except at its
 * thumb (`pointer-events-none` on the input, restored on the thumb itself), so
 * a click anywhere on the track goes to the lower input and the two never fight
 * over the same pixel. They also cannot cross: each clamps against the other, so
 * an inverted range — which would silently match nothing — is unreachable
 * rather than merely discouraged.
 *
 * THE NUMBER FIELDS ARE NOT DECORATION. A slider over a range like 0 to 250,000
 * cannot express "exactly 4,000" with a thumb on a phone, so the same two values
 * are typeable. They commit on blur and on Enter rather than per keystroke: a
 * partially-typed "4" is not a request to see everything under four shillings.
 */
export function PriceRangeFilter({
  floor,
  ceiling,
  min,
  max,
  onChange,
}: {
  /** Cheapest and dearest product in scope, from getFacets(). */
  floor: number;
  ceiling: number;
  /** Current selection. Null at either end means "no bound there". */
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
}) {
  // A one-shilling span (or a broken one) has nothing to drag along.
  const span = ceiling - floor;
  const lo = min ?? floor;
  const hi = max ?? ceiling;

  const commit = (nextLo: number, nextHi: number) =>
    onChange({
      // Null when a thumb is parked at its end, so "everything" stays an
      // absent filter rather than a bound that happens to match everything.
      // That keeps the applied-filter chips honest and the query key stable.
      min: nextLo <= floor ? null : nextLo,
      max: nextHi >= ceiling ? null : nextHi,
    });

  if (span <= 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Price</h2>
        {(min !== null || max !== null) && (
          <button
            type="button"
            onClick={() => onChange({ min: null, max: null })}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-muted">
        {formatKes(lo)} to {formatKes(hi)}
      </p>

      {/* The track. Height comes from the wrapper, not the inputs, so both
          sliders sit on exactly the same line whatever the browser's native
          thumb size is. */}
      <div className="relative mt-3 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill" />
        {/* The selected span, drawn between the thumbs. */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{
            left: `${((lo - floor) / span) * 100}%`,
            right: `${100 - ((hi - floor) / span) * 100}%`,
          }}
          aria-hidden
        />
        <input
          type="range"
          aria-label="Minimum price"
          min={floor}
          max={ceiling}
          value={lo}
          onChange={(e) => commit(Math.min(Number(e.target.value), hi), hi)}
          className="range-thumb absolute inset-x-0 top-0 h-5 w-full"
        />
        <input
          type="range"
          aria-label="Maximum price"
          min={floor}
          max={ceiling}
          value={hi}
          onChange={(e) => commit(lo, Math.max(Number(e.target.value), lo))}
          className="range-thumb pointer-events-none absolute inset-x-0 top-0 h-5 w-full"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <PriceField
          label="Min"
          value={min}
          placeholder={floor}
          onCommit={(v) => commit(clamp(v ?? floor, floor, hi), hi)}
        />
        <span className="text-xs text-muted" aria-hidden>
          to
        </span>
        <PriceField
          label="Max"
          value={max}
          placeholder={ceiling}
          onCommit={(v) => commit(lo, clamp(v ?? ceiling, lo, ceiling))}
        />
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * One end of the range, typed.
 *
 * Holds its own draft while the field has focus so a half-typed number is not
 * fed to the query on every keystroke, and re-syncs when the value changes from
 * outside (a slider drag, or "Clear all").
 */
function PriceField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: number | null;
  placeholder: number;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) onCommit(Math.round(n));
    else setDraft(value === null ? "" : String(value));
  };

  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{`${label} price`}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={draft}
        placeholder={String(placeholder)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "h-10 w-full rounded-btn border border-line bg-card px-2.5 text-sm font-semibold text-ink",
          "outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
          // The spinners are 20px of dead width on a field this narrow.
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
      />
    </label>
  );
}
