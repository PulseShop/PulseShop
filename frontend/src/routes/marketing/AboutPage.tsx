import {
  ArrowRight,
  HeartHandshake,
  MessageCircle,
  Sparkles,
  Store,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/Button";
import { useSeo } from "@/hooks/useSeo";
import { aboutSeo } from "@/lib/seo";
import { MarketingShell } from "./MarketingShell";

const FOUNDERS = [
  { initials: "RG", name: "Raynald Gitau", role: "CEO and Founder" },
  { initials: "WK", name: "Wilch Kelvin", role: "Co-founder" },
  { initials: "OA", name: "Ohawa Alex", role: "Head of Marketing" },
];

const VALUES = [
  {
    icon: Store,
    title: "Local shops first",
    body: "PulseShop is built for the seller posting from their phone between customers, not for enterprises. If a feature doesn't help a local shop sell more, it doesn't ship.",
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
      <Reveal
        as="section"
        className="mx-auto max-w-3xl px-5 pb-6 pt-12 text-center md:pt-20"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          Our story
        </span>
        {/* for_nav.png, not for_lightmode.png: the two are the same artwork,
            but for_lightmode has a flattened white background that would sit on
            the warm page surface as a visible white slab (and as a bright one in
            dark mode). Same swap as the nav for the dark theme. */}
        <img
          src="/icons/for_nav.png"
          alt=""
          width={1760}
          height={560}
          className="mx-auto mt-6 h-14 w-auto dark:hidden md:h-20"
        />
        <img
          src="/icons/wordmark-on-dark.png"
          alt=""
          width={1760}
          height={560}
          className="mx-auto mt-6 hidden h-14 w-auto dark:block md:h-20"
        />
        <h1 className="mt-6 text-4xl leading-[1.05] tracking-tight text-ink md:text-6xl">
          Helping local shops evolve into the next generation of selling.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink/70">
          A real storefront for every seller who runs their business from their
          phone and their social feed.
        </p>
      </Reveal>

      {/* mission band — full-bleed dark statement */}
      <section className="band-ink grain mt-8">
        <Reveal className="mx-auto max-w-4xl px-5 py-20 text-center">
          <p className="font-sans-force text-xs font-bold uppercase tracking-widest text-white/50">
            Why we exist
          </p>
          <p className="mt-6 text-3xl leading-snug tracking-tight md:text-4xl">
            E-commerce was booming everywhere, yet the local shops posting
            products every morning and taking orders in their DMs were being
            left out of it. PulseShop closes that gap.
          </p>
        </Reveal>
      </section>

      {/* story — asymmetric: a held eyebrow on the left, the prose on the right,
          so the section reads as an editorial column rather than centered text */}
      <section className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <div className="grid gap-8 md:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] md:gap-14">
          <Reveal className="md:sticky md:top-28 md:self-start">
            <span className="font-sans-force text-xs font-bold uppercase tracking-widest text-primary">
              The story
            </span>
            <p className="mt-3 font-display text-2xl leading-tight text-ink md:text-3xl">
              From a DM order to a real storefront.
            </p>
          </Reveal>
          <div className="space-y-5 text-lg leading-relaxed text-ink/80">
            <Reveal as="p">
              PulseShop began with a simple observation: the tools built for
              online selling assumed a warehouse, a card machine and a marketing
              team. Their customers, meanwhile, were already shopping on
              WhatsApp, Instagram and Facebook.
            </Reveal>
            <Reveal as="p" delay={80}>
              Inspired by that wave of trending e-commerce, founder{" "}
              <strong className="font-bold text-ink">Raynald Gitau</strong> and
              co-founder{" "}
              <strong className="font-bold text-ink">Wilch Kelvin</strong> set
              out to give every local shop a real storefront that lives right
              behind the social posts they already make, so evolving into the
              new generation of online shopping takes minutes, not months.
            </Reveal>
            <Reveal as="p" delay={160}>
              Today that idea is PulseShop: a link you drop in your bio that
              opens into a full catalogue, takes orders straight to your chats,
              and grows with your shop, from the first five products to a
              storefront that shows up in search results.
            </Reveal>
          </div>
        </div>
      </section>

      {/* team */}
      <section className="bg-fill-soft">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl text-ink md:text-4xl">The team</h2>
            <p className="mt-3 text-base text-ink/70">
              A small team building for the sellers we grew up around.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-2xl gap-5 sm:grid-cols-3">
            {FOUNDERS.map((person) => (
              <div
                key={person.name}
                className="flex flex-col items-center rounded-card border border-line bg-card p-7 text-center shadow-soft"
              >
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-xl font-extrabold text-primary">
                  {person.initials}
                </div>
                <h3 className="mt-4 text-lg text-ink">{person.name}</h3>
                <p className="font-sans-force text-xs font-bold uppercase tracking-widest text-muted">
                  {person.role}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* values */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl text-ink md:text-4xl">What we believe</h2>
          <p className="mt-3 text-base text-ink/70">
            Three convictions that decide what we build and what we leave out.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-card border border-line bg-card p-7 shadow-soft"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-xl text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — full-bleed dark */}
      <section className="band-ink">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-24 text-center">
          <h2 className="max-w-xl text-4xl md:text-5xl">Be part of the story.</h2>
          <p className="max-w-md text-lg text-white/70">
            Open your shop today and join the sellers already growing on
            PulseShop.
          </p>
          <Link to="/signup" className="mt-2">
            <Button size="lg">
              Open your Shop <ArrowRight className="size-5" />
            </Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
