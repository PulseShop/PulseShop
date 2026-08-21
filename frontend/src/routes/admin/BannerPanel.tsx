import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  LayoutList,
  Megaphone,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { formatKes } from "@/lib/currency";
import { HERO_SLOTS } from "@/lib/placements";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { LucideIcon } from "lucide-react";
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
 *
 * HOW MANY CAN RUN AT ONCE. As many as twelve, and that has been true since
 * 0048 — the unique constraint is on product_id, so it stops the same product
 * being booked twice and nothing else. What made it look like a one-product
 * feature was the marketplace, which drew the first three side by side and
 * asked for six. The front page rotates them through one hero slide now
 * (0049), so the list below IS the rotation: top of this list leads, and the
 * arrows on each row are what sets that order. Booking a new ad puts it last
 * rather than first, because otherwise every seller's position would quietly
 * degrade each time somebody else paid.
 *
 * TWO UNITS, ONE LIST. The marketplace sells the same bookings in two shapes —
 * a rotating hero at poster size, and a compact panel beside it (below it on a
 * phone) that shows three at a glance rather than one at a time. Which shape an
 * ad gets is decided by WHERE IT SITS IN THIS LIST: the first HERO_SLOTS are the
 * hero, everything after is the panel. That was invisible here until now, so the
 * owner was selling two products and could only see one of them; the list is
 * drawn as two labelled groups instead, with a control on each row that moves
 * an ad across the line.
 *
 * MOVING ONE IN MOVES ONE OUT, and the UI says so rather than hiding it. The
 * hero holds exactly HERO_SLOTS because a rotation longer than that has a back
 * nobody reaches — see lib/placements.ts. Promoting a fourth ad therefore has
 * to demote a third, and an owner who is not shown that trade will believe they
 * sold four hero slots.
 */
export function BannerPanel() {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const [editing, setEditing] = useState<AdminPlacement | null>(null);
  const [adding, setAdding] = useState(false);

  const placementsQ = useQuery({
    queryKey: ["admin-placements"],
    queryFn: () => services.admin.listPlacements(),
  });

  const placements = placementsQ.data ?? [];
  const liveCount = placements.filter((p) => p.live).length;

  /**
   * Move one placement up or down the rotation.
   *
   * Sends the whole reordered list of ids rather than the one that moved: the
   * RPC rewrites every position from the array, so two rows swapping cannot
   * end up sharing a slot. Optimistic, because a reorder that visibly lags a
   * click gets clicked again.
   */
  const reorder = useMutation({
    mutationFn: (ids: string[]) => services.admin.reorderPlacements(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["admin-placements"] });
      const previous = queryClient.getQueryData<AdminPlacement[]>(["admin-placements"]);
      if (previous) {
        const byId = new Map(previous.map((p) => [p.id, p]));
        queryClient.setQueryData<AdminPlacement[]>(
          ["admin-placements"],
          ids.flatMap((id, i) => {
            const row = byId.get(id);
            return row ? [{ ...row, sortOrder: i }] : [];
          }),
        );
      }
      return { previous };
    },
    onError: (err: Error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-placements"], context.previous);
      push(err.message || "Could not reorder the rotation", "danger");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-placements"] });
      queryClient.invalidateQueries({ queryKey: ["banner-placements"] });
    },
  });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= placements.length) return;
    const ids = placements.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  /**
   * Move one ad to a given position, pushing everything between it and there
   * along by one.
   *
   * A splice rather than a swap, which is the difference between "trade places
   * with the ad at slot 3" and "become slot 3". Crossing the hero boundary is
   * the second thing: an ad promoted from the panel has to land INSIDE the
   * hero's slots and the one it displaces has to land outside them, and a swap
   * would do that only by accident when the two happened to be adjacent.
   */
  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const ids = placements.map((p) => p.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    reorder.mutate(ids);
  };

  /* Where the front page cuts the list. Everything above is the rotating hero,
     everything below is the compact panel — see lib/placements.ts. */
  const promoted = placements.slice(0, HERO_SLOTS);
  const sponsored = placements.slice(HERO_SLOTS);
  /* The two groups are only meaningfully different once there is something on
     both sides of the line; below that every booking is in the hero and a
     "move to sponsored" button would be a control that does nothing. */
  const split = placements.length > HERO_SLOTS;

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Megaphone className="size-4 text-warning" aria-hidden />
            Banner ads
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Paid slots at the top of the marketplace, in two units. {liveCount} running of{" "}
            {placements.length} booked.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Place an ad
        </Button>
      </div>

      {placements.length > 1 && (
        <p className="mt-3 rounded-btn bg-fill-soft px-3 py-2 text-xs text-muted">
          The arrows set the order within a unit. The first {HERO_SLOTS} bookings are the promoted
          hero and the rest fill the sponsored panel, so promoting a fourth ad moves the third one
          down into the panel. Up to 12 run at once.
        </p>
      )}

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
          Nobody has bought a slot yet, so the marketplace hero is cycling the free rotation
          instead — one product from every registered shop, and the sponsored panel is showing its
          own pitch. That is the intended resting state. Place several ads and the hero cycles the
          first {HERO_SLOTS} of them, twelve seconds each, with the rest in the panel beside it.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <PlacementGroup
            icon={Megaphone}
            title="Promoted"
            caption={`The rotating hero, ${HERO_SLOTS} slots, twelve seconds each.`}
            rows={promoted}
            offset={0}
            total={placements.length}
            reordering={reorder.isPending}
            onMove={move}
            /* Out of the hero and to the front of the panel. The ad that was
               first in the panel takes the slot this one vacated. */
            onCross={split ? (i) => moveTo(i, HERO_SLOTS) : undefined}
            crossLabel="Move to sponsored"
            crossIcon={ArrowDownToLine}
            onEdit={setEditing}
          />

          <PlacementGroup
            icon={LayoutList}
            title="Sponsored"
            caption="The compact panel beside the hero, and above it on a phone."
            rows={sponsored}
            offset={HERO_SLOTS}
            total={placements.length}
            reordering={reorder.isPending}
            onMove={move}
            /* Into the LAST hero slot rather than the first: buying your way to
               the front of the rotation is a different thing from buying your
               way into it, and the arrows are how the owner sells the first. */
            onCross={(i) => moveTo(i, HERO_SLOTS - 1)}
            crossLabel="Move to promoted"
            crossIcon={ArrowUpToLine}
            onEdit={setEditing}
            empty={`Nothing here yet. The ${HERO_SLOTS + 1}th booking lands in this panel, or move one down from the hero above.`}
          />
        </div>
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

