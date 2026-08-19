import { Check, Pipette, X } from "lucide-react";
import { useState } from "react";
import { COLOR_FAMILIES, colorHex, nearestColorName } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The seller's colour picker: the full named palette, grouped into families,
 * plus a colour wheel for sellers who know their product's actual hex.
 *
 * The wheel does NOT store a hex. It resolves the pick to the nearest name in
 * the palette and stores that. This looks like a limitation and is the whole
 * point: `products.colors` is what the buyer-side colour facet groups on, and a
 * facet over free hex values is 400 one-product filters, which is the same as
 * no filter at all. So the seller gets to express the colour precisely, sees
 * exactly which shared name it landed on, and can override by tapping a
 * different swatch. The compromise is visible rather than silent.
 *
 * Colours already on the product but no longer in the palette (renamed, or
 * typed before the palette existed) are surfaced in their own row so editing an
 * old product doesn't quietly drop them on the next save — same reasoning as
 * the legacy-category and legacy-size handling in the product form.
 *
 * EVERY COLOUR HERE IS A ROLE, not a literal. This panel used to reach for
 * `border-stone-200` and `text-white` directly, which are fixed values and so
 * cannot flip: in dark mode the swatch borders drew a light grey box on a
 * near-black card, and the labels on a selected swatch were white text on
 * dark-mode's lighter teal at about 2.5:1 — legible in the mockup, unreadable
 * on a phone. `border-line` and `text-on-accent` are the same values in light
 * and the right ones in dark (see styles/tokens.css).
 *
 * The two exceptions are deliberate. The ring around a swatch and the tick
 * inside it sit on an ARBITRARY product colour rather than on a themed surface,
 * so they cannot be tokens: the ring keeps a black alpha over light and gains a
 * white one in dark, and the tick stays `mix-blend-difference`, which is what
 * makes it readable on white, on navy, and on everything between.
 */
export function ColorPalettePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelHex, setWheelHex] = useState("#0D9488");

  const known = new Set(COLOR_FAMILIES.flatMap((f) => f.colors.map((c) => c.name)));
  const legacy = selected.filter((c) => !known.has(c));

  const match = nearestColorName(wheelHex);
  const alreadyStocked = match != null && selected.includes(match);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {selected.length
            ? `${selected.length} selected — buyers must pick one before they can order.`
            : "Leave all unselected if this product only comes one way."}
        </p>
        <button
          type="button"
          aria-expanded={wheelOpen}
          onClick={() => setWheelOpen((v) => !v)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-btn border-2 px-3 text-xs font-bold transition-colors",
            wheelOpen
              ? "border-primary bg-primary/5 text-primary"
              : "border-line bg-card text-ink hover:border-primary/50",
          )}
        >
          {wheelOpen ? <X className="size-3.5" /> : <Pipette className="size-3.5" />}
          {wheelOpen ? "Close wheel" : "Colour wheel"}
        </button>
      </div>

      {wheelOpen && (
        <div className="space-y-2 rounded-card border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="color"
                value={wheelHex}
                onChange={(e) => setWheelHex(e.target.value)}
                aria-label="Pick your product's colour"
                className="size-10 cursor-pointer rounded-btn border border-line bg-card p-1"
              />
              Pick your colour
            </label>

            {match && (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  style={{ backgroundColor: colorHex(match) }}
                  className="size-6 shrink-0 rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/20"
                />
                <span className="text-sm text-muted">
                  Closest match: <span className="font-bold text-ink">{match}</span>
                </span>
                <button
                  type="button"
                  disabled={alreadyStocked}
                  onClick={() => onToggle(match)}
                  className="h-9 rounded-btn bg-primary px-3 text-xs font-bold text-on-accent transition-opacity disabled:opacity-40"
                >
                  {alreadyStocked ? "Already added" : `Add ${match}`}
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted">
            We store the closest named colour, not the exact shade, so shoppers filtering for it
            find your product alongside everyone else's.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {COLOR_FAMILIES.map(({ family, colors }) => (
          <div key={family}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              {family}
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map(({ name }) => (
                <Swatch
                  key={name}
                  name={name}
                  on={selected.includes(name)}
                  onClick={() => onToggle(name)}
                />
              ))}
            </div>
          </div>
        ))}

        {legacy.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              Already on this product
            </p>
            <div className="flex flex-wrap gap-2">
              {legacy.map((name) => (
                <Swatch key={name} name={name} on onClick={() => onToggle(name)} />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              These aren't in the palette any more. Untap one to drop it, or leave it as it is.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** One colour chip. The NAME is rendered next to the swatch, not just the
 * swatch: a colour is invisible to a screen reader and Navy vs Blue is a
 * coin-flip at this size. The tick, not the border alone, marks the selection,
 * for the same reason colour must never be the only signal. */
function Swatch({ name, on, onClick }: { name: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-btn border-2 pl-1.5 pr-2.5 text-xs font-semibold transition-colors",
        on
          ? "border-primary bg-primary text-on-accent"
          : "border-line bg-card text-ink hover:border-primary/50",
      )}
    >
      <span
        aria-hidden
        style={{ backgroundColor: colorHex(name) }}
        className="flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/20"
      >
        {on && <Check className="size-3 text-white mix-blend-difference" />}
      </span>
      {name}
    </button>
  );
}
