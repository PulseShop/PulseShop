import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
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
      {/* hero */}
      <section className="mx-auto max-w-3xl px-5 pb-4 pt-12 text-center md:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          Help center
        </span>
        <h1 className="mt-5 text-4xl tracking-tight text-ink md:text-6xl">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-lg text-ink/70">
          Everything sellers and shoppers ask us, answered in one place.
        </p>
      </section>

      {/* accordion */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <div className="space-y-3">
          {FAQ_ITEMS.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-card border border-line bg-card shadow-soft transition-colors open:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left [&::-webkit-details-marker]:hidden">
                <span className="font-sans-force text-base font-bold text-ink">
                  {q}
                </span>
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180 group-open:text-primary" />
              </summary>
              <p className="px-6 pb-6 text-sm leading-relaxed text-ink/70">
                {a}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ink/70">
          Still have a question?{" "}
          <Link
            to="/about"
            className="font-bold text-primary underline underline-offset-2"
          >
            Meet the team behind PulseShop
          </Link>
        </p>
      </section>

      {/* closing CTA — full-bleed dark */}
      <section className="band-ink">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-24 text-center">
          <h2 className="max-w-xl text-4xl md:text-5xl">
            Question answered? Open your shop.
          </h2>
          <p className="max-w-md text-lg text-white/70">
            It's free to start — five products, your own link, live in minutes.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup">
              <Button size="lg">
                Open your Shop <ArrowRight className="size-5" />
              </Button>
            </Link>
            <Link to="/prices">
              <Button
                variant="outline"
                size="lg"
                className="border-white/25 bg-white/5 text-white hover:border-white hover:text-white"
              >
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
