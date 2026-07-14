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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

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

interface OrderItem {
  product_id: string;
  size: string | null;
  qty: number;
}

interface Payload {
  captcha_token?: string;
  idempotency_key?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_notes?: string;
  channel?: string;
  payment_method?: string | null;
  items?: OrderItem[];
}

/** Cloudflare's verdict on the token. Fails closed: any error is a rejection. */
async function captchaOk(token: string | undefined, ip: string | null): Promise<boolean> {
  // No secret configured = captcha disabled for this deployment (mirrors
  // lib/captcha.ts, so a dev stack with no Turnstile keys still works).
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

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  if (!(await captchaOk(body.captcha_token, ip))) {
    return json({ error: "captcha_failed" }, 403);
  }

  if (!body.items?.length) return json({ error: "order must have at least one item" }, 400);

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
  const { data, error } = await admin.rpc("place_order", {
    p_customer_name: body.customer_name ?? "",
    p_customer_phone: body.customer_phone ?? "",
    p_customer_notes: body.customer_notes ?? "",
    p_channel: body.channel ?? "direct",
    p_payment_method: body.payment_method ?? null,
    p_items: body.items,
    p_idempotency_key: body.idempotency_key ?? null,
    p_customer_id: customerId,
  });

  if (error) {
    // The RPC's own guards (stock, single-shop, quantity) are user-actionable,
    // so pass the message through rather than flattening it to "server error".
    return json({ error: error.message }, 400);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.reference || !row?.access_token) return json({ error: "Order was not created" }, 500);

  return json({ reference: row.reference, access_token: row.access_token });
});
