import {
  ArrowRight,
  Boxes,
  Link2,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/Button";
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "@/components/ui/BrandIcons";
import { useSeo } from "@/hooks/useSeo";
import { welcomeSeo } from "@/lib/seo";
import { MarketingShell } from "./MarketingShell";

const steps = [
  {
    icon: ShoppingBag,
    title: "Open your Shop",
    body: "Name it, pick your link, add your first products in minutes.",
  },
  {
    icon: Link2,
    title: "Link your socials",
    body: "Connect WhatsApp, Instagram and Facebook so orders come straight to you.",
  },
  {
    icon: Sparkles,
    title: "Share your link",
    body: "Drop pulseshop.space/yourshop in your bio. Every tap lands on your store.",
  },
];

/* Truthful, product-derived figures rather than invented metrics — the Shopify
   stats-band convention without fabricating traction the product can't claim. */
const stats = [
  { value: "KES 0", label: "to open your shop" },
  { value: "3", label: "social channels built in" },
  { value: "5 min", label: "to a live shop link" },
  { value: "∞", label: "room to grow your catalog" },
];

export function LandingPage() {
  useSeo(useMemo(() => welcomeSeo(window.location.origin), []));

  return (
    <MarketingShell>
      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-10 md:grid-cols-2 md:gap-12 md:pt-20">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" />
              Your Store. Your Link. Your Sales.
            </span>
          </Reveal>
          <Reveal delay={70}>
            <h1 className="mt-5 text-4xl leading-[1.06] tracking-tight text-ink sm:text-5xl sm:leading-[1.02] md:text-6xl">
              Turn your bio link into a real store.
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/70">
              PulseShop gives sellers a hosted shop that lives behind their
              daily posts; shoppers browse your catalog straight from Instagram,
              Facebook or WhatsApp.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <EmailCapture />

            <p className="mt-3 text-xs font-medium text-muted">
              Free to start · No card needed · Live in minutes
            </p>
            <p className="mt-4 text-sm text-ink/70">
              Already selling with us?{" "}
              <Link
                to="/login"
                className="font-bold text-primary underline underline-offset-2"
              >
                Log in
              </Link>
            </p>
          </Reveal>
        </div>

        {/* signature: a bio link resolving into a live shop */}
        <Reveal delay={120}>
          <ShopPreview />
        </Reveal>
      </section>

      {/* channel strip — the apps the whole pitch rests on */}
      <section className="mx-auto max-w-6xl px-5 pb-6">
        <div className="flex flex-col items-center gap-4 border-y border-line py-6 text-center sm:flex-row sm:justify-center sm:gap-8">
          <p className="font-sans-force text-xs font-bold uppercase tracking-widest text-muted">
            Sells where your customers already are
          </p>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-whatsapp text-white">
              <WhatsAppIcon className="size-5" />
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-instagram text-white">
              <InstagramIcon className="size-5" />
            </span>
            <span className="flex size-9 items-center justify-center rounded-full bg-facebook text-white">
              <FacebookIcon className="size-5" />
            </span>
          </div>
        </div>
      </section>

      {/* stats band — full-bleed dark, the Shopify pacing break */}
      <section className="band-ink grain mt-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-5 py-12 md:grid-cols-4 md:gap-8 md:py-16">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 80} className="text-center">
              <p className="font-display text-4xl tracking-tight md:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-white/60">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* how it works — an asymmetric split: a left-aligned header held sticky
          on desktop while a numbered rail scrolls past it. Breaks the earlier
          three-equal-columns pattern for an editorial, sequential read. */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-28">
        <div className="grid gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-16">
          <div className="md:sticky md:top-28 md:self-start">
            <Reveal>
              <span className="font-sans-force text-xs font-bold uppercase tracking-widest text-primary">
                How it works
              </span>
              <h2 className="mt-3 text-3xl text-ink md:text-5xl">
                Live in three steps
              </h2>
              <p className="mt-4 max-w-sm text-base leading-relaxed text-ink/70">
                No warehouse, no card machine, no setup marathon; just your shop,
                behind your link.
              </p>
              <Link to="/signup" className="mt-7 inline-block">
                <Button size="lg">
                  Open your Shop <ArrowRight className="size-5" />
                </Button>
              </Link>
            </Reveal>
          </div>

          <ol className="relative">
            {/* the rail the numerals thread onto — a soft gradient so it fades
                out at both ends instead of stopping in a hard cap */}
            <span
              aria-hidden
              className="absolute left-7 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-line to-transparent md:left-8"
            />
            {steps.map(({ icon: Icon, title, body }, i) => (
              <Reveal
                as="li"
                key={title}
                delay={i * 90}
                className="relative flex gap-5 pb-10 last:pb-0 md:gap-7"
              >
                {/* opaque bead masks the rail so the number sits ON the line */}
                <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-card font-display text-2xl text-primary shadow-soft md:size-16 md:text-3xl">
                  {i + 1}
                </span>
                <div className="pt-1.5 md:pt-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    <span className="font-sans-force text-xs font-bold uppercase tracking-widest text-muted">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl text-ink md:text-2xl">{title}</h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/70 md:text-base">
                    {body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* features — a bento of one lead tile and three supporting ones */}
      <section className="grain bg-fill-soft">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <Reveal className="max-w-xl">
            <span className="font-sans-force text-xs font-bold uppercase tracking-widest text-primary">
              The toolkit
            </span>
            <h2 className="mt-3 text-3xl text-ink md:text-5xl">
              Everything to run your shop
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink/70">
              One dashboard for your catalog, your orders and the links that
              bring buyers in.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3 md:grid-rows-2">
            {/* lead tile — coral, spans two columns */}
            <Reveal
              as="article"
              className="flex flex-col justify-between rounded-bento bg-primary p-8 text-on-accent md:col-span-2 md:row-span-2"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-white/20">
                <MessageCircle className="size-6" />
              </span>
              <div className="mt-8">
                <h3 className="text-2xl text-on-accent md:text-3xl">
                  Orders on the apps you already use
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-on-accent/85">
                  Advertise and connect with customers through their socials,
                  build a community, and take orders straight into WhatsApp,
                  Instagram and Facebook.
                </p>
              </div>
            </Reveal>

            <FeatureTile
              icon={Boxes}
              delay={80}
              title="One HQ for your catalog"
              body="Add products, set prices and discounts, and track stock from a single dashboard."
            />
            <FeatureTile
              icon={Wallet}
              delay={160}
              title="Get paid your way"
              body="Take M-Pesa, PayPal and card payments when you're ready, or keep it simple with pay-on-delivery."
            />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <FeatureTile
              icon={Link2}
              title="Links that look the part"
              body="Your shop shows a rich preview everywhere you paste it: bio, story, DM or search."
            />
            <FeatureTile
              icon={ShoppingBag}
              delay={80}
              title="A storefront, not a link list"
              body="Buyers land on a real catalog with photos, variants and prices, then order in a tap."
            />
          </div>
        </div>
      </section>

      {/* closing CTA — full-bleed dark */}
      <section className="band-ink grain">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-16 text-center md:py-24">
          <h2 className="max-w-xl text-3xl sm:text-4xl md:text-5xl">
            Ready to open your shop?
          </h2>
          <p className="max-w-md text-lg text-white/70">
            Set it up today and share your link before the day is out.
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
        </Reveal>
      </section>
    </MarketingShell>
  );
}

/** The Shopify hero convention: an inline email field + primary CTA. The email
 *  is carried through to signup so the field isn't a dead end. */
function EmailCapture() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  function start(e: React.FormEvent) {
    e.preventDefault();
    navigate(email ? `/signup?email=${encodeURIComponent(email)}` : "/signup");
  }

  return (
    <form
      onSubmit={start}
      className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
    >
      <input
        type="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        aria-label="Email address"
        className="h-13 flex-1 rounded-btn border border-line bg-card px-4 text-base text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <Button type="submit" size="lg" className="shrink-0">
        Start free <ArrowRight className="size-5" />
      </Button>
    </form>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  body,
  delay = 0,
}: {
  icon: typeof Boxes;
  title: string;
  body: string;
  delay?: number;
}) {
  return (
    <Reveal
      as="article"
      delay={delay}
      className="group rounded-bento border border-line bg-card p-7 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-float"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary transition-transform duration-200 group-hover:scale-110">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 text-xl text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
    </Reveal>
  );
}

/** The hero artifact: a shop link previewing as an actual storefront card. */
function ShopPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* the link chip */}
      <div className="glass mx-auto mb-4 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink">
        <Link2 className="size-4 text-primary" />
        pulseshop.space/<span className="text-primary">zawadistyles</span>
      </div>

      {/* the resolved shop */}
      <div className="glass-strong rotate-[-2deg] rounded-modal p-5 shadow-[var(--shadow-float)]">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-xl font-extrabold text-primary">
            ZS
          </div>
          <h3 className="mt-3 text-lg font-extrabold text-ink">Zawadi Styles</h3>
          <p className="font-sans-force text-xs text-muted">
            @zawadistyles · Nairobi, KE
          </p>
          <div className="mt-1 flex items-center gap-1 text-xs font-bold text-ink">
            <Star className="size-3.5 fill-amber-400 text-amber-400" /> 4.8 · 348
            orders
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            "bg-rose-100",
            "bg-teal-100",
            "bg-amber-100",
            "bg-line",
            "bg-sky-100",
            "bg-primary/15",
          ].map((bg, i) => (
            <div key={i} className={`aspect-square rounded-xl ${bg}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-whatsapp text-white">
              <WhatsAppIcon className="size-4" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-instagram text-white">
              <InstagramIcon className="size-4" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-facebook text-white">
              <FacebookIcon className="size-4" />
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-on-accent">
            <ShoppingBag className="size-3.5" /> Order now
          </span>
        </div>
      </div>
    </div>
  );
}
