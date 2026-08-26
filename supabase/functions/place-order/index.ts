/**
 * place-order — the ONLY path to the place_order() RPC.
 *
 * Why this exists: place_order decrements stock for an order nobody has paid
 * for yet, and it used to be callable by `anon` with no captcha and no rate
 * limit. Two unauthenticated curl calls took a live product from 23 units to
 * 21 — so a short script could set every product in every shop to "Sold Out".
 * Migration 0024 revoked EXECUTE from anon/authenticated and granted it to
 * service_role alone; this function holds that key and will not use it until
 * Cloudflare has confirmed the caller is a real browser.
 *
 * A captcha is the only control that actually restricts *who* can call a
 * Supabase endpoint. CORS is enforced by the browser (curl simply sends no
 * Origin) and the anon key is public by design — it ships in the JS bundle. So
 * "only my app may call this" cannot be expressed as an origin rule; it has to
 * be a proof-of-humanity the caller cannot fabricate.
 *
 * The caller's JWT is verified here too, and the resulting user id is passed to
 * the RPC as p_customer_id — the function runs as service_role, so it can no
 * longer read auth.uid() for itself. Guests are legitimate: they get a null
 * customer_id and rely on the order's secret access_token instead.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

/**
 * Set to "true" in every deployment that faces the public internet.
 *
 * captchaOk() returns true when no Turnstile secret is configured, so that a dev
 * stack with no Cloudflare keys still works. That fallback is correct locally
 * and catastrophic in production: this endpoint decrements stock for orders
 * nobody has paid for, and the captcha is the only control on who may call it.
 * If the secret were ever dropped from the project's function secrets, the door
 * would swing open silently and nothing would report it.
 *
 * With this set, a missing secret is a hard 503 at request time instead. The
 * default is "off" so that existing deployments and local stacks are unaffected
 * until the flag is deliberately turned on; see the operations checklist in
 * README.md.
 */
const CAPTCHA_REQUIRED = (Deno.env.get("CAPTCHA_REQUIRED") ?? "").toLowerCase() === "true";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * The request body, validated at runtime.
 *
 * This used to be a bare `interface`, which is erased at compile time and so
 * checked nothing: `body.items` was asserted to be an array of items and then
 * handed to the RPC, meaning a payload of `{"items":[{"qty":"lots"}]}` reached
 * Postgres and came back as a type-cast error. The database was never actually
 * at risk (place_order() has its own guards, and PostgREST parameterises every
 * query), but the caller got a database error message where a 400 belongs, and
 * malformed input travelled two layers deeper than it should have.
 *
 * The bounds below mirror the schema deliberately: 80/30/500 are the
 * orders_cust_*_len CHECK constraints from migration 0021, 50 items and qty 100
 * are place_order()'s own limits, and 4 to 24 is the discount code length from
 * 0035. Where they disagree the database still wins, which is the point of
 * having them there as well; this layer exists to give a clean answer, not to
 * be the last line.
 */
const OrderItemSchema = z.object({
  product_id: z.string().uuid(),
  size: z.string().max(40).nullish(),
  /** The chosen colour. place_order() rejects one the seller doesn't offer, so
   * this is forwarded, never trusted. */
  color: z.string().max(40).nullish(),
  qty: z.number().int().positive().max(100),
});

const PayloadSchema = z.object({
  captcha_token: z.string().max(4096).nullish(),
  idempotency_key: z.string().max(128).nullish(),
  customer_name: z.string().trim().min(1).max(80),
  customer_phone: z.string().trim().min(1).max(30),
  customer_notes: z.string().max(500).nullish(),
  channel: z.enum(["whatsapp", "instagram", "facebook", "direct"]).default("direct"),
  payment_method: z.enum(["mpesa", "paypal", "card"]).nullish(),
  items: z.array(OrderItemSchema).min(1).max(50),
  /** Optional seller-created discount code. place_order() validates and
   * applies it server-side, so this is forwarded, never trusted. */
  discount_code: z.string().trim().min(4).max(24).nullish(),
  /**
   * Pickup station (migration 0062). Its PRESENCE is what selects the
   * multi-shop path: with a station the cart may span sellers and is placed
   * through place_cart_order(), without one it is the legacy single-shop
   * place_order(). Keeping both behind one function means the captcha and JWT
   * checks above are not duplicated, and an un-updated client keeps working.
   */
  pickup_station_id: z.string().uuid().nullish(),
  /** Which share link the buyer arrived on (migration 0052). Bookkeeping only:
   * place_order() drops one it cannot resolve rather than rejecting the order,
   * so a malformed value here costs attribution and never a sale. Bounded to
   * the generated code shape so junk is dropped at this layer rather than
   * travelling to Postgres. */
  share_code: z.string().trim().regex(/^[A-Za-z2-9]{5,10}$/).nullish(),
});

/**
 * Errors from place_order() that are safe, and useful, to show the shopper.
 *
 * The RPC raises these itself for situations the buyer can act on, so flattening
 * them to "something went wrong" would be a real loss: "insufficient stock for
 * Blue Hoodie" tells someone exactly what to change, and a generic message sends
 * them back to the cart to guess.
 *
 * Anything NOT listed here is an error we did not anticipate, which in Postgres
 * means the message can carry column names, type-cast detail or fragments of a
 * query. Those go to the logs and the caller gets a stable, generic reply. The
 * allowlist is the mechanism: an unrecognised message is never passed through
 * just because it looks harmless.
 */
