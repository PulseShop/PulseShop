import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { formatKes } from "@/lib/currency";
import { groupBuyUrl, invitation, slotsLeft, timeLeft } from "@/lib/groupBuy";
import { isValidPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { GroupBuy } from "@/types";
import { useOrderStore } from "@/stores/order";
import { useToasts } from "@/stores/toast";

/**
 * `/g/CODE` — bei ya kikundi, the buyer's side.
 *
 * The page has one job at a time, and which one depends on where the reader
 * stands: a stranger is being asked to join, a member who has joined is being
 * asked to recruit, and a member of a filled group is being handed the code
 * they earned. Everything else is arranged under whichever of those three is
 * live.
 *
 * The reader is identified by the phone already saved from checkout
 * (stores/order), not by an account. Almost everyone opening this arrived from
 * a WhatsApp group and has never signed in to anything.
 */
export function GroupBuyPage() {
  const { code = "" } = useParams<{ code: string }>();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const customer = useOrderStore((s) => s.customer);
  const saveCustomer = useOrderStore((s) => s.saveCustomer);

  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);

  const groupQ = useQuery({
    queryKey: ["group-buy", code, customer.phone],
    queryFn: () => services.groupBuys.getByCode(code, customer.phone || null),
  });

  const joinMut = useMutation({
    mutationFn: () => services.groupBuys.join(code, name.trim(), phone.trim()),
    onSuccess: (group) => {
      // Saved so a return visit resolves membership without asking again, and
      // so checkout is already filled in when they go to spend the code.
      saveCustomer({ ...customer, name: name.trim(), phone: phone.trim() });
      qc.setQueryData(["group-buy", code, phone.trim()], group);
      qc.invalidateQueries({ queryKey: ["group-buy", code] });
      push(
        group.status === "filled"
          ? "The group is full. Your price is unlocked."
          : "You're in. Now bring the others.",
        "success",
      );
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "";
      push(msg.includes("closed") ? "This group buy has already closed" : "Couldn't join — try again", "danger");
    },
  });

  const group = groupQ.data;
  const url = groupBuyUrl(code);

  const share = async (g: GroupBuy) => {
    const text = invitation(g, url);
    if (navigator.share) {
      try {
        await navigator.share({ title: g.productName, text });
        return;
      } catch {
        /* cancelled — fall through to the clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      push("Invite copied — paste it in your WhatsApp group", "success");
    } catch {
      push("Copy this page's link and send it to your group");
    }
  };

  if (groupQ.isPending) {
    return (
      <MobileShell nav={false}>
        <div className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
          <Skeleton className="h-64 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      </MobileShell>
    );
  }

  if (!group) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-8 text-center">
          <Users className="size-10 text-muted" />
          <p className="text-lg font-bold text-ink">No group buy here</p>
          <p className="max-w-xs text-sm text-muted">
            The code <span className="font-semibold text-ink">{code}</span> doesn't match any
            group. Check it against the message you were sent.
          </p>
          <Link
            to="/"
            className="mt-1 rounded-btn bg-primary px-5 py-2.5 text-sm font-bold text-on-accent"
          >
            Browse the marketplace
          </Link>
        </div>
      </MobileShell>
    );
  }

  const left = slotsLeft(group);
  const progress = Math.min(100, Math.round((group.memberCount / group.targetCount) * 100));
  const open = group.status === "open";
  const filled = group.status === "filled";
  const phoneError = phone.trim().length > 0 && !isValidPhone(phone) ? "Check this number" : null;
  const canJoin = name.trim().length > 0 && isValidPhone(phone) && !joinMut.isPending;

  return (
    <MobileShell nav={false}>
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Bei ya kikundi</p>
          <h1 className="text-2xl font-extrabold text-ink">Group price</h1>
          <p className="text-sm text-muted">
            {group.targetCount} buyers, one better price. Sold by{" "}
            <Link to={`/${group.shopSlug}`} className="font-semibold text-ink hover:text-primary">
              {group.shopName}
            </Link>
            .
          </p>
        </div>

        <div className="overflow-hidden rounded-card border border-line-soft bg-card shadow-soft">
          <Link to={`/${group.shopSlug}/${group.productSlug}`} className="block">
            <ProductImage
              src={group.productImage}
              alt={group.productName}
              className="aspect-square w-full object-cover"
            />
          </Link>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-base font-bold text-ink">{group.productName}</p>

            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-extrabold text-primary">
                {formatKes(group.groupPriceKes)}
              </span>
              <span className="text-sm font-semibold text-muted line-through">
                {formatKes(group.priceKes)}
              </span>
              <span className="ml-auto rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                save {formatKes(group.priceKes - group.groupPriceKes)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-fill">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    filled ? "bg-success" : "bg-primary",
                  )}
                  style={{ width: `${Math.max(progress, 4)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-ink">
                  {group.memberCount} of {group.targetCount} joined
                </span>
                <span className="text-muted">{open ? timeLeft(group.closesAt) : group.status}</span>
              </div>
            </div>
          </div>
        </div>

        {filled && group.isMember && group.discountCode ? (
          <div className="flex flex-col gap-3 rounded-card border border-success/30 bg-success/5 p-4">
            <div className="flex items-center gap-2">
              <Check className="size-5 text-success" />
              <p className="text-base font-extrabold text-ink">The price is unlocked</p>
            </div>
            <p className="text-sm text-muted">
              Use this code at checkout in the next 48 hours. It works once, for you.
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(group.discountCode!);
                push("Code copied", "success");
              }}
              className="flex items-center justify-between gap-2 rounded-btn border-2 border-dashed border-success/40 bg-card px-4 py-3 text-left"
            >
              <span className="font-mono text-lg font-extrabold tracking-wider text-ink">
                {group.discountCode}
              </span>
              <Copy className="size-4 shrink-0 text-muted" />
            </button>
            <Link to={`/${group.shopSlug}/${group.productSlug}`}>
              <Button className="w-full" size="lg">
                Go and order
              </Button>
            </Link>
          </div>
        ) : filled ? (
          <div className="rounded-card border border-line-soft bg-card p-4 text-center">
            <p className="text-base font-bold text-ink">This group is full</p>
            <p className="mt-1 text-sm text-muted">
              The {group.percentOff}% went to the {group.targetCount} who joined in time. The
              product is still on sale at its normal price.
            </p>
            <Link
              to={`/${group.shopSlug}/${group.productSlug}`}
              className="mt-3 inline-block rounded-btn border-2 border-line px-5 py-2.5 text-sm font-bold text-ink hover:border-primary hover:text-primary"
            >
              See the product
            </Link>
          </div>
        ) : !open ? (
          <div className="rounded-card border border-line-soft bg-card p-4 text-center">
            <p className="text-base font-bold text-ink">
              {group.status === "cancelled" ? "The seller called this off" : "Time is up"}
            </p>
            <p className="mt-1 text-sm text-muted">
              It didn't reach {group.targetCount} buyers, so nobody was charged anything.
            </p>
            <Link
              to={`/${group.shopSlug}/${group.productSlug}`}
              className="mt-3 inline-block rounded-btn border-2 border-line px-5 py-2.5 text-sm font-bold text-ink hover:border-primary hover:text-primary"
            >
              See the product
            </Link>
          </div>
        ) : group.isMember ? (
          <div className="flex flex-col gap-3 rounded-card border border-primary/25 bg-primary/5 p-4">
            <p className="text-base font-extrabold text-ink">You're in</p>
            <p className="text-sm text-muted">
              {left} more {left === 1 ? "person" : "people"} and the price drops for everyone,
              you included. Send this to a group that would want it.
            </p>
            <Button variant="whatsapp" size="lg" className="w-full" onClick={() => share(group)}>
              <WhatsAppIcon className="mr-2 size-5" />
              Invite your group
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-card border border-line-soft bg-card p-4 shadow-soft">
            <div>
              <p className="text-base font-extrabold text-ink">Join this group</p>
              <p className="mt-0.5 text-sm text-muted">
                Nothing is charged now. When {group.targetCount} people have joined, everyone gets
                a code for {group.percentOff}% off and orders as normal.
              </p>
            </div>
            <Input
              label="Your name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wanjiru"
              autoComplete="name"
            />
            <Input
              label="Phone number"
              name="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              autoComplete="tel"
              error={phoneError ?? undefined}
            />
            <Button
              size="lg"
              className="w-full"
              disabled={!canJoin}
              onClick={() => joinMut.mutate()}
            >
              {joinMut.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Users className="mr-2 size-5" />
                  Count me in
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted">
              Your number is how the seller reaches you and how your slot is held. One slot per
              number.
            </p>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
