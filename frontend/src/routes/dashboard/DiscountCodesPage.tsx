import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { DiscountCodeInput } from "@/services";
import type { DiscountCode } from "@/types";
import { useToasts } from "@/stores/toast";

const PERCENT_PRESETS = [5, 10, 15, 20, 25];
const DURATION_PRESETS = [
  { label: "7 days", days: 7 },
  { label: "21 days", days: 21 },
  { label: "1 month", days: 30 },
] as const;

function status(code: DiscountCode): { label: string; tone: string } {
  const now = Date.now();
  if (!code.active) return { label: "Inactive", tone: "bg-stone-100 text-muted" };
  if (now > new Date(code.expiresAt).getTime()) return { label: "Expired", tone: "bg-stone-100 text-muted" };
  if (now < new Date(code.startsAt).getTime()) return { label: "Scheduled", tone: "bg-primary/10 text-primary" };
  if (code.maxRedemptions != null && code.redemptionCount >= code.maxRedemptions) {
    return { label: "Fully redeemed", tone: "bg-warning/10 text-warning" };
  }
  return { label: "Active", tone: "bg-success/10 text-success" };
}

/**
 * Seller-managed discount codes (migration 0035). Editing is deliberately
 * out of scope here — the fields that matter (percent, dates, cap) are cheap
 * to get wrong and cheap to replace, so the only actions are create,
 * deactivate/reactivate, and delete. A seller who wants different terms
 * creates a new code rather than mutating one that may already be in a
 * buyer's hands.
 */
