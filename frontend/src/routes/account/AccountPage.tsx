import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Heart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { QueryError } from "@/components/common/QueryError";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { authErrorMessage } from "@/lib/authErrors";
import { isValidPhone } from "@/lib/phone";
import { isPasswordValid, passwordSchema } from "@/lib/password";
import { services } from "@/services";
import { useAuth } from "@/stores/auth";
import { useOrderStore } from "@/stores/order";
import { useShopHome } from "@/stores/shop";
import { useToasts } from "@/stores/toast";

const profileSchema = z.object({
  name: z.string().min(2, "Enter your name").max(80),
  // Optional, but if present it must be the phone checkout will accept —
  // saving a bad one here just moves the error to a worse moment.
  phone: z
    .string()
    .refine(
      (v) => v === "" || isValidPhone(v),
      "Enter a valid phone number, with country code (e.g. +254712345678)",
    ),
  address: z.string().max(300, "Keep it under 300 characters"),
});

type ProfileForm = z.infer<typeof profileSchema>;

/**
 * The buyer's account hub — the fifth tab, where Orders used to be. Orders
 * moved inside it (guests keep their device-local history too), joined by the
 * profile/delivery details, password change, and the sign-out this side of the
 * app previously didn't have at all: a signed-in shopper's only way out was
 * clearing site data.
 */
export function AccountPage() {
  const session = useAuth((s) => s.session);

  return (
    <MobileShell wide>
      <header className="pt-safe flex items-center justify-between px-4 lg:px-6">
        <div>
          <h1 className="text-xl font-extrabold text-ink lg:text-2xl">Account</h1>
          <p className="text-sm text-muted">
            {session ? session.email : "You're browsing as a guest"}
          </p>
        </div>
        <DesktopQuickNav />
      </header>

      <div className="space-y-4 px-4 py-4 lg:mx-auto lg:max-w-2xl lg:px-6">
        {session ? <SignedIn /> : <Guest />}
      </div>
    </MobileShell>
  );
}

/* ------------------------------------------------------------------------- */

