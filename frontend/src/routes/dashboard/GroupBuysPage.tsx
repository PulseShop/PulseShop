import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Plus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { groupBuyUrl, timeLeft } from "@/lib/groupBuy";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { GroupBuyInput } from "@/services";
import type { GroupBuyStatus, MerchantGroupBuy } from "@/types";
import { useToasts } from "@/stores/toast";

const TARGET_PRESETS = [3, 5, 10, 20];
const PERCENT_PRESETS = [5, 10, 15, 20, 25];
const DURATION_PRESETS = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "7 days", hours: 168 },
] as const;

const STATUS_TONE: Record<GroupBuyStatus, string> = {
  open: "bg-primary/10 text-primary",
  filled: "bg-success/10 text-success",
  expired: "bg-fill text-muted",
  cancelled: "bg-fill text-muted",
};

const STATUS_LABEL: Record<GroupBuyStatus, string> = {
  open: "Running",
  filled: "Filled",
  expired: "Didn't fill",
  cancelled: "Cancelled",
};

/**
 * Group buys, seller side (migration 0054).
 *
 * The seller's real question here is "is this working", so progress against
 * target leads on every row and the code is one tap from the clipboard —
 * a group buy nobody has been sent the link to is the failure mode this page
 * has to make obvious.
 *
 * Editing is deliberately absent, for the same reason it is absent from
 * discount codes: people have already joined on the terms as posted, and
 * moving the target or the price after that is not something the product
 * should help anyone do. Open runs can be cancelled; filled ones cannot,
 * because their members are holding an earned code.
 */
export function GroupBuysPage() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [createOpen, setCreateOpen] = useState(false);

  const runsQ = useQuery({
    queryKey: ["group-buys"],
    queryFn: services.groupBuys.listMine,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => services.groupBuys.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-buys"] });
      push("Group buy cancelled. Nobody was charged.", "success");
    },
    onError: () => push("Couldn't cancel that", "danger"),
  });

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      push(`${what} copied`, "success");
    } catch {
      push(text);
    }
  };

  const runs = runsQ.data ?? [];

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">
              <Link to="/dashboard" className="hover:text-ink">
                Dashboard
              </Link>{" "}
              / Group buys
            </p>
            <h1 className="text-2xl font-extrabold text-ink">Group buys</h1>
            <p className="mt-1 max-w-lg text-sm text-muted">
              Set a better price that unlocks once enough people join. Buyers share the link into
              their own WhatsApp groups to reach the target.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="mr-1.5 size-4" />
            New
          </Button>
        </div>

        {runsQ.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
          </div>
        ) : runsQ.isError ? (
          <p className="rounded-card border border-line-soft bg-card p-6 text-sm text-muted">
            Couldn't load your group buys. Check your connection and try again.
          </p>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line-soft bg-card px-6 py-12 text-center">
            <Users className="size-8 text-muted" />
            <div>
              <p className="text-base font-bold text-ink">No group buys yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Pick a product people buy for their whole household or estate, set how many buyers
                unlock the price, and post the link once. The buyers do the rest.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>Start one</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                onCopy={copy}
                onCancel={() => cancelMut.mutate(run.id)}
                cancelling={cancelMut.isPending && cancelMut.variables === run.id}
              />
            ))}
          </div>
        )}
      </div>

      <CreateGroupBuyModal open={createOpen} onOpenChange={setCreateOpen} />
    </DashboardShell>
  );
}

