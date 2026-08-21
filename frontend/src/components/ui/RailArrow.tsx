import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * The step-along control that sits over a horizontally scrolling rail.
 *
 * DESKTOP ONLY, EVERY TIME. A touch device drags the strip itself, so an arrow
 * there would be a button sitting on top of the thing it scrolls; a mouse has
 * no such gesture — a horizontal list is reachable with shift and the wheel,
 * which roughly nobody knows — so on a pointer device the arrow is not a
 * convenience, it is the only way to see the back half of the rail.
 *
 * There were three copies of this by the time the deals shelf became a rail:
 * one in the browsing history, one in the deals shelf, one wanted by the
 * category rail. They were the same nine-pixel button with a different
 * aria-label, which is exactly the kind of thing that drifts a shadow here and
 * a border radius there until the page has three slightly different arrows.
 */
export function RailArrow({
  side,
  onClick,
  label,
  className,
}: {
  side: "left" | "right";
  onClick: () => void;
  /** What this scrolls, for a screen reader: "deals", "your history". The
   *  direction is added here so callers cannot spell it two different ways. */
  label: string;
  className?: string;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scroll ${label} ${side}`}
      className={cn(
        "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full",
        "border border-line bg-card/90 text-ink shadow-soft backdrop-blur transition-colors",
        "hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex",
        side === "left" ? "-left-3" : "-right-3",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * How far a rail can still go, and how to move it.
 *
 * WHY IT IS NOT JUST "ARE THERE MORE THAN FOUR TILES". That was the old test in
 * the browsing history rail, and it is a guess about widths dressed up as a
 * fact about counts: four tiles overflow a phone and not a monitor, and it says
 * nothing at all about DIRECTION. An arrow that is drawn when it cannot do
 * anything is a dead control, and on the category rail — where the arrows sit
 * over the strip rather than in the page margin — a dead left arrow at rest
 * covers the first chip, which is the one that says "All".
 *
 * The `signature` is what makes this survive async content: a ResizeObserver
 * fires when the rail's own box changes, not when the things inside it arrive,
 * so a rail whose chips land with a query would otherwise decide it does not
 * overflow and never look again. Pass something that changes with the content,
 * usually its length.
 */
export function useRailScroll(ref: RefObject<HTMLDivElement | null>, signature: unknown = null) {
  const [{ canLeft, canRight }, setReach] = useState({ canLeft: false, canRight: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // A few pixels of slack at both ends: sub-pixel layout and momentum scroll
    // both leave scrollLeft a fraction short of where they visually stopped,
    // and an arrow that stays live at the very end is the same dead control in
    // a different place.
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setReach({ canLeft: el.scrollLeft > 4, canRight: el.scrollLeft < max - 4 });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref, signature]);

  /**
   * Step along by most of the rail's own width.
   *
   * 80% rather than 100%: the tile that was at the edge stays on screen as an
   * anchor, so the jump reads as a scroll rather than as a page change, and a
   * shopper does not have to remember what was there a moment ago to know they
   * have not skipped anything.
   */
  const scrollBy = (direction: 1 | -1) =>
    ref.current?.scrollBy({
      left: direction * ref.current.clientWidth * 0.8,
      behavior: "smooth",
    });

  return { canLeft, canRight, scrollBy };
}
