import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Headset,
  Loader2,
  MapPin,
  Sparkles,
  Store,
} from "lucide-react";
import { Reveal } from "@/components/common/Reveal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { EarlyAccessInput } from "@/types";
import { MarketingShell } from "./MarketingShell";

/**
 * Early access for founding sellers — the public form at /earlyaccessform.
 *
 * The brief is a lead-capture form, but the signature is what turns it from a
 * form into a moment: a FOUNDING SELLER PASS that fills in live as the shop
 * owner types (their shop name, their name, their town land on the card), then
 * gets sealed with a gold ENROLLED stamp on submit. The thing they are
 * registering for takes shape in front of them, so the reward is visible before
 * they commit, and the payoff is the stamp, not a toast.
 *
 * Everything the pass sits inside is deliberately quiet — the app's own glass
 * form, its cream canvas, its one grotesque — so the sealed pass is the single
 * memorable element and nothing competes with it.
 */

/** What top tier actually unlocks, in the app's own words — no invented perks. */
const PERKS = [
  "Unlimited products, photos and variants",
  "A slot on the marketplace front page",
  "Group buys and discount codes",
  "Share-link analytics for every post",
  "The full sales analytics dashboard",
  "Priority support on WhatsApp",
] as const;

/** The concierge really is a sequence, which is the one case numbering earns. */
const SETUP_STEPS = [
  { n: 1, title: "We call you", body: "A specialist reaches out on WhatsApp to learn what you sell." },
  { n: 2, title: "We build it together", body: "Photos, prices and your shop link, set up on a call with you." },
  { n: 3, title: "You go live", body: "Share your link and take your first orders. The nine months start here." },
] as const;

type Field = keyof EarlyAccessInput;
type Errors = Partial<Record<Field, string>>;

const EMPTY: EarlyAccessInput = {
  fullName: "",
  email: "",
  phone: "",
  shopName: "",
  location: "",
  referral: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: EarlyAccessInput): Errors {
  const e: Errors = {};
  if (!form.fullName.trim()) e.fullName = "Tell us who you are.";
  if (!form.email.trim()) e.email = "We need an email to reach you.";
  else if (!EMAIL_RE.test(form.email.trim())) e.email = "That email doesn't look right.";
  // Kenyan mobile numbers are 10+ digits; count digits, not characters, so
  // spaces and a +254 prefix don't trip the check.
  const digits = form.phone.replace(/\D/g, "");
  if (!form.phone.trim()) e.phone = "A mobile number, so the specialist can call.";
  else if (digits.length < 7) e.phone = "That number looks too short.";
  if (!form.shopName.trim()) e.shopName = "What is your shop called?";
  if (!form.location.trim()) e.location = "Where does your shop trade?";
  return e;
}

