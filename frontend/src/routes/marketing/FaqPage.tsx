import { ArrowRight, ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { useSeo } from "@/hooks/useSeo";
import { FAQ_ITEMS, faqSeo } from "@/lib/seo";
import { MarketingShell } from "./MarketingShell";

/**
 * The questions and answers come from lib/seo.ts — the same array that builds
 * the FAQPage JSON-LD the server emits — so the structured data and the page a
 * human reads can never disagree.
 */
export function FaqPage() {
  useSeo(useMemo(() => faqSeo(window.location.origin), []));

  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-5 pb-4 pt-10 text-center md:pt-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-5xl">
          Frequently asked questions
        </h1>
        <p className="mt-3 text-base text-ink/70">
          Everything sellers and shoppers ask us, answered in one place.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="space-y-3">
          {FAQ_ITEMS.map(({ q, a }) => (
            <details key={q} className="group rounded-card bg-card shadow-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-bold text-ink md:text-base">{q}</span>
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-ink/70">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="glass-strong flex flex-col items-center gap-5 rounded-modal px-6 py-12 text-center">
          <h2 className="max-w-md text-2xl font-extrabold text-ink md:text-3xl">
            Question answered? Open your shop.
          </h2>
          <p className="max-w-sm text-sm text-ink/70">
            It's free to start — five products, your own link, live in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup">
              <Button size="lg" className="rounded-full">
                Create your shop <ArrowRight className="size-5" />
              </Button>
            </Link>
            <Link to="/prices">
              <Button variant="outline" size="lg" className="rounded-full border-white/60 bg-white/70">
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