const SAFE_RPC_ERRORS = new Set([
  "order must have at least one item",
  "too many items in one order",
  "customer name and phone are required",
  "invalid quantity",
  "quantity too large",
  "all items in an order must belong to the same shop",
  "this shop is not accepting orders right now",
  "discount code is no longer valid for this order",
  "could not generate a unique order reference",
  // place_cart_order (0062)
  "choose a pickup station",
]);

/** The same, for the messages that interpolate a product name or a variant. */
const SAFE_RPC_PATTERNS = [
  /^insufficient stock for /,
  /^product not found: /,
  /^size .+ is not available for /,
  /^color .+ is not available for /,
];

const isSafeRpcError = (message: string) =>
  SAFE_RPC_ERRORS.has(message) || SAFE_RPC_PATTERNS.some((re) => re.test(message));

/** Cloudflare's verdict on the token. Fails closed: any error is a rejection. */
async function captchaOk(token: string | undefined, ip: string | null): Promise<boolean> {
  // No secret configured = captcha disabled for this deployment (mirrors
  // lib/captcha.ts, so a dev stack with no Turnstile keys still works). Any
  // deployment where that is not acceptable sets CAPTCHA_REQUIRED, which is
  // checked in the handler before this is ever reached.
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;

  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Refuse to run at all, rather than run without the captcha, when the
  // deployment has declared that it must have one. Checked before the body is
  // even read: if this is misconfigured there is no request worth processing.
  if (CAPTCHA_REQUIRED && !TURNSTILE_SECRET) {
    console.error(
      "CAPTCHA_REQUIRED is set but TURNSTILE_SECRET_KEY is missing. " +
        "Refusing to place orders without captcha verification.",
    );
    return json({ error: "ordering_unavailable" }, 503);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // The zod report names paths and expected types, which is operator detail;
    // the caller gets the field and nothing else. The app validates the same
    // fields before it ever gets here, so a failure at this point is either a
    // client bug or a hand-made request, and neither deserves a schema dump.
    console.error("place-order rejected payload", parsed.error.issues);
    const first = parsed.error.issues[0];
    const field = first?.path.join(".") || "request";
    return json({ error: `invalid order: check ${field}` }, 400);
  }
  const body = parsed.data;

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  if (!(await captchaOk(body.captcha_token ?? undefined, ip))) {
    return json({ error: "captcha_failed" }, 403);
  }

  // Resolve the buyer, if they're signed in. An invalid or expired token is not
  // an error — it just means this is a guest checkout, which is supported.
  // Verified against Auth (not merely decoded), so a forged JWT resolves to null
  // rather than to somebody else's id.
  // supabase-js sends the ANON KEY as the bearer when nobody is signed in, and
  // that is itself a valid project JWT — so it has to be excluded explicitly,
  // or every guest would look like a user to getUser().
  let customerId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (jwt && jwt !== ANON_KEY) {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await anon.auth.getUser(jwt);
    customerId = data.user?.id ?? null;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // A cart that names a station goes through the multi-shop RPC; everything
  // else takes the original single-shop path untouched.
  const { data, error } = body.pickup_station_id
    ? await admin.rpc("place_cart_order", {
        p_customer_name: body.customer_name,
        p_customer_phone: body.customer_phone,
        p_customer_notes: body.customer_notes ?? "",
        p_pickup_station_id: body.pickup_station_id,
        p_payment_method: body.payment_method ?? null,
        p_items: body.items,
        p_idempotency_key: body.idempotency_key ?? null,
        p_customer_id: customerId,
        p_discount_code: body.discount_code ?? null,
        p_share_code: body.share_code ?? null,
      })
    : await admin.rpc("place_order", {
        // name, phone and channel are guaranteed present by PayloadSchema; the
        // remaining fallbacks are for fields the schema genuinely allows to be absent.
        p_customer_name: body.customer_name,
        p_customer_phone: body.customer_phone,
        p_customer_notes: body.customer_notes ?? "",
        p_channel: body.channel,
        p_payment_method: body.payment_method ?? null,
        p_items: body.items,
        p_idempotency_key: body.idempotency_key ?? null,
        p_customer_id: customerId,
        p_discount_code: body.discount_code ?? null,
        p_share_code: body.share_code ?? null,
      });

  if (error) {
    // The RPC's own guards (stock, single-shop, quantity) are user-actionable,
    // so those pass through rather than being flattened to "server error".
    // Anything else is an unexpected database error whose message is not ours to
    // hand a stranger, so it is logged and answered generically.
    if (isSafeRpcError(error.message)) {
      return json({ error: error.message }, 400);
    }
    console.error("place_order failed", { code: error.code, message: error.message });
    return json({ error: "Your order could not be placed. Please try again." }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.reference || !row?.access_token) return json({ error: "Order was not created" }, 500);

  return json({ reference: row.reference, access_token: row.access_token });
});
