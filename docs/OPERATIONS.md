# Operations checklist

The hardening that is **not** code. Everything here is a setting in a dashboard,
so it cannot be committed, reviewed or tested; this file is the record that it
was decided, and the place to check when something behaves unexpectedly.

Work through it once per environment. Items are ordered by how much damage their
absence does.

---

## 1. Release pipeline

`.github/workflows/deploy.yml` applies migrations and deploys edge functions
**before** the frontend build ships. That ordering only holds if this workflow is
the sole deploy path.

- [x] **Vercel's own Git auto-deploy for production is off.** Done in code, via
      `git.deploymentEnabled: { "main": false }` in `vercel.json`. Without it
      every push deploys twice: once by Vercel the moment the push lands, once by
      this workflow after the migration, and the first of those is the exact race
      the workflow exists to remove.

      Only pushes to `main` are affected. PR previews still deploy from the Git
      integration, and `vercel deploy --prebuilt --prod` from CI is unaffected
      because that setting governs only the deployments Vercel creates by itself.

      **Do the secrets below before that setting reaches `main`.** Vercel reads
      `vercel.json` from the incoming commit, so the very push that introduces it
      is already skipped. If CI cannot deploy yet, production simply stops
      updating, with no error anywhere obvious.
- [x] **Repository secrets are set** (Settings → Secrets and variables → Actions):
      `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
      `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
      The Vercel ids come from `.vercel/project.json` after `vercel link`.

      Verified live on 27 Jul 2026: the Vercel token authenticates and can see
      `pulse-shop`; the Supabase token resolves project `ztktdjckrppwzvxgnujn`
      (eu-central-1, healthy). `SUPABASE_DB_PASSWORD` is the one value nothing
      local can check, since verifying it needs a database connection. If the
      `migrate` job fails on authentication, that secret is the first suspect.
- [ ] **Create a `production` GitHub environment** and require approval on it if
      you want a human between a merge and a schema change.

## 2. Captcha must not be optional in production

`place-order` decrements stock for orders nobody has paid for. Turnstile is the
only control on who may call it, and `captchaOk()` returns `true` when no secret
is set so that local stacks work without Cloudflare keys. In production that
fallback is a silently open door.

- [ ] **Confirm `TURNSTILE_SECRET_KEY` is set** on the Supabase project:
      `supabase secrets list`.
- [ ] **Set `CAPTCHA_REQUIRED=true`**:
      `supabase secrets set CAPTCHA_REQUIRED=true`.
      The function then answers 503 rather than accepting an unverified order if
      the secret ever goes missing. Leave it unset locally.

## 3. Token lifetime and refresh

Supabase Auth (GoTrue) already issues short-lived access tokens and rotates
refresh tokens, and the browser client sets `autoRefreshToken`. Nothing to build;
confirm the numbers are the ones you want.

- [ ] Supabase → Authentication → Sessions:
      **JWT expiry ≤ 3600s** (one hour; the default).
- [ ] **Refresh token rotation: enabled.**
- [ ] **Reuse interval: 10s** or less. This is what turns a stolen refresh token
      into a detectable event rather than a permanent session.

Password storage is GoTrue's, using bcrypt with a per-user salt. Do not
reimplement it: replacing it means giving up OAuth, email confirmation and
recovery, all of which work today.

## 4. Rate limiting

Code covers the two endpoints that needed it specifically:

| Endpoint | Control | Where |
|---|---|---|
| `place-order` | Cloudflare Turnstile | function, pre-existing |
| `export-products` | one export per seller per 5 min | migration 0042 + function |

The rest is platform configuration:

- [ ] **Vercel WAF rate limiting on `/api/*`.** Vercel → Project → Firewall.
      A rule of roughly 100 requests per minute per IP on `/api/render` and
      `/api/sitemap` is right: both are CDN-cached, so legitimate traffic rarely
      reaches them, and a cache miss is a Supabase round trip someone can issue
      in a loop.
- [ ] **A tighter rule on `/api/log`** (say 60/min/IP) as a second layer. The
      function already limits per instance, but that is best-effort by design.
- [ ] **Check the Supabase auth rate limits** (Authentication → Rate Limits) are
      at their defaults or lower, particularly sign-in and OTP. These are already
      enforced by the platform; the task is confirming nobody raised them.

## 5. Error reporting

`api/log.ts` forwards browser errors to Axiom, and falls back to Vercel runtime
logs when unconfigured. It works either way, so this is optional.

- [ ] Set `AXIOM_TOKEN` and `AXIOM_DATASET` in Vercel → Settings → Environment
      Variables (production). Use an **ingest-only** token.
- [ ] Without them, browser errors appear in `vercel logs` prefixed
      `[client-error]`. That is a supported state, not a broken one.

## 6. Verify after deploying

```bash
# 429 on the second export within five minutes
curl -i -X POST "$SUPABASE_URL/functions/v1/export-products" \
  -H "Authorization: Bearer $SELLER_JWT"

# 400 with "invalid order: check items" rather than a Postgres error
curl -i -X POST "$SUPABASE_URL/functions/v1/place-order" \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"x","customer_phone":"1","items":[]}'

# 405, not a 500
curl -i "https://pulseshop.space/api/log"
```

---

## Deliberately not done

Recorded so they are not re-proposed as oversights.

**Strict CORS allowlisting on the edge functions.** They answer
`Access-Control-Allow-Origin: *`, and that is correct here. CORS is enforced by
the browser; `curl` sends no `Origin` at all, and the anon key is public by
design because it ships in the JS bundle. "Only our frontend may call this"
cannot be expressed as an origin rule, which is exactly why `place-order` uses
proof-of-humanity instead. Locking the header down would buy nothing and would
break the Android TWA and local development.

**Argon2id password hashing.** There is no password-handling code in this
project and there should not be. See section 3.

**Runtime-injected frontend credentials.** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are baked into the bundle at build time and cannot be
otherwise in a static SPA. Both are public values; row-level security, not
secrecy, is what protects the data. Server-side credentials (the service-role
key, Turnstile secret, Resend key, Axiom token) are already read from the
environment at runtime and never reach the client.

**Exponential backoff for dropped database connections.** There are no
persistent connections to drop. The equivalent, a retry policy for transient
request failures, is in `main.tsx`.
