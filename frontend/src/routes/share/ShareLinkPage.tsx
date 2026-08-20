import { Compass, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Logo } from "@/components/common/Logo";
import { MobileShell } from "@/components/layout/MobileShell";
import { services } from "@/services";
import { useAttribution } from "@/stores/attribution";

/**
 * `/s/CODE` — where every shared link lands.
 *
 * This page is a doorway, not a destination: it resolves the code, remembers
 * it for the order that may follow, and replaces itself with the real product
 * or shop page. A buyer who came from a WhatsApp Status should see the product
 * they were promised, not a redirect notice.
 *
 * WHY A ROUND TRIP AT ALL, rather than encoding the destination in the link:
 * the code has to stay short enough to be read off a phone screen and typed by
 * hand, because WhatsApp Status carries no tappable links. Five characters
 * cannot also carry a shop handle and a product slug.
 *
 * `replace: true` on every exit: the doorway must not sit in history, or the
 * back button from the product page walks into it and immediately forwards
 * again, trapping the buyer.
 */
export function ShareLinkPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const capture = useAttribution((s) => s.capture);
  const [failed, setFailed] = useState(false);
  // Resolving COUNTS A CLICK, so it must happen exactly once. Without this,
  // StrictMode's double-invoked effects would score two clicks per visit in
  // development and quietly teach sellers the wrong number.
  const resolved = useRef(false);

  useEffect(() => {
    if (!code || resolved.current) return;
    resolved.current = true;

    let cancelled = false;
    services.shareLinks
      .resolve(code)
      .then((target) => {
        if (cancelled) return;
        if (!target) {
          setFailed(true);
          return;
        }
        // Remembered BEFORE navigating, so the destination page is already
        // rendering with the attribution in place.
        capture(target.code);
        navigate(
          target.productSlug ? `/${target.shopSlug}/${target.productSlug}` : `/${target.shopSlug}`,
          { replace: true },
        );
      })
      .catch(() => {
        // A network failure is not the buyer's problem to solve, and this is
        // a link someone tapped expecting to shop. Losing the attribution
        // beats losing the visit, so an unresolvable code still leads
        // somewhere useful.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code, capture, navigate]);

  if (failed) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-4 px-8 text-center">
          <Logo size={56} />
          <div>
            <p className="text-lg font-bold text-ink">This link has expired</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              The seller may have taken it down, or the code{" "}
              <span className="font-semibold text-ink">{code}</span> was typed with a character
              out of place.
            </p>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <Compass className="size-4" />
            Browse the marketplace
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <div className="app-surface flex min-h-dvh flex-col items-center justify-center gap-3 px-5">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-muted">Opening…</p>
    </div>
  );
}
