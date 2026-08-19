import * as Popover from "@radix-ui/react-popover";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Package,
  Store,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useOrderStore } from "@/stores/order";
import { useToasts } from "@/stores/toast";

/**
 * The account control in the top-right of the marketplace header.
 *
 * WHY IT EXISTS. Signing in was reachable only from the Account tab, which
 * meant a first-time visitor landing on the front door had no visible way to
 * log in or open a shop — the two things the site most wants them to do. The
 * masthead is where every shopper on the internet looks for that, so it goes
 * there, and it says which of the two states it is in rather than being an
 * anonymous silhouette either way.
 *
 * It is a menu rather than two buttons because signed OUT is not the only
 * state: signed in, this is also the fastest route to orders, the dashboard,
 * and the sign-out that otherwise takes two navigations.
 *
 * NOT a replacement for the Account tab. That page owns profile editing,
 * delivery details, password changes and theme; duplicating any of it here
 * would be two places to change one thing.
 */
export function ProfileMenu({ className }: { className?: string }) {
  const session = useAuth((s) => s.session);
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={session ? "Your account" : "Log in or sign up"}
        className={cn(
          "flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2 transition-colors",
          "hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open && "bg-fill",
          className,
        )}
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full",
            session ? "bg-primary text-on-accent" : "bg-primary/10 text-primary",
          )}
        >
          {session ? (
            // The first letter of the account, so a signed-in shopper can tell
            // at a glance WHICH account without opening anything.
            <span className="text-sm font-extrabold uppercase">
              {(session.email?.[0] ?? "?").toUpperCase()}
            </span>
          ) : (
            <UserRound className="size-[18px]" />
          )}
        </span>
        {/* The label is the whole point on desktop: an unlabelled silhouette is
            the reason people cannot find the login. Hidden on phones, where the
            bottom bar carries Account and the header has no room. */}
        <span className="hidden text-sm font-bold text-ink sm:inline">
          {session ? "Account" : "Sign in"}
        </span>
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="glass-strong z-50 w-60 rounded-card p-1.5 shadow-modal animate-modal-in focus:outline-none"
        >
          {session ? (
            <SignedInMenu email={session.email} close={() => setOpen(false)} />
          ) : (
            <SignedOutMenu close={() => setOpen(false)} />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------------------------------------------------- */

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-btn px-3 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function SignedOutMenu({ close }: { close: () => void }) {
  return (
    <>
      <p className="px-3 pb-1 pt-2 text-xs text-muted">
        Sign in to track orders and save favourites.
      </p>
      <Link to="/login" onClick={close} className={ITEM_CLASS}>
        <LogIn className="size-4 text-muted" aria-hidden />
        Log in
      </Link>
      <Link to="/signup/shopper" onClick={close} className={ITEM_CLASS}>
        <UserPlus className="size-4 text-muted" aria-hidden />
        Create a shopper account
      </Link>
      <div className="my-1 h-px bg-line-soft" />
      {/* Opening a shop is a different product with a different signup, so it
          is separated rather than listed as a third equivalent choice. */}
      <Link to="/signup" onClick={close} className={ITEM_CLASS}>
        <Store className="size-4 text-muted" aria-hidden />
        Sell on PulseShop
      </Link>
    </>
  );
}

function SignedInMenu({ email, close }: { email: string; close: () => void }) {
  const session = useAuth((s) => s.session);
  const signOutLocal = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const [signingOut, setSigningOut] = useState(false);

  // Same sequence as AccountPage's sign-out, and for the same reasons: the
  // network call is best-effort (an expired session is already signed out), but
  // the local clear is not optional, and the query cache has to go with it or
  // one account's orders and favourites are served to the next.
  const signOut = async () => {
    setSigningOut(true);
    try {
      await services.auth.logout();
    } catch {
      // Offline or already-expired session — the local sign-out below still
      // ends the session on this device, which is what was asked for.
    }
    signOutLocal();
    useOrderStore.getState().clearCustomer();
    queryClient.clear();
    close();
    push("Signed out", "success");
    navigate("/");
  };

  return (
    <>
      <p className="truncate px-3 pb-1 pt-2 text-xs text-muted" title={email}>
        {email}
      </p>
      <Link to="/account" onClick={close} className={ITEM_CLASS}>
        <UserRound className="size-4 text-muted" aria-hidden />
        Your account
      </Link>
      <Link to="/orders" onClick={close} className={ITEM_CLASS}>
        <Package className="size-4 text-muted" aria-hidden />
        Your orders
      </Link>
      {session?.accountType === "merchant" && (
        <Link to="/dashboard" onClick={close} className={ITEM_CLASS}>
          <LayoutDashboard className="size-4 text-muted" aria-hidden />
          Seller dashboard
        </Link>
      )}
      <div className="my-1 h-px bg-line-soft" />
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className={cn(ITEM_CLASS, "disabled:opacity-60")}
      >
        <LogOut className="size-4 text-muted" aria-hidden />
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}
