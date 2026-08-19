import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Plus, Search, Trash2, Wallet } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { AdminInvoice, AdminShop, InvoiceState, Plan } from "@/types";

/**
 * What sellers owe us for their tier, and what has arrived.
 *
 * WHY THIS IS BY HAND. There is still no payment gateway (see 0041, 0045 and
 * 0048, which all say so). A seller pays out of band and the owner records both
 * halves here. When billing lands, a webhook writes the same rows as
 * service_role and this screen becomes the place you go to correct one rather
 * than the only way in; the schema does not have to change for that.
 *
 * WHY AN INVOICE HAS NO "PAID" BUTTON. Paid is arithmetic, not a flag: an
 * invoice is settled when the payments recorded against it add up to its
 * amount. That is what makes a part payment expressible, and it is why the
 * action on an unpaid row is "Record payment" rather than "Mark paid".
 */

/** Tier prices, mirroring routes/marketing/tiers.ts and admin_billing_summary.
 *  Three copies is two too many; the day billing becomes real this moves to a
 *  table and all three read it. Until then the marketing page is the source and
 *  this is the till. */
const PLAN_PRICE: Record<Plan, number> = { explorer: 0, boutique: 1950, influencer: 6500 };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "draft", label: "Drafts" },
  { id: "void", label: "Void" },
];

