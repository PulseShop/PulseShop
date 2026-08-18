import { Check, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TIERS, formatTierPrice } from "@/routes/marketing/tiers";
import { PLAN_LABEL } from "@/lib/entitlements";
import { cn } from "@/lib/utils";
import type { Plan } from "@/types";

/**
 * The seller's subscription, shown but not sellable yet.
 *
 * This briefly had a working "request an upgrade" flow writing to
 * plan_upgrade_requests (0045). That is switched off: billing does not exist,
 * so every request was a promise nobody could keep, and a queue of them was
 * work for a human rather than a product.
 *
 * What is left is honest: the seller can see which plan they are on and what
 * the other plans cost, and the buttons say plainly that they cannot be bought
 * yet. Nothing here writes anything.
 *
 * The table is deliberately still in the database. When billing lands, a
 * successful payment is what should resolve a request, and this component gets
 * its buttons back rather than being rebuilt.
 */
export function PlanSection({ currentPlan }: { currentPlan: Plan | undefined }) {
  const plan = currentPlan ?? "explorer";

  return (
    <section className="rounded-card bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-ink">Plan</h2>
          <p className="mt-0.5 text-sm text-muted">
            You're on <span className="font-bold text-ink">{PLAN_LABEL[plan]}</span>.
          </p>
        </div>
        {plan !== "explorer" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Paid plan
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {TIERS.map((tier) => {
          const isCurrent = tier.id === plan;
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
                ) : (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    <Lock className="size-3.5" aria-hidden />
                    Coming soon
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Switching plans isn't available yet; card and M-Pesa billing still has to be wired up.
        Every shop keeps the plan it is on until then, and we'll get in touch before anything
        starts costing money.
      </p>
    </section>
  );
}