export function EarlyAccessFormPage() {
  const [form, setForm] = useState<EarlyAccessInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<EarlyAccessInput>(EMPTY);

  useEffect(() => {
    document.title = "Early access for sellers · PulseShop";
  }, []);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    // Clear a field's error the moment they start fixing it — re-validated on submit.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setStatus("submitting");
    setSubmitError(null);
    try {
      await services.earlyAccess.submit(form);
      setSubmitted(form);
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("idle");
      setSubmitError("We couldn't send that just now. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <MarketingShell>
        <SuccessView data={submitted} />
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      {/* Hero — the offer stated once, plainly. */}
      <section className="mx-auto max-w-6xl px-5 pt-10 md:pt-16">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Early access · Founding sellers
          </span>
        </Reveal>
        <Reveal delay={70}>
          <h1 className="mt-5 max-w-3xl text-4xl leading-[1.04] tracking-tight text-ink md:text-6xl">
            Bring your shop online. The first nine months are on us.
          </h1>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink/70">
            PulseShop is opening early access to a founding group of sellers. Register your shop and
            we set you up on our top tier, free for nine months, with a specialist beside you the
            whole way from shelf to storefront.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink/70">
            {["Nine months of top tier, free", "No card, no commitment", "A specialist sets you up"].map(
              (t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-primary" aria-hidden />
                  {t}
                </li>
              ),
            )}
          </ul>
        </Reveal>
      </section>

      {/* The pass + value on the left, the form on the right. On a phone the form
          comes first (order utilities): the action shouldn't sit under the pitch. */}
      <section className="mx-auto mt-10 grid max-w-6xl gap-8 px-5 pb-20 lg:mt-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="order-2 space-y-5 lg:order-1 lg:sticky lg:top-24">
          <Reveal>
            <FoundingPass
              shopName={form.shopName}
              fullName={form.fullName}
              location={form.location}
            />
          </Reveal>

          <Reveal delay={80}>
            <div className="rounded-card border border-line bg-card p-5 shadow-soft">
              <h2 className="text-sm font-bold text-ink">Your top tier, unlocked from day one</h2>
              <p className="mt-0.5 text-xs text-muted">
                Everything on our Influencer plan, free for your first nine months.
              </p>
              <ul className="mt-4 grid gap-2.5">
                {PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-sm text-ink">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="rounded-card border border-line bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Headset className="size-4" aria-hidden />
                </span>
                <h2 className="text-sm font-bold text-ink">A specialist switches you over</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                You won't do this alone. Going digital is three steps, and someone from PulseShop is
                on every one of them.
              </p>
              <ol className="mt-4 space-y-3">
                {SETUP_STEPS.map((step) => (
                  <li key={step.n} className="flex gap-3">
                    <span className="font-sans-force flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-bold tabular-nums text-primary">
                      {step.n}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{step.title}</p>
                      <p className="text-xs leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>

        {/* The form */}
        <Reveal className="order-1 lg:order-2" delay={60}>
          <form
            onSubmit={handleSubmit}
            noValidate
            className="glass-strong rounded-modal p-6 sm:p-8"
          >
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-5 text-primary" aria-hidden />
              <h2 className="text-xl font-extrabold tracking-tight text-ink">
                Claim your early access
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Founding cohort. We only use these details to set your shop up.
            </p>

            <div className="mt-6 grid gap-4">
              <Input
                name="fullName"
                label="Full name"
                autoComplete="name"
                placeholder="e.g. Amina Njoroge"
                value={form.fullName}
                onChange={set("fullName")}
                error={errors.fullName}
                aria-invalid={Boolean(errors.fullName)}
              />
              <Input
                name="email"
                type="email"
                inputMode="email"
                label="Email address"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
                error={errors.email}
                aria-invalid={Boolean(errors.email)}
              />
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                label="Mobile number"
                autoComplete="tel"
                placeholder="07xx xxx xxx"
                value={form.phone}
                onChange={set("phone")}
                error={errors.phone}
                aria-invalid={Boolean(errors.phone)}
              />
              <Input
                name="shopName"
                label="Shop name"
                autoComplete="organization"
                placeholder="e.g. Pulse Threads"
                value={form.shopName}
                onChange={set("shopName")}
                error={errors.shopName}
                aria-invalid={Boolean(errors.shopName)}
              />
              <Input
                name="location"
                label="Where is your shop?"
                autoComplete="address-level2"
                placeholder="Town or area, e.g. Nairobi CBD"
                value={form.location}
                onChange={set("location")}
                error={errors.location}
                aria-invalid={Boolean(errors.location)}
              />
              <Textarea
                name="referral"
                label="Where did you hear about us? (optional)"
                placeholder="A friend, Instagram, a market day…"
                value={form.referral}
                onChange={set("referral")}
              />
            </div>

            {submitError && (
              <p
                role="alert"
                className="mt-4 rounded-btn border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
              >
                {submitError}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full"
              disabled={status === "submitting"}
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Reserving your spot…
                </>
              ) : (
                <>
                  Reserve my early access
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>

            <p className="mt-3 text-center text-xs text-muted">
              Free for nine months · No card needed · Already selling with us?{" "}
              <Link to="/login" className="font-bold text-primary underline underline-offset-2">
                Log in
              </Link>
            </p>
          </form>
        </Reveal>
      </section>
    </MarketingShell>
  );
}

/* ------------------------------------------------------------------------- */
/* The signature: a founding-seller pass that fills in as the form is typed. */
/* ------------------------------------------------------------------------- */

function FoundingPass({
  shopName,
  fullName,
  location,
  sealed = false,
}: {
  shopName: string;
  fullName: string;
  location: string;
  sealed?: boolean;
}) {
  const shop = shopName.trim();
  const name = fullName.trim();
  const town = location.trim();
  // The cohort year is stamped on the pass — honest, and not a fabricated rank.
  const cohort = new Date().getFullYear();

  return (
    <div className="band-ink grain relative overflow-hidden rounded-modal p-6">
      {/* Top edge: the mark, and what this pass is. */}
      <div className="flex items-center justify-between">
        <span className="font-display text-base tracking-tight text-white">PulseShop</span>
        <span className="font-sans-force flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
          <span className="size-1.5 rounded-full bg-[#2dd4bf]" aria-hidden />
          Early access
        </span>
      </div>

      <div className="my-5 border-t border-dashed border-white/15" />

      <p className="font-sans-force text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">
        Founding seller pass
      </p>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl leading-tight",
          shop ? "text-white" : "text-white/35",
        )}
      >
        {shop || "Your shop"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <PassField label="Issued to" value={name} placeholder="Your name" icon={Store} />
        <PassField label="Trading in" value={town} placeholder="Your town" icon={MapPin} />
      </div>

      <div className="my-5 border-t border-dashed border-white/15" />

      {/* The terms — the reason to fill the form, printed on the card. */}
      <div className="flex items-end justify-between">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <Term label="Tier" value="Top tier" />
          <Term label="Free for" value="9 months" />
          <Term label="Setup" value="Specialist" />
          <Term label="Cohort" value={String(cohort)} />
        </div>
      </div>

      {/* Sealed on submit. Absolutely positioned so it lands over the terms like
          a real stamp on a ticket, not a badge in the corner. */}
      {sealed && (
        <>
          <span
            aria-hidden
            className="animate-stamp-halo pointer-events-none absolute right-8 top-1/2 size-28 -translate-y-1/2 rounded-full bg-[#e8bb4a]/25"
          />
          <span
            aria-hidden
            className="animate-stamp-press pointer-events-none absolute right-5 top-1/2 flex size-24 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[3px] border-[#e8bb4a] text-center text-[#e8bb4a] shadow-[0_0_0_2px_rgba(232,187,74,0.15)_inset]"
          >
            <span className="font-sans-force text-[8px] font-bold uppercase tracking-[0.24em]">
              Founding
            </span>
            <span className="font-display text-base leading-none">ENROLLED</span>
            <span className="font-sans-force text-[8px] font-bold uppercase tracking-[0.24em] tabular-nums">
              {cohort}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

function PassField({
  label,
  value,
  placeholder,
  icon: Icon,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: typeof Store;
}) {
  return (
    <div>
      <p className="font-sans-force text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-sm font-semibold",
          value ? "text-white/90" : "text-white/30",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-white/40" aria-hidden />
        <span className="truncate">{value || placeholder}</span>
      </p>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans-force text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-[#5eead4]">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* The payoff: the pass, sealed.                                             */
/* ------------------------------------------------------------------------- */

function SuccessView({ data }: { data: EarlyAccessInput }) {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";

  const NEXT = useMemo(
    () => [
      {
        title: "We'll reach out on WhatsApp",
        body: `A specialist will message ${data.phone.trim() || "your number"} within two business days.`,
      },
      {
        title: "We set your shop up together",
        body: `${data.shopName.trim() || "Your shop"} goes online on a call, at no cost to you.`,
      },
      {
        title: "Your nine free months begin",
        body: "Top tier is on us from the day you go live. No card, no catch.",
      },
    ],
    [data],
  );

  return (
    <section className="mx-auto max-w-3xl px-5 pb-24 pt-14 md:pt-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs font-bold text-primary">
          <BadgeCheck className="size-3.5" aria-hidden />
          You're on the founding list
        </span>
        <h1 className="mt-5 text-4xl leading-[1.05] tracking-tight text-ink md:text-5xl">
          Welcome aboard, {firstName}.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink/70">
          Your early-access pass is reserved. Keep an eye on WhatsApp, a PulseShop specialist takes
          it from here.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-md">
        <FoundingPass
          shopName={data.shopName}
          fullName={data.fullName}
          location={data.location}
          sealed
        />
      </div>

      <ol className="mx-auto mt-10 max-w-md space-y-4">
        {NEXT.map((item, i) => (
          <li key={item.title} className="flex gap-3.5">
            <span className="font-sans-force flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold tabular-nums text-on-accent">
              {i + 1}
            </span>
            <div className="pt-0.5">
              <p className="text-sm font-bold text-ink">{item.title}</p>
              <p className="text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/">
          <Button size="lg">
            Browse PulseShop
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </Link>
        <Link to="/welcome">
          <Button variant="outline" size="lg">
            Back to home
          </Button>
        </Link>
      </div>
    </section>
  );
}
