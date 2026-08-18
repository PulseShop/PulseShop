import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ProductImage } from "@/components/product/ProductImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";

/**
 * Paid placement, from the seller's side.
 *
 * A promoted product appears in the strip at the top of the marketplace home
 * page. The gate is the shop's plan, and it is enforced in the database
 * (migration 0045: the insert policy calls merchant_can_promote), so this UI
 * only decides what to show — an Explorer shop that forged a request would
 * still be refused by Postgres.
 *
 * `canPromoteHint` is the plan we already loaded on the settings page, used to
 * render the locked state without a second round trip. The authoritative answer
 * comes from canPromote() and overrides it once it lands.
 */
export function PromotionsSection({ canPromoteHint }: { canPromoteHint: boolean }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [productId, setProductId] = useState("");
  const [headline, setHeadline] = useState("");

  const canQ = useQuery({ queryKey: ["can-promote"], queryFn: () => services.promotions.canPromote() });
  const canPromote = canQ.data ?? canPromoteHint;

  const minesQ = useQuery({
    queryKey: ["my-promotions"],
    queryFn: () => services.promotions.listMine(),
    enabled: canPromote,
  });

  // The seller picks from their own catalogue rather than typing an id.
  const productsQ = useQuery({
    queryKey: ["promotable-products"],
    queryFn: () => services.products.listProducts({ pageSize: 50 }),
    enabled: canPromote,
  });

  const createMut = useMutation({
    mutationFn: () => services.promotions.create(productId, headline),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-promotions"] });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      setProductId("");
      setHeadline("");
      push("Promoted — it's live on the home page", "success");
    },
    onError: (e: Error) => push(e.message || "Couldn't promote that product", "danger"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => services.promotions.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-promotions"] });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      push("Promotion removed");
    },
    onError: () => push("Couldn't remove that promotion", "danger"),
  });

  if (!canPromote) {
    return (
      <section className="rounded-card bg-card p-6 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-fill">
            <Megaphone className="size-5 text-muted" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-ink">Promoted placement</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Put one of your products in the featured strip at the top of the PulseShop home page,
              where every shopper lands. Available on Boutique and Influencer — request an upgrade
              above and we'll switch it on.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const promos = minesQ.data ?? [];
  const products = productsQ.data?.items ?? [];
  // A product can only be promoted once (unique constraint in 0045), so the ones
  // already running are dropped from the picker rather than offered and refused.
  const promotedIds = new Set(promos.map((p) => p.productId));
  const available = products.filter((p) => !promotedIds.has(p.id));

  return (
    <section className="rounded-card bg-card p-6 shadow-soft">
      <h2 className="text-lg font-extrabold text-ink">Promoted placement</h2>
      <p className="mt-0.5 text-sm text-muted">
        Featured at the top of the home page, above the marketplace grid.
      </p>

      <div className="mt-4 space-y-3">
        {minesQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : promos.length === 0 ? (
          <p className="text-sm text-muted">Nothing promoted yet.</p>
        ) : (
          promos.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-btn border border-line p-2.5">
              <ProductImage
                src={p.images[0]}
                alt=""
                className="size-12 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{p.headline || p.name}</p>
                <p className="truncate text-xs text-muted">
                  {p.name} · {formatKes(p.priceKes)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Stop promoting ${p.name}`}
                onClick={() => removeMut.mutate(p.id)}
                disabled={removeMut.isPending}
              >
                <Trash2 className="size-4 text-danger" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-btn bg-fill-soft p-3">
        <label className="block">
          <span className="text-sm font-bold text-ink">Promote a product</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">Choose a product…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Banner headline (optional)"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={"Leave blank to use the product's name"}
          maxLength={60}
        />

        <Button
          className="w-full"
          disabled={!productId || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
          Promote
        </Button>
      </div>
    </section>
  );
}
