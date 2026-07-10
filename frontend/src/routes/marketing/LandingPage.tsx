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
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "@/components/ui/BrandIcons";

const steps = [
  {
    icon: ShoppingBag,
    title: "Create your shop",
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

const features = [
  {
    icon: MessageCircle,
    title: "Orders on the apps you already use",
    body: "Advertise and connect with your customers through their socials and build a community.",
  },
  {
    icon: Boxes,
    title: "One HQ for your whole catalog",
    body: "Add products, set prices and discounts, and track stock from a single dashboard.",
  },
  {
    icon: Wallet,
    title: "Get paid your way",
    body: "Take M-Pesa and PayPal when you're ready, or keep it simple with pay-on-delivery.",
  },
  {
    icon: Link2,
    title: "Links that look the part",
    body: "Your shop shows a rich preview everywhere you paste it.",
  },
];

export function LandingPage() {
  return (
    <div className="app-surface min-h-dvh">
      {/* nav */}
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <span className="text-lg font-extrabold tracking-tight text-primary">
            PulseShop
          </span>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Create your shop</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-8 pt-10 md:grid-cols-2 md:pt-16">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" />
            Your Store. Your Link. Your Sales.
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-5xl">
            Turn your bio link into a real store.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink/70">
            PulseShop gives sellers a hosted shop that lives behind their daily
            posts. Shoppers browse your catalog through Instagram, Facebook or
            WhatsApp feed that act as your advertisment.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg" className="rounded-full">
                Create your shop <ArrowRight className="size-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                variant="outline"
                size="lg"
                className="rounded-full border-white/60 bg-white/70"
              >
                I already have a shop
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs font-medium text-muted">
            Free to start · No card needed · Live in minutes
          </p>
        </div>

        {/* signature: a bio link resolving into a live shop */}
        <ShopPreview />
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="text-center text-2xl font-extrabold text-ink">
          Live in three steps
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="glass rounded-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="text-xs font-bold text-muted">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-5xl px-5 pb-4">
        <div className="grid gap-4 md:grid-cols-2">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-card p-5">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* closing CTA */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="glass-strong flex flex-col items-center gap-5 rounded-modal px-6 py-12 text-center">
          <h2 className="max-w-md text-2xl font-extrabold text-ink md:text-3xl">
            Ready to open your shop?
          </h2>
          <p className="max-w-sm text-sm text-ink/70">
            Set it up today and share your link before the day is out.
          </p>
          <Link to="/signup">
            <Button size="lg" className="rounded-full">
              Create your shop <ArrowRight className="size-5" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-5 pb-10 pt-2 text-center">
        <p className="text-xs font-medium text-muted">
          © {new Date().getFullYear()} PulseShop · Built for sellers who sell on
          social.
        </p>
      </footer>
    </div>
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
          <h3 className="mt-3 text-base font-extrabold text-ink">
            Zawadi Styles
          </h3>
          <p className="text-xs text-muted">@zawadistyles · Nairobi, KE</p>
          <div className="mt-1 flex items-center gap-1 text-xs font-bold text-ink">
            <Star className="size-3.5 fill-amber-400 text-amber-400" /> 4.8 ·
            348 orders
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            "bg-rose-100",
            "bg-teal-100",
            "bg-amber-100",
            "bg-stone-200",
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-white">
            <ShoppingBag className="size-3.5" /> Order now
          </span>
        </div>
      </div>
    </div>
  );
}
