import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TIERS, formatTierPrice } from "@/routes/marketing/tiers";
import { PLAN_LABEL } from "@/lib/entitlements";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useToasts } from "@/stores/toast";
import type { Plan } from "@/types";

/**
 * The seller's subscription.
 *
 * Deliberately NOT a self-serve upgrade. Migration 0041 revoked the seller's
 * write access to `merchants.plan` column by column, with the note "A seller
 * must not be able to upgrade themselves", and billing still does not exist.
 * A picker that wrote the column would either fail at the database or, if that
 * protection were removed to make it work, hand every shop the paid tiers for
 * nothing.
 *
 * So this records intent: the seller says which plan they want, it lands in
 * plan_upgrade_requests (0045) as a pending row, and someone grants it out of
 * band. When billing arrives, the request becomes the thing a successful
 * payment resolves, and this component keeps its shape.
 */
export function PlanSection({ currentPlan }: { currentPlan: Plan | undefined }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const plan = currentPlan ?? "explorer";

  const requestQ = useQuery({
    queryKey: ["plan-request"],
    queryFn: () => services.plans.myRequest(),
  });
  const pending = requestQ.data;

  const requestMut = useMutation({
    mutationFn: (p: Exclude<Plan, "explorer">) => services.plans.request(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-request"] });
      push("Request sent — we'll be in touch to set it up", "success");
    },
    onError: (e: Error) => push(e.message || "Couldn't send that request", "danger"),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => services.plans.cancelRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-request"] });
      push("Request withdrawn");
    },
    onError: () => push("Couldn't withdraw that request", "danger"),
  });

  return (
    <section className="rounded-card bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-ink">Plan</h2>
          <p className="mt-0.5 text-sm text-muted">
            You're on{" "}
            <span className="font-bold text-ink">{PLAN_LABEL[plan]}</span>.
          </p>
        </div>
        {plan !== "explorer" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Paid plan
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-btn bg-warning/10 p-3">
          <p className="text-sm text-ink">
            <span className="font-bold">{PLAN_LABEL[pending.requestedPlan]}</span> requested. We'll
            reach out to arrange payment.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelMut.mutate(pending.id)}
            disabled={cancelMut.isPending}
          >
            Withdraw
          </Button>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {TIERS.map((tier) => {
          const isCurrent = tier.id === plan;
          const isRequested = pending?.requestedPlan === tier.id;
          return (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col rounded-card border-2 p-4",
                isCurrent ? "border-primary bg-primary/5" : "border-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-ink">{tier.name}</p>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                    <Check className="size-3.5" aria-hidden />
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-lg font-extrabold text-ink">
                {formatTierPrice(tier.priceKes)}
                {tier.priceKes !== null && (
                  <span className="text-xs font-medium text-muted"> /month</span>
                )}
              </p>

              <div className="mt-3">
                {isCurrent ? (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    Your plan
                  </Button>
                ) : tier.id === "explorer" ? (
                  // Downgrading is a billing action too, and there is no billing.
                  // Saying so is better than a button that quietly does nothing.
                  <p className="text-xs leading-relaxed text-muted">
                    To move back down, message us and we'll sort it out.
                  </p>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={Boolean(pending) || requestMut.isPending}
                    onClick={() => requestMut.mutate(tier.id as Exclude<Plan, "explorer">)}
                  >
                    {requestMut.isPending && requestMut.variables === tier.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {isRequested ? "Requested" : `Upgrade to ${tier.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Card and M-Pesa billing isn't wired up yet, so upgrades are arranged by hand. Requesting one
        puts you in the queue and changes nothing about your shop until we confirm it.
      </p>
    </section>
  );
}
