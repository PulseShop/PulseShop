import { Check } from "lucide-react";
import { colorHex } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Colour picker for the buyer. Mirrors SizeSelector's radiogroup semantics.
 *
 * The swatch alone is not the control: the colour NAME is rendered beside it,
 * because a swatch is invisible to a screen reader, indistinguishable to a
 * colour-blind shopper, and ambiguous between (say) Navy and Blue at thumbnail
 * size. The tick mark, not just the border, is what marks the selection for the
 * same reason — colour must never be the only signal.
 */
export function ColorSelector({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select colour">
      {colors.map((color) => {
        const active = color === value;
        const hex = colorHex(color);
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(color)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-btn border-2 pl-2 pr-3 text-sm font-semibold transition-colors",
              active
                ? "border-primary bg-primary text-on-accent"
                : "border-line bg-card text-ink hover:border-primary/50",
            )}
          >
            <span
              aria-hidden
              style={{ backgroundColor: hex }}
              className="flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/15"
            >
              {active && <Check className="size-3.5 text-white mix-blend-difference" />}
            </span>
            {color}
          </button>
        );
      })}
    </div>
  );
}
