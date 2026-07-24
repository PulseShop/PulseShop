import { ArrowRight, HeartHandshake, MessageCircle, Sparkles, Store } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { useSeo } from "@/hooks/useSeo";
import { aboutSeo } from "@/lib/seo";
import { MarketingShell } from "./MarketingShell";

const FOUNDERS = [
  {
    initials: "RG",
    name: "Raynald Gitau",
    role: "Founder",
  },
  {
    initials: "WK",
    name: "Wilch Kelvin",
    role: "Co-founder",
  },
];

const VALUES = [
  {
    icon: Store,
    title: "Local shops first",
    body: "PulseShop is built for the seller posting from their phone between customers — not for enterprises. If a feature doesn't help a local shop sell more, it doesn't ship.",
  },
  {
    icon: MessageCircle,
    title: "Meet buyers where they are",
    body: "Kenyans already shop through WhatsApp, Instagram and Facebook. We don't ask anyone to change how they buy — we put a real storefront behind the conversations already happening.",
  },
  {
    icon: HeartHandshake,
    title: "Simple enough to trust",
    body: "No jargon, no setup marathons, no card required to start. A seller should go from first product photo to a shareable shop link in minutes.",
  },
];

export function AboutPage() {
  useSeo(useMemo(() => aboutSeo(window.location.origin), []));

  return (
    <MarketingShell>
      {/* hero */}
      <section className="mx-auto max-w-3xl px-5 pb-4 pt-10 text-center md:pt-14">
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          Our story
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-5xl">
          Helping local shops evolve into the next generation of selling.
        </h1>
      </section>

      {/* story */}
      <section className="mx-auto max-w-2xl space-y-5 px-5 py-8 text-base leading-relaxed text-ink/80">
        <p>
          PulseShop began with a simple observation: e-commerce was booming everywhere, yet
          the local shops we knew — the sellers posting products to their status every
          morning, taking orders in their DMs — were being left out of it. The tools built
          for online selling assumed a warehouse, a card machine and a marketing team.
          Their customers, meanwhile, were already shopping on WhatsApp, Instagram and
          Facebook.
        </p>
        <p>
          Inspired by that wave of trending e-commerce, founder{" "}
          <strong className="font-bold text-ink">Raynald Gitau</strong> and co-founder{" "}
          <strong className="font-bold text-ink">Wilch Kelvin</strong> set out to close the
          gap — to give every local shop a real storefront that lives right behind the
          social posts they already make, so evolving into the new generation of online
          shopping takes minutes, not months.
        </p>
        <p>
          Today that idea is PulseShop: a link you drop in your bio that opens into a full
          catalogue, takes orders straight to your chats, and grows with your shop — from
          the first five products to a storefront that shows up in search results.
        </p>
      </section>

      {/* founders */}
      <section className="mx-auto max-w-4xl px-5 py-8">
        <h2 className="text-center text-2xl font-extrabold text-ink">The team</h2>
        <div className="mx-auto mt-6 grid max-w-lg gap-4 sm:grid-cols-2">
          {FOUNDERS.map((person) => (
            <div key={person.name} className="glass flex flex-col items-center rounded-card p-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-xl font-extrabold text-primary">
                {person.initials}
              </div>
              <h3 className="mt-3 text-base font-extrabold text-ink">{person.name}</h3>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{person.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* values */}
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="text-center text-2xl font-extrabold text-ink">What we believe</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-card p-5">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="glass-strong flex flex-col items-center gap-5 rounded-modal px-6 py-12 text-center">
          <h2 className="max-w-md text-2xl font-extrabold text-ink md:text-3xl">
            Be part of the story.
          </h2>
          <p className="max-w-sm text-sm text-ink/70">
            Open your shop today and join the sellers already growing on PulseShop.
          </p>
          <Link to="/signup">
            <Button size="lg" className="rounded-full">
              Create your shop <ArrowRight className="size-5" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
