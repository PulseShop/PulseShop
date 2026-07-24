import { ArrowRight, Check, Lock, Minus, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { useSeo } from "@/hooks/useSeo";
import { pricesSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { MarketingShell } from "./MarketingShell";
import { COMPARISON, TIERS, formatTierPrice } from "./tiers";

export function PricesPage() {
  useSeo(useMemo(() => pricesSeo(window.location.origin), []));

  return (
    <MarketingShell>
      {/* hero */}
      <section className="mx-auto max-w-4xl px-5 pb-4 pt-10 text-center md:pt-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-5xl">
          Choose the Perfect Plan for Your Shop
        </h1>
        <p className="mt-3 text-base text-ink/70">
          Simple, transparent pricing to grow your business.
        </p>
      </section>

      {/* tier cards */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-5 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col rounded-modal bg-card p-6 shadow-soft",
                tier.highlight && "border-2 border-primary shadow-[var(--shadow-float)]",
              )}
            >
              {tier.highlight && (
                <span className="mb-3 inline-flex w-fit items-center gap-1.5 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <Sparkles className="size-3.5" /> Best value
                </span>
              )}
              <div className="text-center">
                <h2 className="text-xl font-extrabold text-ink">{tier.name}</h2>
                <p className="mt-2 text-3xl font-extrabold text-ink">
                  {formatTierPrice(tier.priceKes)}
                  <span className="text-base font-bold text-muted">/mo</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-muted">{tier.audience}</p>
              </div>

              <ul className="mt-6 flex-1 space-y-3">
                {tier.cardLines.map((line) => (
                  <li key={line.text} className="flex items-start gap-2.5 text-sm">
                    {line.locked ? (
                      <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
                    ) : (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    )}
                    <span className={cn("font-semibold", line.locked ? "text-muted" : "text-ink")}>
                      {line.text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {tier.available ? (
                  <Link to="/signup" className="block">
                    <Button size="lg" className="w-full">
                      {tier.cta}
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Button size="lg" className="w-full" disabled>
                      {tier.cta} — Coming soon
                    </Button>
                    <p className="mt-2 text-center text-xs font-medium text-muted">
                      Billing launches soon. Start free today and upgrade later.
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* tier detail */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-2xl font-extrabold text-ink md:text-3xl">
          Every plan in detail
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink/70">
          What each plan is for, what's inside, and what's waiting one step up.
        </p>
        <div className="mt-8 space-y-5">
          {TIERS.map((tier) => (
            <div key={tier.id} className="glass rounded-modal p-6 md:p-8">
              <div className="md:flex md:items-start md:gap-8">
                <div className="md:w-72 md:shrink-0">
                  <h3 className="text-lg font-extrabold text-ink">
                    {tier.name}
                    <span className="ml-2 text-sm font-bold text-muted">
                      {formatTierPrice(tier.priceKes)}/mo
                    </span>
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    {tier.audience}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">{tier.pitch}</p>
                </div>
                <div className="mt-5 grid flex-1 gap-6 sm:grid-cols-2 md:mt-0">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">
                      What you get
                    </h4>
                    <ul className="mt-3 space-y-2">
                      {tier.included.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-ink">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {tier.missing.length > 0 && (
                    <div>
                      <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">
                        Not on this plan
                      </h4>
                      <ul className="mt-3 space-y-2">
                        {tier.missing.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-muted">
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
      </section>

      {/* comparison table */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-2xl font-extrabold text-ink md:text-3xl">
          Compare plans side by side
        </h2>
        <div className="mt-8 overflow-x-auto rounded-modal bg-card shadow-soft">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="px-5 py-4 font-bold text-muted">Feature</th>
                {TIERS.map((tier) => (
                  <th
                    key={tier.id}
                    className={cn(
                      "px-5 py-4 text-center font-extrabold text-ink",
                      tier.highlight && "text-primary",
                    )}
                  >
                    {tier.name}
                    <span className="block text-xs font-bold text-muted">
                      {formatTierPrice(tier.priceKes)}/mo
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-3.5 font-semibold text-ink">{row.feature}</td>
                  {row.values.map((value, i) => (
                    <td key={i} className="px-5 py-3.5 text-center">
                      {value === true ? (
                        <Check className="mx-auto size-5 text-primary" aria-label="Included" />
                      ) : value === false ? (
                        <Minus className="mx-auto size-5 text-stone-300" aria-label="Not included" />
                      ) : (
                        <span className="font-semibold text-ink">{value}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* closing CTA */}
      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="glass-strong flex flex-col items-center gap-5 rounded-modal px-6 py-12 text-center">
          <h2 className="max-w-md text-2xl font-extrabold text-ink md:text-3xl">
            Every shop starts free.
          </h2>
          <p className="max-w-sm text-sm text-ink/70">
            Open your shop on Explorer today — upgrade whenever your catalogue outgrows it.
          </p>
          <Link to="/signup">
            <Button size="lg" className="rounded-full">
              Create your shop <ArrowRight className="size-5" />
            </Button>
          </Link>
          <p className="text-xs font-medium text-muted">
            Still deciding?{" "}
            <Link to="/faq" className="font-bold text-primary underline underline-offset-2">
              Read the FAQ
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
