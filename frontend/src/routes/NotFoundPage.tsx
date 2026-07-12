import { Compass, Home } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Logo } from "@/components/common/Logo";
import { MobileShell } from "@/components/layout/MobileShell";

/**
 * The catch-all 404.
 *
 * The app had none: `/:shopSlug` was the last route in main.tsx and therefore
 * swallowed *every* unmatched path, so a typo like /dashbord was treated as a
 * shop handle and rendered the storefront's "shop not found" screen. That was
 * confusing for a mistyped app route and it meant genuinely unknown URLs never
 * got a real 404. This route now sits after /:shopSlug and catches what's left.
 */
export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <MobileShell nav={false}>
      <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-4 px-8 text-center">
        <Logo size={56} />
        <div>
          <p className="text-4xl font-extrabold text-ink">404</p>
          <p className="mt-1 text-lg font-bold text-ink">Page not found</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            There's nothing at{" "}
            <span className="break-all font-semibold text-ink">{pathname}</span>.
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/shops"
            className="flex items-center gap-2 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Compass className="size-4" />
            Browse shops
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-btn border border-stone-200 bg-card px-5 py-2.5 text-sm font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Home className="size-4" />
            Home
          </Link>
        </div>
      </div>
    </MobileShell>
  );
}
