import { cn } from "@/lib/utils";

export function SizeSelector({
  sizes,
  value,
  onChange,
}: {
  sizes: string[];
  value: string | null;
  onChange: (size: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select size">
      {sizes.map((size) => {
        const active = size === value;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(size)}
            className={cn(
              "flex h-10 min-w-12 items-center justify-center rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
              active
                ? "border-primary bg-primary text-on-accent"
                : "border-line bg-card text-ink hover:border-primary/50",
            )}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
