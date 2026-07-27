import { APP_VERSION } from "./version";

/**
 * Ships a browser error to /api/log, which forwards it to the log store.
 *
 * Until now a crash on a seller's phone left no trace anywhere we could read:
 * ErrorBoundary rendered its fallback and called console.error into a console
 * nobody would ever open. This is the other half of that, and api/log.ts
 * explains the endpoint side.
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE.
 *
 * 1. It must never throw. A reporter that can fail inside an error handler
 *    turns one broken render into an infinite loop, so every path here is
 *    wrapped and every failure is swallowed. There is deliberately no retry.
 *
 * 2. It must never send a URL. Supabase's recovery flow puts a live session
 *    token in the fragment on /reset-password, and query strings elsewhere
 *    carry whatever a link was built with. Only `location.pathname` is sent,
 *    which cannot contain either.
 *
 * 3. It must be bounded. A component that throws on every frame would otherwise
 *    generate thousands of identical events a second. The same message is sent
 *    once per session, and the session is capped outright.
 */

/** Distinct messages already sent. The second occurrence adds nothing. */
const seen = new Set<string>();

/** Hard ceiling per page session, whatever the messages are. */
const MAX_REPORTS = 25;
let sent = 0;

/**
 * Guards against the one failure mode that matters: an error raised inside this
 * function reaching a global handler, which calls this function again.
 */
let reporting = false;

export type ErrorKind = "render" | "window" | "unhandledrejection" | "manual";

export function reportError(error: unknown, kind: ErrorKind = "manual", extra?: string): void {
  if (reporting || sent >= MAX_REPORTS) return;

  try {
    reporting = true;

    const err = error instanceof Error ? error : null;
    const message = [err?.message ?? String(error ?? "Unknown error"), extra]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 512);
    if (!message) return;

    const key = `${kind}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    // In dev there is no /api/log (Vite serves the app, not the Vercel
    // functions), so a POST would 404 on every error and bury the real one.
    if (import.meta.env.DEV) {
      console.error(`[reportError:${kind}]`, error);
      return;
    }

    const payload = JSON.stringify({
      kind,
      message,
      stack: err?.stack?.slice(0, 4096) ?? "",
      // Path only. See rule 2 above.
      path: window.location.pathname.slice(0, 256),
      appVersion: APP_VERSION,
    });

    // keepalive so the report still goes out when the error is what is unloading
    // the page. Failures are ignored on purpose: there is no useful fallback, and
    // an unhandled rejection here would re-enter this function.
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never become the failure.
  } finally {
    reporting = false;
  }
}

/**
 * Catches what React cannot: throws outside the render tree (event handlers,
 * timers, async callbacks) and promise rejections nobody handled.
 *
 * ErrorBoundary only sees errors raised during render, which in this app is a
 * minority of them; most of the interesting failures are in a query, a store
 * action or a Supabase call. Call once, at startup.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    // Resource load failures (a broken <img>) also fire this event with no
    // `error` object attached. They are noise here, and product images 404 often
    // enough that including them would drown the real reports.
    if (!event.error) return;
    reportError(event.error, "window");
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  });
}
