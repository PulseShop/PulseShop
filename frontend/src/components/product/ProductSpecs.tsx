import { cn } from "@/lib/utils";
import { type SpecRow, pcSpecRows, phoneSpecRows, specNotes } from "@/lib/productSpecs";
import type { Product } from "@/types";

/**
 * Buyer-facing spec sheet for Phone / PC listings — the structured half of the
 * product description. General products carry no specs and render nothing.
 * Everything here comes from the seller's dropdown choices, so it's consistent
 * across every listing (and is exactly what the storefront filters match on),
 * with the free-text "custom mods" note shown underneath as the escape hatch.
 */
export function ProductSpecs({ product }: { product: Product }) {
  let rows: SpecRow[] | null = null;
  if (product.productType === "phone" && product.phoneSpecs) rows = phoneSpecRows(product.phoneSpecs);
  else if (product.productType === "pc" && product.pcSpecs) rows = pcSpecRows(product.pcSpecs);

  const notes = specNotes(product.phoneSpecs, product.pcSpecs);
  if (!rows) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-ink">Specifications</h2>
      <dl className="overflow-hidden rounded-card border border-stone-100">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm",
              i % 2 === 0 ? "bg-stone-50/70" : "bg-card",
            )}
          >
            <dt className="shrink-0 font-medium text-muted">{r.label}</dt>
            <dd className={cn("text-right font-semibold", r.warn ? "text-danger" : "text-ink")}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {notes && (
        <div className="rounded-card bg-stone-50 p-3 text-sm">
          <p className="font-semibold text-ink">Also included / modifications</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed text-ink/80">{notes}</p>
        </div>
      )}
    </section>
  );
}
