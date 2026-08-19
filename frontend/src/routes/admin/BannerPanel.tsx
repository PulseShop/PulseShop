import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pause, Play, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { AdminPlacement, AdminProductHit, PlacementInput } from "@/types";

/**
 * Paid placement on the marketplace banner: who bought a slot, what they paid,
 * and when it stops.
 *
 * WHAT THIS IS FOR. The strip at the top of the front page is the platform's
 * only inventory. Migration 0046 made the lower half of it unsellable on
 * purpose — one product from every registered shop, rotated hourly — and this
 * manages the half above it, which is bought. Both halves ship together and the
 * paid one is labelled as paid on the storefront; see PromotedStrip.
 *
 * WHY THE OWNER DOES THIS BY HAND. There is no payment gateway. A seller pays
 * out of band and the owner records the slot here, which is why `amount` and
 * `note` exist at all: they are the only record that money changed hands, and
 * without them "who paid for this" is a WhatsApp archaeology exercise three
 * weeks later. When billing lands, a webhook writes the same rows and this
 * screen becomes the place you go to correct or cancel one, not the only way in.
 *
 * WHY IT IS NOT SELF-SERVE. A seller has no INSERT privilege on
 * banner_placements at all (migration 0048), so a shop cannot put itself on the
 * front page by any path, including a plan upgrade. That is the mistake 0045
 * made and 0046 reverted: an entitlement that says "paid" while nothing takes
 * payment is just a feature the higher tiers get free.
 */
