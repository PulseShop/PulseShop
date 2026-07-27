/**
 * Client-side error sink.
 *
 * THE PROBLEM THIS SOLVES. Every server-side failure in this system already
 * lands somewhere a human can find it: Vercel keeps runtime logs for the
 * functions in this directory, and Supabase keeps them for the edge functions
 * and the database. Errors in the *browser* landed nowhere. ErrorBoundary caught
 * a render-time throw, showed "Something went wrong", and called console.error
 * into a console nobody was reading, on a seller's phone, in another country.
 * The whole class of bug that only reproduces on a real device was therefore
 * invisible unless someone thought to report it.
 *
 * WHY A PROXY AND NOT A DIRECT SEND. Shipping an Axiom (or any provider) token
 * in the JS bundle hands every visitor a write credential for the log store, and
 * the CSP in vercel.json deliberately restricts `connect-src` to 'self' and
 * Supabase, so a direct call would be blocked anyway. Same-origin POST to this
 * function, which holds the token server-side, satisfies both.
 *
 * WHAT IT WILL NOT ACCEPT.
 *  - Anything but a small POST. The body is capped before it is parsed.
 *  - More than RATE_LIMIT reports per IP per window. A render loop that throws
 *    on every frame is exactly the situation this endpoint exists to record, and
 *    exactly the situation that would otherwise send thousands of identical
 *    events per second; the client throttles too, but the client is the thing
 *    that is broken, so the limit has to exist on this side as well.
 *  - Any field it was not asked for. The payload is rebuilt from a fixed set of
 *    keys and every string is truncated, so a caller cannot use this as free
 *    storage or push a megabyte of junk into the log store.
 *
 * PRIVACY. The client sends a path, never a full URL (see lib/reportError.ts).
 * That is not belt-and-braces: Supabase's recovery flow puts a live session
 * token in the URL fragment on /reset-password, and query strings elsewhere can
 * carry anything a link was built with. A logger that records full URLs
 * eventually records credentials.
 */
const AXIOM_TOKEN = process.env.AXIOM_TOKEN || "";
const AXIOM_DATASET = process.env.AXIOM_DATASET || "";

/** Bytes. Comfortably fits a message plus a deep stack, and nothing else. */
const MAX_BODY_BYTES = 8_192;
const MAX_MESSAGE = 512;
const MAX_STACK = 4_096;
const MAX_PATH = 256;

/** Reports accepted per IP per window. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * Best-effort in-process counter. Fluid Compute reuses an instance across
 * requests, so this holds for the common case of one client melting down; it is
 * not a distributed limiter and is not trying to be. The hard protections are
 * the body cap and the field allowlist, which do not depend on shared state.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    // Bounded cleanup so a long-lived instance cannot accumulate a map entry per
    // IP forever.
    if (hits.size > 5_000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // 204 rather than 429 on purpose. The caller is a crash reporter; telling it
  // that it failed invites a retry, and there is nothing useful for it to do
  // with the information. Silently dropping is the correct behaviour for a sink.
  if (rateLimited(ip)) return new Response(null, { status: 204 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 204 });
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }

  const input = (raw ?? {}) as Record<string, unknown>;
  const message = str(input.message, MAX_MESSAGE);
  if (!message) return new Response(null, { status: 204 });

  // Rebuilt field by field. Nothing the caller sent that is not named here
  // survives into the log store.
  const event = {
    _time: new Date().toISOString(),
    level: "error",
    source: "browser",
    kind: str(input.kind, 32) || "unknown",
    message,
    stack: str(input.stack, MAX_STACK),
    path: str(input.path, MAX_PATH),
    appVersion: str(input.appVersion, 32),
    userAgent: str(request.headers.get("user-agent"), 256),
    // Deployment identity, so a spike can be tied to the release that caused it.
    deployment: process.env.VERCEL_DEPLOYMENT_ID || "",
    region: process.env.VERCEL_REGION || "",
  };

  if (!AXIOM_TOKEN || !AXIOM_DATASET) {
    // Unconfigured is a supported state, not an error: the event still reaches
    // Vercel's runtime logs, which is a real improvement on the browser console
    // and costs nothing. Axiom adds retention and search on top.
    console.error("[client-error]", JSON.stringify(event));
    return new Response(null, { status: 204 });
  }

  try {
    await fetch(`https://api.axiom.co/v1/datasets/${encodeURIComponent(AXIOM_DATASET)}/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AXIOM_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([event]),
    });
  } catch (err) {
    // The log store being down must never turn into a failed request for the
    // app, so this is swallowed after being written where we can still see it.
    console.error("[client-error] axiom ingest failed", err, JSON.stringify(event));
  }

  return new Response(null, { status: 204 });
}