/**
 * One of the two units, with its bookings under it.
 *
 * IT IS A LABEL OVER A SLICE, not a separate list. The rows underneath are the
 * same ordered array the front page reads, cut at HERO_SLOTS, so `offset` is
 * what turns a position inside the group back into a position in the whole
 * rotation — every control below still speaks in whole-list indices, because
 * that is what the reorder RPC takes.
 *
 * THE EMPTY SPONSORED GROUP STILL DRAWS. An owner with three bookings needs to
 * know the fourth will land somewhere different, and a section that appears out
 * of nowhere on the fourth sale teaches that lesson later and worse.
 */
function PlacementGroup({
  icon: Icon,
  title,
  caption,
  rows,
  offset,
  total,
  reordering,
  onMove,
  onCross,
  crossLabel,
  crossIcon,
  onEdit,
  empty,
}: {
  icon: LucideIcon;
  title: string;
  caption: string;
  rows: AdminPlacement[];
  /** Where this group starts in the whole rotation. */
  offset: number;
  total: number;
  reordering: boolean;
  onMove: (index: number, delta: number) => void;
  /** Undefined while there is nothing on the other side of the line to trade
   *  places with — see `split` in BannerPanel. */
  onCross?: (index: number) => void;
  crossLabel: string;
  crossIcon: LucideIcon;
  onEdit: (placement: AdminPlacement) => void;
  empty?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink">
          <Icon className="size-3.5 text-warning" aria-hidden />
          {title}
        </h3>
        <span className="text-[11px] text-muted">{caption}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-4 text-xs text-muted">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p, i) => (
            <PlacementRow
              key={p.id}
              placement={p}
              position={offset + i}
              total={total}
              reordering={reordering}
              onMove={(delta) => onMove(offset + i, delta)}
              onCross={onCross ? () => onCross(offset + i) : undefined}
              crossLabel={crossLabel}
              crossIcon={crossIcon}
              onEdit={() => onEdit(p)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlacementRow({
  placement,
  position,
  total,
  reordering,
  onMove,
  onCross,
  crossLabel,
  crossIcon: CrossIcon,
  onEdit,
}: {
  placement: AdminPlacement;
  /** Zero-based index in the WHOLE rotation, not in the group; shown to the
   *  owner as 1-based. */
  position: number;
  total: number;
  reordering: boolean;
  onMove: (delta: number) => void;
  /** Moves this ad to the other unit. Absent when there is no other unit yet. */
  onCross?: () => void;
  crossLabel: string;
  crossIcon: LucideIcon;
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
      {/* Where this sits in the hero's rotation, and the two controls that
          change it. The number is not decoration: "move up" is meaningless
          without something that says what it moved to. */}
      {total > 1 && (
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <IconButton
            label={`Move ${placement.productName} earlier in the rotation`}
            onClick={() => onMove(-1)}
            disabled={position === 0 || reordering}
            className="size-7"
          >
            <ArrowUp className="size-3.5" />
          </IconButton>
          <span className="text-[11px] font-bold tabular-nums text-muted">{position + 1}</span>
          <IconButton
            label={`Move ${placement.productName} later in the rotation`}
            onClick={() => onMove(1)}
            disabled={position === total - 1 || reordering}
            className="size-7"
          >
            <ArrowDown className="size-3.5" />
          </IconButton>
        </div>
      )}

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
        {onCross && (
          <IconButton
            label={`${crossLabel} — ${placement.productName}`}
            onClick={onCross}
            disabled={reordering}
          >
            <CrossIcon className="size-4" />
          </IconButton>
        )}
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
      description="Paid ads take the marketplace hero, one at a time on a twelve-second rotation, and are labelled Promoted. A new ad joins the end of the rotation."
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
