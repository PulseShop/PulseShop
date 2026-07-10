import type { PaymentResult } from "@/types";
import type { PaymentService } from "../types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PAYMENTS — PLACEHOLDER FOR THE PAYMENTS INTEGRATION (partner to complete)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Payment SECRETS (M-Pesa Daraja consumer key/secret/passkey, PayPal client
 *  secret) must NEVER live in the frontend. This adapter only talks to OUR
 *  backend, which holds the secrets and calls the real gateways server-side.
 *
 *  Set `VITE_PAYMENTS_API` to the backend base URL (e.g. "/api/payments") to go
 *  live. Until it's set, both methods SIMULATE a successful payment so the
 *  checkout UI keeps working during development.
 *
 *  TODO(partner):
 *   1. Implement the backend endpoints (see expected contracts below).
 *   2. Set VITE_PAYMENTS_API in the environment.
 *   3. For M-Pesa STK push, the POST returns immediately while the customer
 *      approves on their phone — poll a status endpoint or use a callback +
 *      realtime/websocket to resolve the final { status, reference }.
 *
 *  Expected backend contracts:
 *   POST {VITE_PAYMENTS_API}/mpesa/stk   body: { phone, amount }
 *        -> 200 { status: "paid" | "failed", reference: string }
 *   POST {VITE_PAYMENTS_API}/paypal/order body: { amount }
 *        -> 200 { status: "paid" | "failed", reference: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PAYMENTS_API = import.meta.env.VITE_PAYMENTS_API as string | undefined;

const makeRef = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

/** Dev-mode stand-in until the real gateway is wired. */
async function simulate(prefix: string, delayMs: number): Promise<PaymentResult> {
  await new Promise((r) => setTimeout(r, delayMs));
  return { status: "paid", reference: makeRef(prefix) };
}

async function callBackend(path: string, body: unknown): Promise<PaymentResult> {
  const res = await fetch(`${PAYMENTS_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Payment request failed (${res.status})`);
  const data = (await res.json()) as PaymentResult;
  return { status: data.status, reference: data.reference };
}

export const paymentsApi: PaymentService = {
  async payWithMpesa(phone: string, amount: number): Promise<PaymentResult> {
    if (!PAYMENTS_API) return simulate("MP", 3000);
    return callBackend("/mpesa/stk", { phone, amount });
  },

  async payWithPaypal(amount: number): Promise<PaymentResult> {
    if (!PAYMENTS_API) return simulate("PP", 1200);
    return callBackend("/paypal/order", { amount });
  },
};