export function BannerPanel() {
  const [editing, setEditing] = useState<AdminPlacement | null>(null);
  const [adding, setAdding] = useState(false);

  const placementsQ = useQuery({
    queryKey: ["admin-placements"],
    queryFn: () => services.admin.listPlacements(),
  });

  const placements = placementsQ.data ?? [];
  const liveCount = placements.filter((p) => p.live).length;

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Megaphone className="size-4 text-warning" aria-hidden />
            Banner ads
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Paid slots at the top of the marketplace. {liveCount} running of {placements.length}{" "}
            booked.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Place an ad
        </Button>
      </div>

      {placementsQ.isError ? (
        <div className="mt-4">
          <QueryError
            title="Couldn't load the banner"
            onRetry={() => placementsQ.refetch()}
            retrying={placementsQ.isFetching}
          />
        </div>
      ) : placementsQ.isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : placements.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nobody has bought a slot yet. The banner is showing the free rotation only, which is the
          intended resting state.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {placements.map((p) => (
            <PlacementRow key={p.id} placement={p} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}

      <PlacementDialog
        open={adding || editing !== null}
        placement={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function PlacementRow({
  placement,
  onEdit,
}: {
  placement: AdminPlacement;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-placements"] });
    // The public banner reads a different query; without this the front page
    // keeps showing an ad that was just paused until its cache expires.
    queryClient.invalidateQueries({ queryKey: ["banner-placements"] });
    queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
  };

  const toggle = useMutation({
    mutationFn: () =>
      services.admin.savePlacement({
        id: placement.id,
        productId: placement.productId,
        headline: placement.headline,
        startsAt: placement.startsAt,
        endsAt: placement.endsAt,
        active: !placement.active,
        amountKes: placement.amountKes,
        note: placement.note,
      }),
    onSuccess: () => {
      push(placement.active ? "Ad paused" : "Ad resumed", "success");
      invalidate();
    },
    onError: (err: Error) => push(err.message || "Could not update the ad", "danger"),
  });

  const remove = useMutation({
    mutationFn: () => services.admin.deletePlacement(placement.id),
    onSuccess: () => {
      push("Ad removed", "success");
      setConfirmingDelete(false);
      invalidate();
    },
    onError: (err: Error) => push(err.message || "Could not remove the ad", "danger"),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card border border-line p-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-fill">
        {placement.productImage && (
          <img src={placement.productImage} alt="" className="size-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-bold text-ink">
            {placement.headline?.trim() || placement.productName}
          </p>
          <StatusPill placement={placement} />
        </div>
        <p className="truncate text-xs text-muted">
          {placement.shopName} · {placement.productName} · {formatKes(placement.priceKes)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {new Date(placement.startsAt).toLocaleDateString()}
          {" to "}
          {placement.endsAt ? new Date(placement.endsAt).toLocaleDateString() : "no end date"}
          {placement.amountKes !== null && ` · paid ${formatKes(placement.amountKes)}`}
          {placement.note && ` · ${placement.note}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          label={placement.active ? "Pause this ad" : "Resume this ad"}
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
        >
          {placement.active ? <Pause className="size-4" /> : <Play className="size-4" />}
        </IconButton>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-btn border border-line px-3 py-1.5 text-xs font-bold text-ink hover:border-primary/50"
        >
          Edit
        </button>
        <IconButton
          label="Remove this ad"
          onClick={() => setConfirmingDelete(true)}
          className="text-danger hover:border-danger/50"
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      {/* A placement is money someone paid, so removing one asks first. */}
      <Modal
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Remove this ad?"
        description={`${placement.shopName} paid for this slot. Removing it takes the product off the banner immediately and cannot be undone.`}
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink"
          >
            Keep it
          </button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        </div>
      </Modal>
    </li>
  );
}

/**
 * Why an ad is or is not on the front page.
 *
 * Four states, not two, because "not showing" has four different fixes: resume
 * it, wait, extend it, or tell the seller their product sold out. A single
 * "inactive" badge would send the owner to the wrong one.
 */
function StatusPill({ placement }: { placement: AdminPlacement }) {
  const now = Date.now();
  const [tone, label] = !placement.active
    ? (["muted", "Paused"] as const)
    : placement.endsAt !== null && new Date(placement.endsAt).getTime() <= now
      ? (["muted", "Ended"] as const)
      : new Date(placement.startsAt).getTime() > now
        ? (["warning", "Scheduled"] as const)
        : placement.live
          ? (["success", "Live"] as const)
          : (["danger", "Not showing"] as const);

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tone === "success" && "bg-success/12 text-success",
        tone === "warning" && "bg-warning/12 text-warning",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "muted" && "bg-fill text-muted",
      )}
      // "Not showing" is the one that needs explaining: everything about the
      // booking is right and the product itself is unbuyable.
      title={
        label === "Not showing"
          ? "The booking is live but the product is out of stock or its shop is closing."
          : undefined
      }
    >
      {label}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-8 items-center justify-center rounded-btn border border-line text-ink transition-colors hover:border-primary/50 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------- */

/** `2026-08-19T12:00:00Z` -> `2026-08-19`, which is what <input type="date"> wants. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * Book or edit a slot.
 *
 * The product is chosen by searching, not typed as an id, and the picker greys
 * out anything already on the banner rather than letting the unique constraint
 * fail on submit — the constraint is still the thing that guarantees it, but a
 * disabled row explains itself and an error toast does not.
 */
function PlacementDialog({
  open,
  placement,
  onClose,
}: {
  open: boolean;
  placement: AdminPlacement | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  // Drafts, seeded from `placement` and re-seeded whenever the dialog opens on
  // a different row (see below). Holding them here rather than reading the
  // placement directly is what stops a half-typed edit leaking into the next
  // row the owner clicks.
  const [productId, setProductId] = useState(placement?.productId ?? "");
  const [productLabel, setProductLabel] = useState(
    placement ? `${placement.productName} · ${placement.shopName}` : "",
  );
  const [headline, setHeadline] = useState(placement?.headline ?? "");
  const [startsAt, setStartsAt] = useState(toDateInput(placement?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(placement?.endsAt ?? null));
  const [amount, setAmount] = useState(placement?.amountKes?.toString() ?? "");
  const [note, setNote] = useState(placement?.note ?? "");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());

  // Re-seed whenever the dialog is opened on a different row. Comparing ids
  // rather than object identity: the list refetches and hands back a new object
  // for the same placement, which would otherwise wipe the form mid-edit.
  const [seededFor, setSeededFor] = useState<string | null>(placement?.id ?? null);
  if (open && seededFor !== (placement?.id ?? null)) {
    setSeededFor(placement?.id ?? null);
    setProductId(placement?.productId ?? "");
    setProductLabel(placement ? `${placement.productName} · ${placement.shopName}` : "");
    setHeadline(placement?.headline ?? "");
    setStartsAt(toDateInput(placement?.startsAt ?? null));
    setEndsAt(toDateInput(placement?.endsAt ?? null));
    setAmount(placement?.amountKes?.toString() ?? "");
    setNote(placement?.note ?? "");
    setSearch("");
  }

  const hitsQ = useQuery({
    queryKey: ["admin-product-search", term],
    queryFn: () => services.admin.searchProducts(term, 8),
    enabled: open && productId === "",
  });

  const save = useMutation({
    mutationFn: (input: PlacementInput) => services.admin.savePlacement(input),
    onSuccess: () => {
      push(placement ? "Ad updated" : "Ad placed", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-placements"] });
      queryClient.invalidateQueries({ queryKey: ["banner-placements"] });
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      onClose();
    },
    onError: (err: Error) => push(err.message || "Could not save the ad", "danger"),
  });

  const submit = () => {
    if (!productId) return;
    save.mutate({
      id: placement?.id ?? null,
      productId,
      headline: headline.trim() || null,
      // Dates come off <input type="date"> as a bare day. Sending it as-is is
      // parsed as UTC midnight, which is 3am local — fine for a start, wrong for
      // an end, since "ends on the 20th" means the end OF the 20th. So the end
      // is pushed to the start of the next day.
      startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
      endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
      active: placement?.active ?? true,
      amountKes: amount.trim() === "" ? null : Math.max(0, Math.round(Number(amount))),
      note: note.trim() || null,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={placement ? "Edit banner ad" : "Place a banner ad"}
      description="Paid slots sit above the free rotation and are labelled Promoted on the marketplace."
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Product</FieldLabel>
          {productId ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-btn border border-line bg-fill-soft px-3 py-2.5">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">
                {productLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setProductId("");
                  setProductLabel("");
                }}
                className="shrink-0 text-xs font-bold text-primary hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1.5">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search products by name, SKU or shop"
                  placeholder="Product name, SKU or shop…"
                  className="h-11 w-full rounded-btn border border-line bg-card pl-9 pr-3 text-sm text-ink outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
                />
              </div>
              <ProductHits
                hits={hitsQ.data ?? []}
                loading={hitsQ.isLoading}
                onPick={(hit) => {
                  setProductId(hit.id);
                  setProductLabel(`${hit.name} · ${hit.shopName}`);
                }}
              />
            </>
          )}
        </div>

        <div>
          <FieldLabel>Headline</FieldLabel>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Leave empty to use the product name"
            maxLength={80}
            className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Starts</FieldLabel>
            <DateInput value={startsAt} onChange={setStartsAt} label="Start date" />
          </div>
          <div>
            <FieldLabel>Ends</FieldLabel>
            <DateInput value={endsAt} onChange={setEndsAt} label="End date" />
            <p className="mt-1 text-xs text-muted">Empty = runs until paused.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Amount paid (KES)</FieldLabel>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div>
            <FieldLabel>Reference</FieldLabel>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="M-Pesa code, who paid…"
              maxLength={120}
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink"
          >
            Cancel
          </button>
          <Button disabled={!productId || save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : placement ? "Save changes" : "Place ad"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-muted">{children}</p>;
}

function DateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
    />
  );
}

function ProductHits({
  hits,
  loading,
  onPick,
}: {
  hits: AdminProductHit[];
  loading: boolean;
  onPick: (hit: AdminProductHit) => void;
}) {
  if (loading) {
    return (
      <div className="mt-2 space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (hits.length === 0) {
    return <p className="mt-2 text-sm text-muted">No product matches that.</p>;
  }

  return (
    <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
      {hits.map((hit) => (
        <li key={hit.id}>
          <button
            type="button"
            disabled={hit.alreadyPlaced}
            onClick={() => onPick(hit)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-btn border border-line p-2 text-left transition-colors",
              hit.alreadyPlaced ? "cursor-not-allowed opacity-50" : "hover:border-primary/50",
            )}
          >
            <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-fill">
              {hit.image && <img src={hit.image} alt="" className="size-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{hit.name}</span>
              <span className="block truncate text-xs text-muted">
                {hit.shopName} · {hit.sku} · {formatKes(hit.priceKes)}
                {hit.status === "out" && " · out of stock"}
              </span>
            </span>
            {hit.alreadyPlaced && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
                On banner
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
