import type { GroupBuy } from "@/types";
import { formatKes } from "./currency";

/** Where a group buy lives. Short for the same reason share links are: this
 * gets pasted into WhatsApp groups and read off phone screens. */
export const groupBuyUrl = (
  code: string,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
) => `${origin}/g/${code}`;

/** How many more people the group still needs. Never negative — a group that
 * overshot its target while filling is at zero, not at minus one. */
export const slotsLeft = (gb: GroupBuy) => Math.max(0, gb.targetCount - gb.memberCount);

/**
 * Time left, in the roughest unit that is still useful.
 *
 * Deliberately coarse. A live-ticking countdown to the second reads as
 * pressure-selling, and the actual decision this supports ("do I have time to
 * ask my sister?") is answered by "6 hours left" as well as by "5:59:12".
 */
export function timeLeft(closesAt: string, now: number = Date.now()): string {
  const ms = new Date(closesAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} ${mins === 1 ? "minute" : "minutes"} left`;
}

/**
 * The message a member pastes into their WhatsApp group.
 *
 * This is the actual growth mechanism, so it is written to be forwarded as-is:
 * what the thing is, what it saves, how many are still needed, and the link.
 * A member who has to compose their own pitch mostly does not bother.
 */
export function invitation(gb: GroupBuy, url: string): string {
  const left = slotsLeft(gb);
  return [
    `${gb.productName} — group price ${formatKes(gb.groupPriceKes)} instead of ${formatKes(gb.priceKes)}.`,
    "",
    left > 0
      ? `We need ${left} more ${left === 1 ? "person" : "people"} for the price to unlock. Join here:`
      : "The group price is unlocked. Join here:",
    url,
  ].join("\n");
}
