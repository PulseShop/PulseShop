import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Rocket } from "lucide-react";
import { QueryError } from "@/components/common/QueryError";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";
import type { EarlyAccessSignup } from "@/types";

/**
 * Founding-seller registrations from /earlyaccessform.
 *
 * A read-only lead inbox: this screen shows who asked in, newest first, and
 * hands the owner a way to reach each one. It never writes — the whole point is
 * for a specialist to pick a row and follow up on WhatsApp, so email and phone
 * are live links, not plain text. Like the rest of /admindev this is not the
 * security boundary; admin_list_early_access() refuses anyone not on
 * platform_admins, so a non-owner reaches this component and sees nothing.
 */
export function EarlyAccessPanel() {
  const signupsQ = useQuery({
    queryKey: ["admin-early-access"],
    queryFn: () => services.earlyAccess.list(),
  });

  const signups = signupsQ.data ?? [];

  return (
    <section className="rounded-card bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Rocket className="size-4 text-primary" aria-hidden />
            Early access
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Sellers who registered for the founding cohort. Newest first. Reach out on WhatsApp to
            set them up.
          </p>
        </div>
        {signups.length > 0 && (
          <div className="text-right">
            <p className="text-lg font-extrabold tabular-nums text-ink">{signups.length}</p>
            <p className="text-xs text-muted">registered</p>
          </div>
        )}
      </div>

      {signupsQ.isError ? (
        <div className="mt-4">
          <QueryError
            title="Couldn't load registrations"
            onRetry={() => signupsQ.refetch()}
            retrying={signupsQ.isFetching}
          />
        </div>
      ) : signupsQ.isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : signups.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No registrations yet. When a seller submits the form at{" "}
          <span className="font-semibold text-ink">/earlyaccessform</span>, they land here.
        </p>
      ) : (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2 pr-3 font-bold">Registered</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Seller</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Shop</th>
                <th scope="col" className="pb-2 pr-3 font-bold">Contact</th>
                <th scope="col" className="pb-2 font-bold">Heard via</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <SignupRow key={s.id} signup={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SignupRow({ signup }: { signup: EarlyAccessSignup }) {
  const registered = new Date(signup.createdAt);
  return (
    <tr className="border-b border-line-soft align-top last:border-0">
      <td className="py-3 pr-3 text-xs tabular-nums text-muted">
        <span className="block">{registered.toLocaleDateString()}</span>
        <span className="block text-muted/70">
          {registered.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </td>
      <td className="py-3 pr-3">
        <span className="block font-semibold text-ink">{signup.fullName}</span>
      </td>
      <td className="py-3 pr-3">
        <span className="block font-semibold text-ink">{signup.shopName}</span>
        <span className="block text-xs text-muted">{signup.location}</span>
      </td>
      <td className="py-3 pr-3">
        <a
          href={`mailto:${signup.email}`}
          className="flex items-center gap-1.5 text-xs font-medium text-ink hover:text-primary"
        >
          <Mail className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{signup.email}</span>
        </a>
        <a
          href={`tel:${signup.phone.replace(/\s/g, "")}`}
          className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink hover:text-primary"
        >
          <Phone className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="tabular-nums">{signup.phone}</span>
        </a>
      </td>
      <td className="py-3 text-xs text-muted">
        {signup.referral ? signup.referral : <span className="text-muted/60">—</span>}
      </td>
    </tr>
  );
}
