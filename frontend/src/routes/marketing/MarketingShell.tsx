import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/* These pages sell PulseShop to a seller, so "Home" is the pitch at /welcome,
   not the marketplace that now owns "/". "Browse shops" is the way back out to
   the shopper side for anyone who arrived here first. */
const NAV_LINKS = [
  { to: "/welcome", label: "Home", end: true },
  { to: "/prices", label: "Prices" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/", label: "Browse shops", end: true },
] as const;

/** The inline desktop nav. Five short links, laid out in a row from md up. */
function DesktopNav({ className }: { className?: string }) {
  return (
    <nav className={className}>
      {NAV_LINKS.map(({ to, label, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          {...rest}
          className={({ isActive }) =>
            cn(
              "rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-ink/70 hover:text-ink",
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Shared chrome for the public marketing pages (Home, Prices, About, FAQ):
 * one nav, one footer, so the pages read as one site.
 *
 * Below md the nav collapses into a menu button. The five links plus two CTAs
 * do not fit one bar under ~360px — the old two-row layout wrapped "Open Shop"
 * and clipped "Browse shops" on a 320px phone — so a phone gets the logo, the
 * one primary CTA, and a toggle that opens the rest. That is the standard
 * professional-site pattern and it fits at any width.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on navigation — a menu that stays open over the page you just moved to
  // reads as stuck.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Escape closes it, matching every other dismissible surface in the app.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="app-surface min-h-dvh">
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          {/* The wordmark carries the name. Two files rather than one because the
              supplied lockups set the type in navy, which disappears on the dark
              theme; wordmark-on-dark.png is that same art recoloured. Swapped in
              CSS so it is correct on the first paint. shrink-0 so the mark never
              gives up width to the actions beside it. */}
          <Link to="/welcome" aria-label="PulseShop home" className="flex shrink-0 items-center">
            <img
              src="/icons/for_darkmode.png"
              alt="PulseShop"
              width={440}
              height={140}
              className="h-8 w-auto dark:hidden"
            />
            <img
              src="/icons/wordmark-on-dark.png"
              alt="PulseShop"
              width={1760}
              height={560}
              className="hidden h-8 w-auto dark:block"
            />
          </Link>

          <DesktopNav className="hidden items-center gap-1 md:flex" />

          <div className="flex items-center gap-2">
            {/* Log in is a quiet, secondary action, so it folds into the mobile
                menu rather than taking a slot on the phone bar. */}
            <Link to="/login" className="hidden md:block">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="whitespace-nowrap">
                Open Shop
              </Button>
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="marketing-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-10 shrink-0 items-center justify-center rounded-btn border border-line bg-card text-ink transition-colors hover:border-primary/50 md:hidden"
            >
              {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        {/* Mobile menu. Anchored under the bar (top-full) with a tap-anywhere
            backdrop, so it dismisses the way a menu should. */}
        {menuOpen && (
          <div className="md:hidden" id="marketing-menu">
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="absolute inset-x-0 top-full h-screen bg-ink/25"
            />
            {/* Opaque card, not glass: the bar above stays frosted, but a menu
                reads better as a solid sheet than as the page ghosting through
                the links. */}
            <div className="animate-modal-in absolute inset-x-0 top-full origin-top border-b border-line bg-card px-5 pb-4 pt-2 shadow-float">
              <nav className="flex flex-col gap-0.5 py-1">
                {NAV_LINKS.map(({ to, label, ...rest }) => (
                  <NavLink
                    key={to}
                    to={to}
                    {...rest}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-btn px-3 py-2.5 text-sm font-bold transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "text-ink/80 hover:bg-fill",
                      )
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-1 border-t border-line-soft pt-3">
                <Link to="/login" onClick={() => setMenuOpen(false)} className="block">
                  <Button variant="outline" className="w-full">
                    Log in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {children}

      <SiteFooter />
    </div>
  );
}

/* Shopify convention: a tall, full-bleed dark footer that closes every page —
   a wordmark + tagline column beside grouped link columns, a rule, then a fine
   legal row. It anchors the alternating light/dark band rhythm the pages run. */
const FOOTER_GROUPS = [
  {
    heading: "Product",
    links: [
      { to: "/prices", label: "Prices" },
      { to: "/faq", label: "FAQ" },
      { to: "/", label: "Browse shops" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/welcome", label: "Home" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { to: "/signup", label: "Open your Shop" },
      { to: "/login", label: "Log in" },
    ],
  },
] as const;

function SiteFooter() {
  return (
    <footer className="band-ink mt-16">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <img
              src="/icons/wordmark-on-dark.png"
              alt="PulseShop"
              width={1760}
              height={560}
              className="h-8 w-auto"
            />
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              The storefront that lives behind your bio link. Built for sellers
              who sell on social.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading}>
              <h3 className="font-sans-force text-xs font-bold uppercase tracking-widest text-white/50">
                {group.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link
                      to={link.to}
                      className="text-sm font-medium text-white/75 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs font-medium text-white/50">
            © {new Date().getFullYear()} PulseShop · Nairobi, Kenya
          </p>
          <p className="text-xs font-medium text-white/50">
            Made for sellers who sell on social.
          </p>
        </div>
      </div>
    </footer>
  );
}
