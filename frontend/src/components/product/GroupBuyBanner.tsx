import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { Link } from "react-router";
import { formatKes } from "@/lib/currency";
import { slotsLeft, timeLeft } from "@/lib/groupBuy";
import { services } from "@/services";

/**
 * "There is a group price running on this" — the product page's entry into
 * bei ya kikundi (migration 0054).
 *
 * Renders nothing at all when no group buy is running, which is the common
 * case. That is why it is a component with its own query rather than data
 * threaded down from the page: the product page should not carry a loading
 * state, a null check and a layout slot for something most products never
 * have.
 *
 * It shows the price and how many more people are needed, and stops there.
 * Joining is a decision with a form attached, and that belongs on the group's
 * own page where there is room to explain that nothing is being charged yet.
 */
export function GroupBuyBanner({ productId }: { productId: string }) {
  const groupQ = useQuery({
    queryKey: ["group-buy-for-product", productId],
    queryFn: () => services.groupBuys.activeForProduct(productId),
  });

  const group = groupQ.data;
  if (!group || group.status !== "open") return null;

  const left = slotsLeft(group);

  return (
    <Link
      to={`/g/${group.code}`}
      className="flex items-center gap-3 rounded-card border border-primary/25 bg-primary/5 p-3.5 transition-colors hover:border-primary/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Users className="size-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink">
          Group price {formatKes(group.groupPriceKes)}
        </span>
        <span className="block text-xs font-semibold text-muted">
          {left > 0
            ? `${left} more ${left === 1 ? "buyer" : "buyers"} needed · ${timeLeft(group.closesAt)}`
            : `Unlocking now · ${timeLeft(group.closesAt)}`}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-primary" />
    </Link>
  );
}