function RunCard({
  run,
  onCopy,
  onCancel,
  cancelling,
}: {
  run: MerchantGroupBuy;
  onCopy: (text: string, what: string) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const progress = Math.min(100, Math.round((run.memberCount / run.targetCount) * 100));
  const url = groupBuyUrl(run.code);

  return (
    <div className="rounded-card border border-line-soft bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <ProductImage
          src={run.productImage}
          alt=""
          className="size-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-ink">{run.productName}</p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                STATUS_TONE[run.status],
              )}
            >
              {STATUS_LABEL[run.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-muted">
            {run.percentOff}% off at {run.targetCount} buyers ·{" "}
            {run.status === "open" ? timeLeft(run.closesAt) : "closed"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-fill">
          <div
            className={cn(
              "h-full rounded-full",
              run.status === "filled" ? "bg-success" : "bg-primary",
            )}
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>
        <p className="text-xs font-semibold text-ink">
          {run.memberCount} of {run.targetCount} joined
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <button
          type="button"
          onClick={() => onCopy(url, "Link")}
          className="flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-xs font-bold text-ink hover:border-primary hover:text-primary"
        >
          <Copy className="size-3.5" />
          Copy link
        </button>
        {run.discountCode && (
          <button
            type="button"
            onClick={() => onCopy(run.discountCode!, "Code")}
            className="flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 font-mono text-xs font-bold text-ink hover:border-primary hover:text-primary"
          >
            {run.discountCode}
          </button>
        )}
        {run.status === "open" && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="ml-auto flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function CreateGroupBuyModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [productId, setProductId] = useState<string | null>(null);
  const [targetCount, setTargetCount] = useState(5);
  const [percentOff, setPercentOff] = useState(10);
  const [hours, setHours] = useState<number>(48);
  const [filter, setFilter] = useState("");

  const productsQ = useQuery({
    queryKey: ["products", "group-buy-picker"],
    queryFn: () => services.products.listProducts({ pageSize: 100 }),
    enabled: open,
  });

  const items = useMemo(() => {
    const all = productsQ.data?.items ?? [];
    const term = filter.trim().toLowerCase();
    return term ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
  }, [productsQ.data, filter]);

  const selected = items.find((p) => p.id === productId) ?? null;

  const createMut = useMutation({
    mutationFn: (input: GroupBuyInput) => services.groupBuys.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-buys"] });
      push("Group buy started — share the link", "success");
      onOpenChange(false);
      setProductId(null);
      setFilter("");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "";
      push(
        msg.includes("already has a group buy")
          ? "That product already has a group buy running"
          : "Couldn't start that group buy",
        "danger",
      );
    },
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New group buy">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Product</p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search your products"
            className="h-11 w-full rounded-btn border border-line bg-card px-3.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="max-h-52 overflow-y-auto rounded-card border border-line-soft">
            {productsQ.isPending ? (
              <div className="p-3">
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : items.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">No products match that.</p>
            ) : (
              items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProductId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line-soft px-3 py-2.5 text-left last:border-b-0",
                    productId === p.id ? "bg-primary/10" : "hover:bg-fill-soft",
                  )}
                >
                  <ProductImage src={p.images[0]} alt="" className="size-9 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-muted">
                    {formatKes(p.priceKes)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <PresetRow
          label="Unlocks at"
          suffix="buyers"
          options={TARGET_PRESETS}
          value={targetCount}
          onChange={setTargetCount}
        />
        <PresetRow
          label="Group discount"
          suffix="%"
          options={PERCENT_PRESETS}
          value={percentOff}
          onChange={setPercentOff}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Runs for</p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((d) => (
              <button
                key={d.hours}
                type="button"
                onClick={() => setHours(d.hours)}
                className={cn(
                  "rounded-btn border px-3.5 py-2 text-sm font-bold",
                  hours === d.hours
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line text-ink hover:border-primary",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <p className="rounded-card bg-fill-soft p-3 text-sm text-muted">
            {targetCount} buyers pay{" "}
            <span className="font-bold text-ink">
              {formatKes(Math.round(selected.priceKes * (1 - percentOff / 100)))}
            </span>{" "}
            instead of <span className="font-bold text-ink">{formatKes(selected.priceKes)}</span>.
            Stock isn't held — they still order as normal once it unlocks.
          </p>
        )}

        <Button
          size="lg"
          disabled={!productId || createMut.isPending}
          onClick={() =>
            productId && createMut.mutate({ productId, targetCount, percentOff, hours })
          }
        >
          {createMut.isPending ? <Loader2 className="size-5 animate-spin" /> : "Start group buy"}
        </Button>
      </div>
    </Modal>
  );
}

function PresetRow({
  label,
  suffix,
  options,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  options: readonly number[];
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-btn border px-3.5 py-2 text-sm font-bold",
              value === n
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-ink hover:border-primary",
            )}
          >
            {n}
            {suffix === "%" ? "%" : ` ${suffix}`}
          </button>
        ))}
      </div>
    </div>
  );
}
