import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Facebook, Instagram, Linkedin, Music2, Twitter, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { APP_VERSION_LABEL } from "@/lib/version";
import type { SocialLinks } from "@/types";

/**
 * The marketplace footer.
 *
 * WHY HALF OF IT DOES NOT LINK ANYWHERE. Most of these pages do not exist yet —
 * Terms, Cookies, Privacy, Shipping, Returns, and the rest are planned, not
 * built. The choice was between shipping links that 404 and shipping the shelf
 * they will sit on, and a footer whose links break is worse than one that is
 * visibly incomplete: a shopper who clicks "Privacy Policy" and lands on a Not
 * Found page learns something false about the platform.
 *
 * So an entry with a `to` is a link and an entry without one renders as dimmed,
 * non-interactive text carrying an explicit "coming soon" title. Wiring one up
 * later is a one-line change in the list below and nothing else.
 *
 * THE SOCIAL BUTTONS COME FROM THE DATABASE. Whatever is set in the control
 * room's Settings panel (platform_settings, migration 0051) renders as a real
 * link; a network with no URL yet renders as a disabled button rather than as a
 * link to a guessed handle. Disabled rather than silently dead, so the control
 * tells the truth about its own state to a screen reader as well as to a mouse.
 */

interface FooterLink {
  label: string;
  /** Omit for a section that has not been built. Renders dimmed, not clickable. */
  to?: string;
}

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Get to know us",
    links: [
      // The seller pitch, which is what "sell on PulseShop" means: /welcome is
      // the page `/` used to be before the marketplace took the front door.
      { label: "Sell on PulseShop", to: "/welcome" },
      { label: "About PulseShop", to: "/about" },
      { label: "Pricing and tiers", to: "/prices" },
      { label: "Contact us" },
    ],
  },
  {
    heading: "Let us help you",
    links: [
      { label: "Help Center", to: "/faq" },
      { label: "Shipping" },
      { label: "Returns and refunds" },
      { label: "Gift ideas" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service" },
      { label: "Privacy Policy" },
      { label: "Cookies" },
      { label: "Don't sell or share my personal information" },
      { label: "Report illicit content" },
    ],
  },
];

const SOCIALS: { key: keyof SocialLinks; label: string; Icon: typeof Facebook }[] = [
  { key: "facebook", label: "Facebook", Icon: Facebook },
  { key: "x", label: "X", Icon: Twitter },
  { key: "tiktok", label: "TikTok", Icon: Music2 },
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { key: "youtube", label: "YouTube", Icon: Youtube },
];

export function SiteFooter({ className }: { className?: string }) {
  // A plain public read, cached for the session: platform_settings carries a
  // public SELECT policy precisely so the footer does not need a signed-in
  // user to know where the shop's Instagram is. A failure leaves every icon in
  // its disabled state, which is the same thing an unset link does.
  const linksQ = useQuery({
    queryKey: ["social-links"],
    queryFn: () => services.admin.getSocialLinks(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const links = linksQ.data;

  return (
    <footer className={cn("border-t border-line bg-card", className)}>
      <div className="mx-auto max-w-[1180px] px-4 py-8 lg:px-6 lg:py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-sm font-bold text-ink">{column.heading}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        className="text-sm text-muted transition-colors hover:text-primary hover:underline"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <span
                        title="Coming soon"
                        className="cursor-default text-sm text-muted/60"
                      >
                        {link.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-sm font-bold text-ink">Follow us on:</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {SOCIALS.map(({ key, label, Icon }) => {
                const href = links?.[key]?.trim();
                return (
                  <li key={key}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        // noreferrer as well as noopener: the target page has no
                        // business knowing which of our pages sent the visitor.
                        rel="noopener noreferrer"
                        aria-label={`PulseShop on ${label}`}
                        className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <Icon className="size-4" aria-hidden />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-label={`${label} — coming soon`}
                        title="Coming soon"
                        className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition-colors disabled:cursor-default disabled:opacity-60"
                      >
                        <Icon className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-5">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} PulseShop. Every shop in one place.
          </p>
          <p className="text-xs text-muted/70">{APP_VERSION_LABEL}</p>
        </div>
      </div>
    </footer>
  );
}
