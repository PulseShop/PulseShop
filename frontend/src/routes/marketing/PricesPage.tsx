import { ArrowRight, Check, Lock, Minus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { useSeo } from "@/hooks/useSeo";
import { pricesSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { MarketingShell } from "./MarketingShell";
import { COMPARISON, TIERS, formatTierPrice } from "./tiers";

type Billing = "monthly" | "annual";

/* Annual is billed for ten months — the familiar "two months free" convention —
   so the shown per-month figure is the discounted one and the badge reads 17%. */
const annualPerMonth = (priceKes: number) => Math.round((priceKes * 10) / 12);
const annualTotal = (priceKes: number) => priceKes * 10;

export function PricesPage() {
  useSeo(useMemo(() => pricesSeo(window.location.origin), []));
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <MarketingShell>
      {/* hero */}
      <section className="mx-auto max-w-4xl px-5 pb-2 pt-12 text-center md:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          Simple, transparent pricing
        </span>
        <h1 className="mt-5 text-4xl tracking-tight text-ink md:text-6xl">
          Choose the perfect plan for your shop
        </h1>
        <p className="mt-4 text-lg text-ink/70">
          Start free, upgrade the moment your catalog outgrows it. No card to
          begin.
        </p>

        <BillingToggle billing={billing} onChange={setBilling} />
      </section>

      {/* tier cards */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid items-start gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const paid = tier.priceKes !== null;
            const shown =
              paid && billing === "annual"
                ? annualPerMonth(tier.priceKes as number)
                : tier.priceKes;
            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-modal border bg-card p-7",
                  tier.highlight
                    ? "border-primary shadow-[var(--shadow-float)] md:-mt-3 md:mb-3"
                    : "border-line shadow-soft",
                )}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1 text-xs font-bold text-on-accent shadow-soft">
                    <Sparkles className="size-3.5" /> Most popular
                  </span>
                )}
                <div>
                  <h2 className="text-2xl text-ink">{tier.name}</h2>
                  <p className="mt-1 font-sans-force text-sm font-semibold text-muted">
                    {tier.audience}
                  </p>
                </div>

                <div className="mt-6">
                  <p className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-ink">
                      {formatTierPrice(shown)}
                    </span>
                    <span className="text-base font-bold text-muted">/mo</span>
                  </p>
                  <p className="mt-1.5 h-4 text-xs font-medium text-muted">
                    {paid && billing === "annual"
                      ? `Billed annually · ${formatTierPrice(annualTotal(tier.priceKes as number))}/yr`
                      : paid
                        ? "Billed monthly"
                        : "Free forever"}
                  </p>
                </div>

                <div className="mt-6">
                  {tier.available ? (
                    <Link to="/signup" className="block">
                      <Button
                        size="lg"
                        variant={tier.highlight ? "primary" : "outline"}
                        className="w-full"
                      >
                        {tier.cta}
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Button size="lg" className="w-full" disabled>
                        {tier.cta} · Coming soon
                      </Button>
                      <p className="mt-2 text-center text-xs font-medium text-muted">
                        Billing launches soon. Start free today, upgrade later.
                      </p>
                    </>
                  )}
                </div>

                <ul className="mt-7 space-y-3 border-t border-line-soft pt-6">
                  {tier.cardLines.map((line) => (
                    <li
                      key={line.text}
                      className="flex items-start gap-2.5 text-sm"
                    >
                      {line.locked ? (
                        <Lock className="mt-0.5 size-4 shrink-0 text-faint" />
                      ) : (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      )}
                      <span
                        className={cn(
                          "font-medium",
                          line.locked ? "text-muted" : "text-ink",
                        )}
                      >
                        {line.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* comparison table */}
      <section className="mx-auto max-w-6xl px-5 py-12 md:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl text-ink md:text-4xl">
            Compare plans side by side
          </h2>
          <p className="mt-3 text-base text-ink/70">
            Every feature, every tier — so you can see exactly what a step up
            unlocks.
          </p>
        </div>
        {/* The table is wider than a phone and scrolls sideways; on a phone that
            is easy to miss, so say so. */}
        <p className="mt-6 text-center text-xs font-semibold text-muted md:hidden">
          Swipe the table sideways to compare plans →
        </p>
        <div className="mt-3 overflow-x-auto rounded-modal border border-line bg-card md:mt-10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-4 font-sans-force font-bold text-muted">
                  Feature
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier.id}
                    className={cn(
                      "px-5 py-4 text-center",
                      tier.highlight && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "font-sans-force text-base font-extrabold",
                        tier.highlight ? "text-primary" : "text-ink",
                      )}
                    >
                      {tier.name}
                    </span>
                    <span className="block font-sans-force text-xs font-bold text-muted">
                      {formatTierPrice(tier.priceKes)}/mo
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-line-soft last:border-0"
                >
                  <td className="px-5 py-3.5 font-sans-force font-semibold text-ink">
                    {row.feature}
                  </td>
                  {row.values.map((value, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-5 py-3.5 text-center",
                        TIERS[i]?.highlight && "bg-primary/5",
                      )}
                    >
                      {value === true ? (
                        <Check
                          className="mx-auto size-5 text-primary"
                          aria-label="Included"
                        />
                      ) : value === false ? (
                        <Minus
                          className="mx-auto size-5 text-faint"
                          aria-label="Not included"
                        />
                      ) : (
                        <span className="font-sans-force font-semibold text-ink">
                          {value}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* tier detail */}
      <section className="bg-fill-soft">
        <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl text-ink md:text-4xl">Every plan in detail</h2>
            <p className="mt-3 text-base text-ink/70">
              What each plan is for, what's inside, and what's waiting one step
              up.
            </p>
          </div>
          <div className="mt-10 space-y-5">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className="rounded-modal border border-line bg-card p-6 md:p-8"
              >
                <div className="md:flex md:items-start md:gap-8">
                  <div className="md:w-72 md:shrink-0">
                    <h3 className="text-xl text-ink">
                      {tier.name}
                      <span className="ml-2 font-sans-force text-sm font-bold text-muted">
                        {formatTierPrice(tier.priceKes)}/mo
                      </span>
                    </h3>
                    <p className="mt-1 font-sans-force text-xs font-bold uppercase tracking-widest text-primary">
                      {tier.audience}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-ink/70">
                      {tier.pitch}
                    </p>
                  </div>
                  <div className="mt-5 grid flex-1 gap-6 sm:grid-cols-2 md:mt-0">
                    <div>
                      <h4 className="font-sans-force text-xs font-extrabold uppercase tracking-widest text-muted">
                        What you get
                      </h4>
                      <ul className="mt-3 space-y-2">
                        {tier.included.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2 text-sm text-ink"
                          >
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {tier.missing.length > 0 && (
                      <div>
                        <h4 className="font-sans-force text-xs font-extrabold uppercase tracking-widest text-muted">
                          Not on this plan
                        </h4>
                        <ul className="mt-3 space-y-2">
                          {tier.missing.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-sm text-muted"
                            >
                              <Lock className="mt-0.5 size-4 shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA — full-bleed dark */}
      <section className="band-ink">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-16 text-center md:py-24">
          <h2 className="max-w-xl text-3xl sm:text-4xl md:text-5xl">
            Every shop starts free.
          </h2>
          <p className="max-w-md text-lg text-white/70">
            Open your shop on Explorer today, upgrade whenever your catalog
            outgrows it.
          </p>
          <Link to="/signup" className="mt-2">
            <Button size="lg">
              Open your Shop <ArrowRight className="size-5" />
            </Button>
          </Link>
          <p className="text-xs font-medium text-white/50">
            Still deciding?{" "}
            <Link
              to="/faq"
              className="font-bold text-white underline underline-offset-2"
            >
              Read the FAQ
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
}) {
  return (
    <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-line bg-fill p-1">
      {(["monthly", "annual"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "font-sans-force inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors",
            billing === option
              ? "bg-card text-ink shadow-soft"
              : "text-muted hover:text-ink",
          )}
        >
          {option === "monthly" ? "Monthly" : "Annual"}
          {option === "annual" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                billing === "annual"
                  ? "bg-primary/12 text-primary"
                  : "bg-primary/10 text-primary",
              )}
            >
              Save 17%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
