import { AlertCircle, Check, Circle, X } from "lucide-react";
import { passwordChecks } from "@/lib/password";
import { cn } from "@/lib/utils";

/**
 * Live checklist under the password field: every rule, ticking green as it's
 * met. Shown while the field is focused or holds anything, so the user can see
 * what's still missing *as they type* rather than being told after a failed
 * submit — and never sees an all-green password get rejected, because these
 * rules mirror Supabase's exactly (see lib/password.ts).
 *
 * `invalid` is the form telling us the password was actually rejected (it goes
 * true on a failed submit and clears the moment the value passes). Until then an
 * unticked rule is one the user simply hasn't reached yet — not a mistake — so
 * it stays neutral grey. Once it's true, the rules that failed turn red and are
 * named in an error line, which is the difference between "keep typing" and
 * "this is why your password won't go through".
 */
export function PasswordRequirements({
  value,
  show,
  invalid = false,
}: {
  value: string;
  show: boolean;
  invalid?: boolean;
}) {
  const checks = passwordChecks(value);
  const missing = checks.filter((c) => !c.met);
  const failed = invalid && missing.length > 0;

  // A rejected password explains itself even if the field was never focused —
  // otherwise submitting an untouched form would fail with nothing on screen.
  if (!show && !failed) return null;

  return (
    <div
      className={cn(
        "mt-2 rounded-xl p-3 transition-colors",
        failed ? "bg-danger/5 ring-1 ring-danger/20" : "bg-stone-50",
      )}
      // Announce progress without spamming a screen reader on every keystroke.
      aria-live="polite"
    >
      {failed ? (
        <p className="mb-2.5 flex items-start gap-1.5 text-xs font-bold text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Your password still needs:{" "}
            {missing.map((c) => c.label.toLowerCase()).join(", ")}
          </span>
        </p>
      ) : (
        <p className="sr-only">
          Password meets {checks.length - missing.length} of {checks.length} requirements.
        </p>
      )}

      <ul className="space-y-1.5">
        {checks.map((c) => {
          const Icon = c.met ? Check : failed ? X : Circle;
          return (
            <li key={c.label} className="flex items-center gap-2">
              <Icon
                className={cn(
                  "size-3.5 shrink-0",
                  c.met ? "text-success" : failed ? "text-danger" : "text-stone-300",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  c.met ? "text-success" : failed ? "text-danger" : "text-muted",
                )}
              >
                {c.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
