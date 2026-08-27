import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-triggered entrance. The child starts translated down and transparent
 * (the `.reveal` rule in tokens.css) and settles into place the first time it
 * crosses into the viewport, which is what gives the marketing pages their
 * staggered "assembles as you scroll" feel instead of mounting flat all at once.
 *
 * It is progressive enhancement, not a dependency: there is no framer-motion in
 * the bundle, so the whole thing is one IntersectionObserver plus a class swap.
 * Two consequences fall out of that on purpose:
 *
 *   1. Reduced motion is handled in CSS, not here. The base `.reveal` styles
 *      live behind `@media (prefers-reduced-motion: no-preference)`, so a
 *      visitor who asked for less motion never gets the offset in the first
 *      place and sees the content at rest — this component still runs, it just
 *      toggles a class that has nothing to animate.
 *
 *   2. If JS never runs (or the observer is unsupported), `.is-visible` is set
 *      immediately below via the initial state fallback, so content is never
 *      left stuck invisible.
 *
 * `delay` staggers siblings — pass an increasing value per item in a grid so the
 * row cascades rather than snapping in together.
 */
export function Reveal({
  children,
  as: Tag = "div",
  className,
  delay = 0,
}: {
  children: ReactNode;
  /** Element to render. Defaults to a div; pass "article"/"li" to keep semantics. */
  as?: ElementType;
  className?: string;
  /** Stagger offset in ms, applied as transition-delay. */
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Start visible when there is no observer to drive us, so the fallback path
  // (no IO support, or reduced motion where the offset is a no-op) never hides.
  const [visible, setVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect(); // reveal once, then stop watching
        }
      },
      // Fire a touch before the element is fully on screen so the settle reads
      // as anticipation rather than a pop the moment the edge appears.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Polymorphic element: `as` can be a div, li, article, etc., each with its own
  // ref type. Widening to a loose component here keeps the single `ref` valid
  // across all of them rather than threading a generic through the whole prop set.
  const Comp = Tag as ElementType;

  return (
    <Comp
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Comp>
  );
}
