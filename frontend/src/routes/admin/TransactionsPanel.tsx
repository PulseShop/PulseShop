import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Receipt, Trash2 } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatKes } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { AdminPayment, SubscriptionPaymentMethod } from "@/types";

/**
 * Every subscription payment received, newest first.
 *
 * This screen has no "add" button on purpose. A payment belongs to an invoice —
 * it is recorded from the invoice it settles, on the Invoices screen, where the
 * outstanding balance is on screen to check it against. Letting one be created
 * here would mean picking an invoice out of a dropdown with no context, which is
 * how money gets logged against the wrong month.
 *
 * What it can do is remove one, because the commonest billing mistake is a
 * mistyped amount and the fix is to delete and re-enter rather than to leave a
 * correction row nobody can interpret later.
 */

const METHOD_LABEL: Record<SubscriptionPaymentMethod, string> = {
  mpesa: "M-Pesa",
  bank: "Bank",
  cash: "Cash",
  waiver: "Waiver",
  other: "Other",
};

export function TransactionsPanel() {
  const paymentsQ = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => services.admin.listPayments({ pageSize: 100 }),
  });

  const payments = paymentsQ.data?.items ?? [];
  const total = payments.reduce((n, p) => n + p.amountKes, 0);
  // Waivers are money that never arrived. Summing them with real receipts would
  // overstate what was collected, which is the one number this screen exists
  // to be right about.
  const waived = payments
    .filter((p) => p.method === "waiver")
    .reduce((n, p) => n + p.amountKes, 0);

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Receipt className="size-4 text-primary" aria-hidden />
            Transactions
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Subscription payments from sellers. Recorded against an invoice, on the Invoices
            screen.
          </p>
        </div>
        {payments.length > 0 && (
          <div className="text-right">
            <p className="text-lg font-extrabold tabular-nums text-ink">
              {formatKes(total - waived)}
            </p>
            <p className="text-xs text-muted">
              received{waived > 0 && ` · ${formatKes(waived)} waived`}
            </p>
          </div>
        )}
      </div>

      {paymentsQ.isError ? (
        <div className="mt-4">
          <QueryError
            title="Couldn't load transactions"
            onRetry={() => paymentsQ.refetch()}
            retrying={paymentsQ.isFetching}
          />
        </div>
      ) : paymentsQ.isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing has been paid yet. Record the first payment from the Invoices screen.
        </p>
      ) : (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2 pr-3 font-bold">Received</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Shop</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Period</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Method</th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">Amount</th>
                <th scope="col" className="pb-2 font-bold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentRow({ payment }: { payment: AdminPayment }) {
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => services.admin.deletePayment(payment.id),
    onSuccess: () => {
      push("Payment removed", "success");
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-billing-summary"] });
    },
    onError: (err: Error) => push(err.message || "Could not remove the payment", "danger"),
  });

  return (
    <tr className="border-b border-line-soft last:border-0">
      <td className="py-2.5 pr-3 tabular-nums text-muted">
        {new Date(payment.paidAt).toLocaleDateString()}
      </td>
      <td className="py-2.5 pr-3">
        <span className="block truncate font-semibold text-ink">{payment.shopName}</span>
        <span className="block truncate text-xs text-muted">
          @{payment.shopHandle} · {payment.plan}
        </span>
      </td>
      <td className="py-2.5 pr-3 text-xs tabular-nums text-muted">
        {payment.periodStart} to {payment.periodEnd}
      </td>
      <td className="py-2.5 pr-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            payment.method === "waiver" ? "bg-warning/12 text-warning" : "bg-fill text-muted",
          )}
        >
          {METHOD_LABEL[payment.method]}
        </span>
        {payment.reference && (
          <span className="ml-1.5 text-xs text-muted">{payment.reference}</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-ink">
        {formatKes(payment.amountKes)}
      </td>
      <td className="py-2.5 text-right">
        <button
          type="button"
          aria-label={`Remove the ${formatKes(payment.amountKes)} payment from ${payment.shopName}`}
          title="Remove this payment"
          onClick={() => setConfirming(true)}
          className="flex size-8 items-center justify-center rounded-btn border border-line text-danger hover:border-danger/50"
        >
          <Trash2 className="size-4" />
        </button>

        <Modal
          open={confirming}
          onOpenChange={setConfirming}
          title="Remove this payment?"
          description={`${formatKes(payment.amountKes)} from ${payment.shopName} will be deleted and its invoice will go back to owing that amount.`}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink"
            >
              Keep it
            </button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </Modal>
      </td>
    </tr>
  );
}
