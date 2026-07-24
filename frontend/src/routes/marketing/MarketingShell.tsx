import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/prices", label: "Prices" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
] as const;

function NavLinks({ className }: { className?: string }) {
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
 * one nav, one footer, so the four pages read as one site.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-surface min-h-dvh">
      <header className="glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-primary"
          >
            <Logo size={30} />
            PulseShop
          </Link>
          <NavLinks className="hidden items-center gap-1 md:flex" />
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Open Shop</Button>
            </Link>
          </div>
        </div>
        <NavLinks className="flex items-center justify-center gap-1 pb-2 md:hidden" />
      </header>

      {children}

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4">
        <div className="flex flex-col items-center gap-4 border-t border-ink/10 pt-6 text-center">
          <NavLinks className="flex flex-wrap items-center justify-center gap-1" />
          <p className="text-xs font-medium text-muted">
            © {new Date().getFullYear()} PulseShop · Built for sellers who sell on social.
          </p>
        </div>
      </footer>
    </div>
  );
}
