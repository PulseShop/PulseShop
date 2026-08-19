import { Link } from "react-router";
import { cn } from "@/lib/utils";

/* Served from public/ rather than imported from src/assets: it is the same file
   the PWA icon set is generated from (scripts/generate-icons.mjs), and one copy
   that both the build and the icon script read is one fewer thing to keep in
   sync. Precached by the service worker like every other png under public/. */
const logoUrl = "/icons/main_logo.png";

type LogoProps = {
  size?: number;
  className?: string;
};

export function Logo({ size = 36, className }: LogoProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-xl object-cover", className)}
      alt="PulseShop"
    />
  );
}

/**
 * The logo as a way home.
 *
 * A masthead logo is a link on every site a shopper has ever used, so on the
 * pages where ours was a bare <img> it was a dead end that looked like a
 * control — the one place people click by reflex when they want out of a
 * storefront and back to everything.
 *
 * It always points at "/", the marketplace, and never at the shop being
 * browsed: the wordmark says PulseShop, so sending it to one seller's storefront
 * would be a link that lies about where it goes. Returning to the current shop
 * is what the back control and the shop's own header are for.
 */
export function LogoLink({
  size = 36,
  className,
  wordmark = false,
  wordmarkClassName,
}: LogoProps & {
  /** Render "PulseShop" beside the mark — for headers with room for it. */
  wordmark?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <Link
      to="/"
      aria-label="PulseShop home"
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-btn transition-opacity hover:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <Logo size={size} />
      {wordmark && (
        <span
          className={cn(
            "text-lg font-extrabold tracking-tight text-primary",
            wordmarkClassName,
          )}
        >
          PulseShop
        </span>
      )}
    </Link>
  );
}