function Guest() {
  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-card bg-card p-6 text-center shadow-soft">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <UserRound className="size-7 text-primary" />
        </div>
        <div>
          <p className="font-bold text-ink">Sign in to PulseShop</p>
          <p className="mt-1 text-sm text-muted">
            Keep your orders, favorites and followed shops on every device.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Link
            to="/login"
            className="rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft"
          >
            Sign in
          </Link>
          <Link
            to="/signup/shopper"
            className="rounded-btn border border-stone-200 bg-card px-5 py-2.5 text-sm font-bold text-ink"
          >
            Create an account
          </Link>
        </div>
      </section>

      {/* Guests still have device-local order history and favorites. */}
      <nav className="overflow-hidden rounded-card bg-card shadow-soft">
        <LinkRow to="/orders" icon={Package} label="Orders" sub="Orders placed on this device" />
        <LinkRow to="/favorites" icon={Heart} label="Favorites" sub="Saved on this device" last />
      </nav>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function SignedIn() {
  const session = useAuth((s) => s.session)!;
  const signOutLocal = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const push = useToasts((s) => s.push);
  const home = useShopHome();

  const customer = useOrderStore((s) => s.customer);
  const saveCustomer = useOrderStore((s) => s.saveCustomer);

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: () => services.auth.getProfile(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "", address: "" },
  });

  // Populate once the profile arrives (reset marks the form pristine, so the
  // Save button stays disabled until the user actually changes something).
  useEffect(() => {
    if (profileQ.data) reset(profileQ.data);
  }, [profileQ.data, reset]);

  const onSave = handleSubmit(async (form) => {
    try {
      await services.auth.updateProfile(form);
      // Checkout prefills from the order store — write through so the next
      // checkout starts with these details without a profile fetch. The
      // address seeds the delivery-notes field (that's how it reaches the
      // seller), but never overwrites notes the buyer already wrote.
      saveCustomer({ name: form.name, phone: form.phone, notes: customer.notes || form.address });
      reset(form); // pristine again, Save disables
      push("Profile saved", "success");
    } catch {
      push("Couldn't save your profile — try again", "danger");
    }
  });

  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    try {
      await services.auth.logout();
    } catch {
      // Offline or already-expired session — the local sign-out below still
      // ends the session on this device, which is what the user asked for.
    }
    signOutLocal();
    // Everything cached under this account (orders, favorites, follows) must
    // not leak into a guest view or the next sign-in.
    queryClient.clear();
    push("Signed out", "success");
    navigate("/shops");
  };

  return (
    <>
      {/* identity */}
      <section className="flex items-center gap-3 rounded-card bg-card p-4 shadow-soft">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <UserRound className="size-6 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">
            {profileQ.data?.name || session.email}
          </p>
          <p className="truncate text-xs text-muted">
            {session.accountType === "merchant"
              ? `Merchant · ${session.shopName}`
              : session.email}
          </p>
        </div>
      </section>

      {/* quick links */}
      <nav className="overflow-hidden rounded-card bg-card shadow-soft">
        <LinkRow to="/orders" icon={Package} label="Orders" sub="Your orders and history" />
        <LinkRow
          to="/favorites"
          icon={Heart}
          label="Favorites"
          sub="Products you've saved"
          last={session.accountType !== "merchant"}
        />
        {session.accountType === "merchant" && (
          <LinkRow
            to="/dashboard"
            icon={LayoutDashboard}
            label="Shop dashboard"
            sub={`Manage ${session.shopName}`}
            last
          />
        )}
      </nav>

      {/* profile / delivery details */}
      <section className="rounded-card bg-card p-4 shadow-soft">
        <h2 className="text-sm font-bold text-ink">Delivery details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Used to fill in checkout for you — the seller sees them with your order.
        </p>

        {profileQ.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-11 w-full rounded-btn" />
            <Skeleton className="h-11 w-full rounded-btn" />
            <Skeleton className="h-20 w-full rounded-btn" />
          </div>
        ) : profileQ.isError ? (
          <div className="mt-4">
            <QueryError
              title="Couldn't load your profile"
              onRetry={() => profileQ.refetch()}
              retrying={profileQ.isFetching}
            />
          </div>
        ) : (
          <form onSubmit={onSave} className="mt-4 space-y-3">
            <Input
              label="Full name"
              placeholder="Jane Wanjiku"
              autoComplete="name"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label="Phone"
              placeholder="+254 712 345 678"
              inputMode="tel"
              autoComplete="tel"
              error={errors.phone?.message}
              {...register("phone")}
            />
            <Textarea
              label="Delivery address"
              placeholder="Estate, street, house — or the landmark to find you by"
              error={errors.address?.message}
              {...register("address")}
            />
            <Button type="submit" className="w-full" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? "Saving…" : "Save details"}
            </Button>
          </form>
        )}
      </section>

      {/* security */}
      <section className="overflow-hidden rounded-card bg-card shadow-soft">
        <ChangePasswordRow />
      </section>

      <Button variant="outline" className="w-full border-danger/30 text-danger" onClick={signOut} disabled={signingOut}>
        <LogOut className="size-4" />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>

      <p className="pb-2 text-center text-xs text-muted">
        Signed in as {session.email} ·{" "}
        <Link to={home} className="font-semibold text-primary">
          Keep shopping
        </Link>
      </p>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function ChangePasswordRow() {
  const push = useToasts((s) => s.push);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      passwordSchema.parse(password);
      await services.auth.updatePassword(password);
      setOpen(false);
      setPassword("");
      push("Password updated", "success");
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? err.issues[0]?.message ?? "Choose a stronger password"
          : authErrorMessage(err, "reset"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-stone-50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
          <KeyRound className="size-5 text-ink" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">Change password</span>
          <span className="block text-xs text-muted">Pick a new sign-in password</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setPassword("");
            setError(null);
          }
        }}
        title="Change password"
      >
        <div className="space-y-3">
          <Input
            label="New password"
            // Input derives the label's htmlFor from name/id — without one the
            // label isn't associated with the field at all.
            name="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
          />
          <PasswordRequirements value={password} show={password.length > 0} />
          <Button
            size="lg"
            className="w-full"
            disabled={!isPasswordValid(password) || saving}
            onClick={submit}
          >
            {saving ? "Updating…" : "Update password"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function LinkRow({
  to,
  icon: Icon,
  label,
  sub,
  last = false,
}: {
  to: string;
  icon: typeof Package;
  label: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        "flex items-center gap-3 p-4 transition-colors hover:bg-stone-50" +
        (last ? "" : " border-b border-stone-100")
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
        <Icon className="size-5 text-ink" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Link>
  );
}
