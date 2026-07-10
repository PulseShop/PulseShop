import { INSTAGRAM_STORY_STEPS } from "@/lib/instagramStorySteps";

/** Alternating tilt + lift per step, like photos clipped to a washing line. */
const TILT = [-3, 2, -2, 3];
const LIFT = ["translate-y-0", "translate-y-6", "translate-y-0", "translate-y-6"];

/**
 * Static, decorative walkthrough for the dashboard's empty space — the same
 * 4 steps as the in-flow tutorial modal (ShareMenu), just always-visible so
 * a seller can glance at "how do I post this" without opening a product's
 * share menu first. The dashboard is desktop-only (DashboardShell gates
 * anything under 1024px), so this only needs one layout.
 */
export function InstagramStoryWalkthrough() {
  return (
    <section className="relative mt-6 overflow-hidden rounded-card bg-card p-6 shadow-soft">
      <h2 className="text-lg font-extrabold text-ink">Posting to Instagram Stories</h2>
      <p className="mt-1 text-sm text-muted">
        Generate a Story image from any product's share menu, then follow these 4 steps in the
        Instagram app.
      </p>

      <div className="relative mt-8">
        <svg
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-9 h-10 w-full text-stone-200"
          aria-hidden
        >
          <path
            d="M0,30 Q50,0 100,30 T200,30 T300,30 T400,30"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 8"
            strokeLinecap="round"
          />
        </svg>
        <div className="relative grid grid-cols-4 gap-4">
          {INSTAGRAM_STORY_STEPS.map((step, i) => (
            <div
              key={step.title}
              style={{ "--tilt": `${TILT[i]}deg`, animationDelay: `${i * 140}ms` } as React.CSSProperties}
              className={`animate-step-swing-in flex flex-col items-center rounded-card border border-stone-100 bg-card px-3 py-4 text-center shadow-soft ${LIFT[i]}`}
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-instagram/10">
                <step.icon className="size-5 text-instagram" />
              </div>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                Step {i + 1}
              </p>
              <p className="mt-0.5 text-sm font-bold text-ink">{step.title}</p>
              <p className="mt-1 text-xs leading-snug text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