export function InvoicesPanel() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [editing, setEditing] = useState<AdminInvoice | null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<AdminInvoice | null>(null);

  const invoicesQ = useQuery({
    queryKey: ["admin-invoices", status, term],
    queryFn: () => services.admin.listInvoices({ status, search: term, pageSize: 50 }),
  });

  const summaryQ = useQuery({
    queryKey: ["admin-billing-summary"],
    queryFn: () => services.admin.billingSummary(),
  });

  const invoices = invoicesQ.data?.items ?? [];
  const summary = summaryQ.data;

  return (
    <div className="space-y-4">
      <section aria-label="Billing headline" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Outstanding"
          value={summary ? formatKes(summary.outstandingKes) : "—"}
          detail={summary ? `${summary.overdueCount} overdue` : undefined}
          tone={summary && summary.overdueCount > 0 ? "danger" : undefined}
        />
        <Tile
          label="Collected, 30 days"
          value={summary ? formatKes(summary.collected30dKes) : "—"}
          detail="Payments recorded in the window"
        />
        <Tile
          label="Collected, all time"
          value={summary ? formatKes(summary.collectedAllKes) : "—"}
          detail={summary ? `across ${summary.invoiceCount} invoices` : undefined}
        />
        <Tile
          label="Monthly recurring"
          value={summary ? formatKes(summary.mrrKes) : "—"}
          // Not a sum of invoices: it is what the current tier list SHOULD bill
          // next month, which diverges the moment somebody upgrades.
          detail="From current tiers, not billed yet"
        />
      </section>

      <section className="rounded-card bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <FileText className="size-4 text-primary" aria-hidden />
              Subscription invoices
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              What each shop owes us for its tier. Recorded by hand until billing exists.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            New invoice
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search invoices by shop"
              placeholder="Shop name or handle…"
              className="h-10 w-full rounded-btn border border-line bg-card pl-9 pr-3 text-sm text-ink outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={status === f.id}
                onClick={() => setStatus(f.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-btn px-3 text-xs font-bold transition-colors",
                  status === f.id
                    ? "bg-primary text-on-accent"
                    : "border border-line text-muted hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {invoicesQ.isError ? (
          <div className="mt-4">
            <QueryError
              title="Couldn't load invoices"
              onRetry={() => invoicesQ.refetch()}
              retrying={invoicesQ.isFetching}
            />
          </div>
        ) : invoicesQ.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {status === "all" && !term
              ? "No invoices yet. Raise one when a shop moves onto a paid tier."
              : "No invoice matches that."}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {invoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onEdit={() => setEditing(inv)}
                onPay={() => setPaying(inv)}
              />
            ))}
          </ul>
        )}
      </section>

      <InvoiceDialog
        open={adding || editing !== null}
        invoice={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <PaymentDialog invoice={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function InvoiceRow({
  invoice,
  onEdit,
  onPay,
}: {
  invoice: AdminInvoice;
  onEdit: () => void;
  onPay: () => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => services.admin.deleteInvoice(invoice.id),
    onSuccess: () => {
      push("Invoice removed", "success");
      setConfirmingDelete(false);
      invalidateBilling(queryClient);
    },
    onError: (err: Error) => push(err.message || "Could not remove the invoice", "danger"),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card border border-line p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-bold text-ink">{invoice.shopName}</p>
          <StatePill state={invoice.state} />
          <span className="rounded-full bg-fill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            {invoice.plan}
          </span>
        </div>
        <p className="truncate text-xs text-muted">
          @{invoice.shopHandle} · {invoice.periodStart} to {invoice.periodEnd}
          {invoice.dueOn && ` · due ${invoice.dueOn}`}
        </p>
        {invoice.note && <p className="mt-0.5 truncate text-xs text-muted">{invoice.note}</p>}
      </div>

      <div className="shrink-0 text-right">
        <p className="font-extrabold tabular-nums text-ink">{formatKes(invoice.amountKes)}</p>
        {/* Only when it says something the amount does not. A fully unpaid
            invoice repeating its own total as "balance" is noise. */}
        {invoice.paidKes > 0 && (
          <p className="text-xs tabular-nums text-muted">
            {formatKes(invoice.paidKes)} paid
            {invoice.balanceKes > 0 && ` · ${formatKes(invoice.balanceKes)} left`}
            {invoice.balanceKes < 0 && ` · ${formatKes(-invoice.balanceKes)} over`}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {invoice.state !== "paid" && invoice.state !== "void" && (
          <button
            type="button"
            onClick={onPay}
            className="flex min-h-8 items-center gap-1.5 rounded-btn bg-primary px-3 text-xs font-bold text-on-accent"
          >
            <Wallet className="size-3.5" aria-hidden />
            Record payment
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="min-h-8 rounded-btn border border-line px-3 text-xs font-bold text-ink hover:border-primary/50"
        >
          Edit
        </button>
        <button
          type="button"
          aria-label="Remove this invoice"
          title="Remove this invoice"
          onClick={() => setConfirmingDelete(true)}
          className="flex size-8 items-center justify-center rounded-btn border border-line text-danger hover:border-danger/50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Modal
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Remove this invoice?"
        description={`${invoice.shopName}'s ${invoice.periodStart} invoice and every payment recorded against it will be deleted. Void it instead if you need the audit trail.`}
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

/** Five states, because "unpaid" has four different fixes: send it, wait, chase
 *  it, or stop chasing it. */
function StatePill({ state }: { state: InvoiceState }) {
  const tone =
    state === "paid"
      ? "bg-success/12 text-success"
      : state === "overdue"
        ? "bg-danger/12 text-danger"
        : state === "sent"
          ? "bg-warning/12 text-warning"
          : "bg-fill text-muted";

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tone,
      )}
    >
      {state}
    </span>
  );
}

function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-card bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-extrabold tabular-nums",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

const invalidateBilling = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["admin-invoices"] });
  qc.invalidateQueries({ queryKey: ["admin-payments"] });
  qc.invalidateQueries({ queryKey: ["admin-billing-summary"] });
};

/* ------------------------------------------------------------------------- */

/** `2026-08-19T…` -> `2026-08-19`, which is what <input type="date"> wants. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** The first and last day of the month containing `d`, as date-input strings.
 *  A month is the default billing window because every tier is priced monthly;
 *  the fields stay editable for the shop that upgrades on the 14th. */
function monthWindow(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function InvoiceDialog({
  open,
  invoice,
  onClose,
}: {
  open: boolean;
  invoice: AdminInvoice | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const window0 = monthWindow();

  const [merchantId, setMerchantId] = useState(invoice?.merchantId ?? "");
  const [shopLabel, setShopLabel] = useState(invoice ? invoice.shopName : "");
  const [plan, setPlan] = useState<Plan>(invoice?.plan ?? "boutique");
  const [periodStart, setPeriodStart] = useState(invoice?.periodStart ?? window0.start);
  const [periodEnd, setPeriodEnd] = useState(invoice?.periodEnd ?? window0.end);
  const [amount, setAmount] = useState(String(invoice?.amountKes ?? PLAN_PRICE.boutique));
  const [status, setStatus] = useState<AdminInvoice["status"]>(invoice?.status ?? "draft");
  const [dueOn, setDueOn] = useState(toDateInput(invoice?.dueOn ?? null));
  const [note, setNote] = useState(invoice?.note ?? "");
  const [shopSearch, setShopSearch] = useState("");
  const shopTerm = useDebounced(shopSearch.trim());

  // Re-seed when the dialog opens on a different row. Comparing ids rather than
  // object identity: the list refetches and hands back a new object for the
  // same invoice, which would otherwise wipe the form mid-edit.
  const [seededFor, setSeededFor] = useState<string | null>(invoice?.id ?? null);
  if (open && seededFor !== (invoice?.id ?? null)) {
    const w = monthWindow();
    setSeededFor(invoice?.id ?? null);
    setMerchantId(invoice?.merchantId ?? "");
    setShopLabel(invoice?.shopName ?? "");
    setPlan(invoice?.plan ?? "boutique");
    setPeriodStart(invoice?.periodStart ?? w.start);
    setPeriodEnd(invoice?.periodEnd ?? w.end);
    setAmount(String(invoice?.amountKes ?? PLAN_PRICE.boutique));
    setStatus(invoice?.status ?? "draft");
    setDueOn(toDateInput(invoice?.dueOn ?? null));
    setNote(invoice?.note ?? "");
    setShopSearch("");
  }

  const shopsQ = useQuery({
    queryKey: ["admin-shops", "invoice-picker", shopTerm],
    queryFn: () => services.admin.listShops({ search: shopTerm, pageSize: 8 }),
    enabled: open && merchantId === "",
  });

  const save = useMutation({
    mutationFn: () =>
      services.admin.saveInvoice({
        id: invoice?.id ?? null,
        merchantId,
        plan,
        periodStart,
        periodEnd,
        amountKes: Math.max(0, Math.round(Number(amount) || 0)),
        status,
        dueOn: dueOn || null,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      push(invoice ? "Invoice updated" : "Invoice raised", "success");
      invalidateBilling(queryClient);
      onClose();
    },
    onError: (err: Error) => push(err.message || "Could not save the invoice", "danger"),
  });

  const pickShop = (shop: AdminShop) => {
    setMerchantId(shop.id);
    setShopLabel(shop.name);
    // Seed the tier and the price from the shop's CURRENT plan, which is the
    // one thing the owner would otherwise have to look up in another panel.
    setPlan(shop.plan);
    setAmount(String(PLAN_PRICE[shop.plan]));
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={invoice ? "Edit invoice" : "Raise an invoice"}
      description="What this shop owes us for its tier over one billing window."
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Shop</FieldLabel>
          {merchantId ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-btn border border-line bg-fill-soft px-3 py-2.5">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{shopLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setMerchantId("");
                  setShopLabel("");
                }}
                className="shrink-0 text-xs font-bold text-primary hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                autoFocus
                value={shopSearch}
                onChange={(e) => setShopSearch(e.target.value)}
                aria-label="Search shops"
                placeholder="Shop name, handle or email…"
                className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
              />
              {shopsQ.isLoading ? (
                <div className="mt-2 space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                  {(shopsQ.data?.items ?? []).map((shop) => (
                    <li key={shop.id}>
                      <button
                        type="button"
                        onClick={() => pickShop(shop)}
                        className="flex w-full items-center justify-between gap-2 rounded-btn border border-line p-2.5 text-left hover:border-primary/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-ink">
                            {shop.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            @{shop.handle} · {shop.plan}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Tier</FieldLabel>
            <select
              value={plan}
              aria-label="Tier"
              onChange={(e) => {
                const next = e.target.value as Plan;
                setPlan(next);
                setAmount(String(PLAN_PRICE[next]));
              }}
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm font-semibold text-ink outline-none focus:border-primary"
            >
              <option value="explorer">Explorer</option>
              <option value="boutique">Boutique</option>
              <option value="influencer">Influencer</option>
            </select>
          </div>
          <div>
            <FieldLabel>Amount (KES)</FieldLabel>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount in KES"
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Period starts</FieldLabel>
            <DateInput value={periodStart} onChange={setPeriodStart} label="Period start" />
          </div>
          <div>
            <FieldLabel>Period ends</FieldLabel>
            <DateInput value={periodEnd} onChange={setPeriodEnd} label="Period end" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Due</FieldLabel>
            <DateInput value={dueOn} onChange={setDueOn} label="Due date" />
            <p className="mt-1 text-xs text-muted">Empty = never marked overdue.</p>
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <select
              value={status}
              aria-label="Status"
              onChange={(e) => setStatus(e.target.value as AdminInvoice["status"])}
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm font-semibold text-ink outline-none focus:border-primary"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="void">Void</option>
            </select>
            {/* Paid is deliberately not on this list — see the header note. */}
            <p className="mt-1 text-xs text-muted">Paid is decided by the payments.</p>
          </div>
        </div>

        <div>
          <FieldLabel>Note</FieldLabel>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this covers, who agreed it…"
            maxLength={160}
            className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink"
          >
            Cancel
          </button>
          <Button disabled={!merchantId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : invoice ? "Save changes" : "Raise invoice"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentDialog({
  invoice,
  onClose,
}: {
  invoice: AdminInvoice | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mpesa");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Default the amount to what is actually left, which is what gets typed
  // ninety-nine times in a hundred.
  if (invoice && seededFor !== invoice.id) {
    setSeededFor(invoice.id);
    setAmount(String(Math.max(0, invoice.balanceKes)));
    setMethod("mpesa");
    setReference("");
    setNote("");
  }

  const save = useMutation({
    mutationFn: () =>
      services.admin.recordPayment({
        invoiceId: invoice!.id,
        amountKes: Math.max(0, Math.round(Number(amount) || 0)),
        method: method as "mpesa" | "bank" | "cash" | "waiver" | "other",
        reference: reference.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      push("Payment recorded", "success");
      invalidateBilling(queryClient);
      onClose();
    },
    onError: (err: Error) => push(err.message || "Could not record the payment", "danger"),
  });

  return (
    <Modal
      open={invoice !== null}
      onOpenChange={(next) => !next && onClose()}
      title="Record a payment"
      description={
        invoice
          ? `${invoice.shopName} · ${formatKes(invoice.balanceKes)} outstanding on the ${invoice.periodStart} invoice.`
          : ""
      }
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Amount (KES)</FieldLabel>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount received"
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div>
            <FieldLabel>Method</FieldLabel>
            <select
              value={method}
              aria-label="Payment method"
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm font-semibold text-ink outline-none focus:border-primary"
            >
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash</option>
              {/* Not a real payment, and recorded as one on purpose: it balances
                  the invoice and leaves a trace, which voiding would not. */}
              <option value="waiver">Waiver</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <FieldLabel>Reference</FieldLabel>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="M-Pesa code, bank slip…"
            maxLength={80}
            className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        <div>
          <FieldLabel>Note</FieldLabel>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            maxLength={160}
            className="mt-1.5 h-11 w-full rounded-btn border border-line bg-card px-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink"
          >
            Cancel
          </button>
          <Button
            disabled={save.isPending || Number(amount) <= 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Recording…" : "Record payment"}
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