export function DiscountCodesPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<DiscountCode | null>(null);

  const codesQ = useQuery({ queryKey: ["discount-codes"], queryFn: services.discounts.listCodes });
  const productsQ = useQuery({
    queryKey: ["reviews-product-options"],
    queryFn: () => services.products.listProducts({ page: 1, pageSize: 200 }),
  });
  const productNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQ.data?.items ?? []) m.set(p.id, p.name);
    return m;
  }, [productsQ.data]);

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      services.discounts.updateCode(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-codes"] }),
    onError: () => push("Couldn't update that code", "danger"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => services.discounts.deleteCode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-codes"] });
      push("Discount code deleted", "success");
      setDeleting(null);
    },
    onError: () => push("Couldn't delete that code", "danger"),
  });

  const codes = codesQ.data ?? [];

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted">
              <Link to="/dashboard/inventory" className="hover:text-ink">
                Dashboard / Inventory
              </Link>{" "}
              / Discount codes
            </p>
            <h1 className="text-2xl font-extrabold text-ink">Discount codes</h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create code
          </Button>
        </div>

        {codesQ.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : codes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-10 text-center shadow-soft">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Tag className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-ink">No discount codes yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted">
                Create a code buyers can apply at checkout — for your whole catalogue or specific
                products.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create your first code
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {codes.map((code) => {
              const s = status(code);
              return (
                <li key={code.id} className="rounded-card bg-card p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-btn bg-ink px-2.5 py-1 font-mono text-sm font-bold text-white">
                          {code.code}
                        </span>
                        <span className="text-sm font-bold text-primary">{code.percentOff}% off</span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", s.tone)}>
                          {s.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        {code.appliesTo === "all"
                          ? "All products"
                          : `${code.productIds.length} product${code.productIds.length === 1 ? "" : "s"}`}
                        {code.appliesTo === "selected" && code.productIds.length > 0 && (
                          <span className="text-muted/70">
                            {" "}
                            ({code.productIds.slice(0, 3).map((id) => productNames.get(id) ?? "…").join(", ")}
                            {code.productIds.length > 3 ? ", …" : ""})
                          </span>
                        )}
                        {" · "}
                        Expires {new Date(code.expiresAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}
                        {code.redemptionCount} used{code.maxRedemptions != null ? ` / ${code.maxRedemptions}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMut.mutate({ id: code.id, active: !code.active })}
                        disabled={toggleMut.isPending}
                        className="rounded-btn border-2 border-stone-200 px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        {code.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        aria-label="Delete code"
                        onClick={() => setDeleting(code)}
                        className="flex size-9 items-center justify-center rounded-btn text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateCodeModal open={createOpen} onOpenChange={setCreateOpen} />

      <Modal
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this code?"
        description={
          deleting
            ? `"${deleting.code}" will stop working immediately. Buyers who already used it keep their order.`
            : undefined
        }
        className="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() => deleting && deleteMut.mutate(deleting.id)}
          >
            {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </Modal>
    </DashboardShell>
  );
}

function CreateCodeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);

  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState(10);
  const [durationDays, setDurationDays] = useState<number | "custom">(7);
  const [customExpiry, setCustomExpiry] = useState("");
  const [appliesTo, setAppliesTo] = useState<"all" | "selected">("all");
  const [productIds, setProductIds] = useState<Set<string>>(new Set());
  const [productFilter, setProductFilter] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
    setPercentOff(10);
    setDurationDays(7);
    setCustomExpiry("");
    setAppliesTo("all");
    setProductIds(new Set());
    setProductFilter("");
    setMaxRedemptions("");
  }, [open]);

  const productsQ = useQuery({
    queryKey: ["reviews-product-options"],
    queryFn: () => services.products.listProducts({ page: 1, pageSize: 200 }),
    enabled: open && appliesTo === "selected",
  });
  const filteredProducts = (productsQ.data?.items ?? []).filter((p) =>
    p.name.toLowerCase().includes(productFilter.trim().toLowerCase()),
  );

  const codeError =
    code.trim().length > 0 && (code.trim().length < 4 || code.trim().length > 24)
      ? "4–24 characters"
      : null;
  const canSubmit =
    code.trim().length >= 4 &&
    code.trim().length <= 24 &&
    percentOff >= 1 &&
    percentOff <= 90 &&
    (durationDays !== "custom" || Boolean(customExpiry)) &&
    (appliesTo === "all" || productIds.size > 0);

  const createMut = useMutation({
    mutationFn: (input: DiscountCodeInput) => services.discounts.createCode(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-codes"] });
      push("Discount code created", "success");
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        push("You already have a code with that name", "danger");
      } else {
        push("Couldn't create that code", "danger");
      }
    },
  });

  const submit = () => {
    if (!canSubmit) return;
    const expiresAt =
      durationDays === "custom"
        ? new Date(`${customExpiry}T23:59:59`).toISOString()
        : new Date(Date.now() + durationDays * 86_400_000).toISOString();

    createMut.mutate({
      code: code.trim(),
      percentOff,
      expiresAt,
      appliesTo,
      productIds: appliesTo === "selected" ? [...productIds] : undefined,
      maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create a discount code"
      description="Buyers apply this at checkout. It never stacks with a product's own markdown — the better discount wins."
      className="max-w-lg"
    >
      <div className="space-y-5">
        {/* `name` is load-bearing, not decoration: ui/Input derives the
            label's htmlFor (and the input's id) from name/id, so omitting it
            leaves the label unassociated. */}
        <Input
          label="Code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
          placeholder="SALE10"
          maxLength={24}
          error={codeError ?? undefined}
        />

        <div>
          <p className="text-sm font-semibold text-ink">Percent off</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PERCENT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={percentOff === p}
                onClick={() => setPercentOff(p)}
                className={cn(
                  "h-10 min-w-14 rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                  percentOff === p
                    ? "border-primary bg-primary text-white"
                    : "border-stone-200 bg-card text-ink hover:border-primary/50",
                )}
              >
                {p}%
              </button>
            ))}
            <div className="flex h-10 items-center gap-1 rounded-btn border-2 border-stone-200 px-3">
              <input
                type="number"
                min={1}
                max={90}
                value={percentOff}
                onChange={(e) => setPercentOff(Math.min(90, Math.max(1, Number(e.target.value) || 0)))}
                className="w-12 bg-transparent text-sm font-semibold text-ink outline-none"
                aria-label="Custom percent off"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Duration</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((d) => (
              <button
                key={d.days}
                type="button"
                aria-pressed={durationDays === d.days}
                onClick={() => setDurationDays(d.days)}
                className={cn(
                  "h-10 rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                  durationDays === d.days
                    ? "border-primary bg-primary text-white"
                    : "border-stone-200 bg-card text-ink hover:border-primary/50",
                )}
              >
                {d.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={durationDays === "custom"}
              onClick={() => setDurationDays("custom")}
              className={cn(
                "h-10 rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                durationDays === "custom"
                  ? "border-primary bg-primary text-white"
                  : "border-stone-200 bg-card text-ink hover:border-primary/50",
              )}
            >
              Custom date
            </button>
            {durationDays === "custom" && (
              <input
                type="date"
                value={customExpiry}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCustomExpiry(e.target.value)}
                className="h-10 rounded-btn border-2 border-stone-200 px-3 text-sm font-semibold text-ink outline-none focus:border-primary"
              />
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink">Applies to</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { value: "all", label: "All products" },
                { value: "selected", label: "Selected products" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={appliesTo === opt.value}
                onClick={() => setAppliesTo(opt.value)}
                className={cn(
                  "h-10 rounded-btn border-2 px-3 text-sm font-semibold transition-colors",
                  appliesTo === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-stone-200 text-ink hover:border-primary/50",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {appliesTo === "selected" && (
            <div className="mt-3 space-y-2">
              <input
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
                className="h-9 w-full rounded-btn border border-stone-200 bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-card border border-stone-100 p-2">
                {productsQ.isLoading ? (
                  <p className="p-2 text-sm text-muted">Loading products…</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="p-2 text-sm text-muted">No products match.</p>
                ) : (
                  filteredProducts.map((p) => {
                    const checked = productIds.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setProductIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              return next;
                            })
                          }
                          className="size-4 accent-primary"
                        />
                        <ProductImage
                          src={p.images[0]}
                          alt=""
                          className="size-7 rounded-md object-cover"
                        />
                        <span className="truncate text-sm text-ink">{p.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted">{productIds.size} selected</p>
            </div>
          )}
        </div>

        <Input
          label="Max redemptions (optional)"
          name="maxRedemptions"
          type="number"
          min={1}
          value={maxRedemptions}
          onChange={(e) => setMaxRedemptions(e.target.value)}
          placeholder="Unlimited"
        />
        <p className="-mt-3 text-xs text-muted">
          Every code also allows only one redemption per buyer, regardless of this cap.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || createMut.isPending} onClick={submit}>
            {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Create code
          </Button>
        </div>
      </div>
    </Modal>
  );
}
