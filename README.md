# PulseShop

Social-commerce storefront builder for the Kenyan market. Sellers get a hosted
shop linked from their social bio; shoppers browse and order through WhatsApp,
Instagram, Facebook or direct checkout. KES pricing, M-Pesa, PayPal and card payments.

Ships as a mobile-first PWA on Vercel, backed by Supabase, and packaged for
Android as a Trusted Web Activity.

- **Live:** https://pulseshop.space
- **Supabase project:** `ztktdjckrppwzvxgnujn` (eu-central-1)

---

## Contents

1. [Quick start](#quick-start)
2. [Languages and runtimes](#languages-and-runtimes)
3. [Repository structure](#repository-structure)
4. [Frontend](#frontend)
5. [Backend](#backend)
6. [Automation](#automation)
7. [Android app](#android-app)
8. [Operations checklist](#operations-checklist)
9. [Deliberately not done](#deliberately-not-done)
10. [Known issues](#known-issues)

---

## Quick start

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

With no Supabase environment variables set, the app runs against the in-memory
mock adapter, so a fresh clone works with zero configuration. To use the real
backend, copy `frontend/.env.example` to `frontend/.env.local` and fill in
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Route check, `tsc -b`, Vite build, shell emit |
| `npm run preview` | Serve the production build on :4173 |
| `npm run icons` | Regenerate the PWA icon set |
| `node scripts/smoke.mjs` | Headless route checks (needs `preview` running) |
| `node scripts/verify-pwa.mjs` | Offline-load check plus screenshots |

PWA behaviour (service worker, install prompt, offline) exists only in the
production build. Use `npm run preview`, not `npm run dev`, to test it.

---

## Languages and runtimes

| Layer | Language and runtime | Location |
|---|---|---|
| Frontend | TypeScript, React 18, Vite 6 | `frontend/` |
| SEO and sitemap functions | TypeScript on Node (Vercel Functions) | `api/` |
| Privileged endpoints | TypeScript on Deno (Supabase Edge Functions) | `supabase/functions/` |
| Data, logic, access control | SQL and PL/pgSQL on Postgres | `supabase/migrations/` |
| Operational scripts | Python 3 (supabase-py, Pillow) | `automation/` |
| Build and verification | Node ESM, Playwright, sharp | `frontend/scripts/` |
| Android wrapper | Gradle, Bubblewrap TWA | `android/` |

---

## Repository structure

```
frontend/          the PWA
  src/
    routes/        route-level pages (marketing, auth, storefront, product,
                   cart, checkout, order, account, dashboard/*)
    components/    presentational and composite UI (ui/, product/, shop/, layout/, seo/)
    hooks/         cross-cutting behaviour (useCart, useFavorites, useSeo, useProfileSync)
    stores/        Zustand slices: auth, cart, favorites, order, orderHistory, shop, toast
    services/      types.ts  the interface contract both adapters satisfy
                   api/      Supabase implementation, plus mappers.ts (row <-> domain)
                   mock/     in-memory implementation
    lib/           pure helpers: currency, slug, phone, seo, productCsv, entitlements
    types/         domain model shared by both adapters
  scripts/         build gates and headless verification
api/               Vercel Functions: render.ts, sitemap.ts, log.ts (+ generated _seo/_shell)
supabase/
  migrations/      41 sequential SQL migrations; the real backend
  functions/       Deno edge functions: place-order, export-products
automation/        Python operational scripts
android/           Bubblewrap TWA config
.github/workflows/ CI gate and the migrate-then-deploy release pipeline
```

---

## Frontend

**TypeScript 5.6 in strict mode, React 18.3, Vite 6, Tailwind CSS 4.**
React Router 7 for routing, TanStack Query 5 for server state, Zustand 5 for
client state, react-hook-form with zod for forms, Radix UI primitives, Recharts
for dashboard charts, `vite-plugin-pwa` over Workbox.

### The service adapter

The single most important structural decision. Everything imports one `services`
object from `services/index.ts`, which resolves at module load to either the
Supabase adapter or an in-memory mock, based on whether the environment
variables are present. No component imports the Supabase client directly.

### Key patterns

- **Two-tier state.** TanStack Query owns server-derived data; Zustand owns
  device-local state. `AppSync` in `main.tsx` reconciles them: it syncs cart and
  favorites to the database for signed-in shoppers, and on sign-out wipes every
  piece of personal state plus the entire Query cache. These are frequently
  shared devices, and the rule being enforced is that signing out leaves nothing
  personal behind.
- **Session integrity.** The app subscribes to `onAuthStateChange` at startup.
  Without it, a token revoked server-side or a sign-out in another tab leaves the
  persisted store still claiming a live session.
- **Row and domain separation.** `services/api/mappers.ts` converts snake_case
  rows into camelCase domain types, so schema changes stay in one file.
- **Route ordering.** Static routes first; `/:shopSlug` and
  `/:shopSlug/:productSlug` last, since an unrecognised single segment is a shop
  handle. `RequireMerchant` gates every `/dashboard/*` route.
- **Retry policy.** Reads retry three times with exponential backoff, skipping
  4xx and RLS errors that will never come good. Mutations never retry; a blind
  retry is how one order becomes two.

---

## Backend

There is no traditional application server. Three runtimes, each for a specific job.

### Postgres on Supabase, the system of record

42 sequential migrations in `supabase/migrations/`.

- **Tables:** `merchants` (one-to-one with `auth.users`), `products`, `orders`,
  `order_items`, `cart_items`, `favorites`, `follows`, `follow_events`,
  `reviews`, `discount_codes`, `discount_code_products`, `discount_redemptions`,
  `export_requests`.
- **Enums mirror the TypeScript string unions**, so the database and frontend
  cannot drift apart on vocabulary.
- **Row Level Security is the real security boundary.** The anon key ships in
  the JS bundle by design and grants no trust on its own. Around 32 policies
  decide who reads what.
- **Roughly 40 SQL functions** carry the logic RLS makes impossible from the
  client. `SECURITY DEFINER` functions exist where RLS would otherwise return
  zeroes to a legitimate viewer; `merchant_stats` returns product, order,
  follower and rating counts in one round trip for exactly that reason.
- **Field constraints (0021)** cap every user-writable field at the database
  level, because zod runs in the browser and is therefore advice, not enforcement.

### Supabase Edge Functions (Deno)

- **`place-order`** is the only path to the `place_order()` RPC, which decrements
  stock for an order nobody has paid for yet. Execute rights were revoked from
  `anon` and `authenticated` in migration 0024 and granted to `service_role`
  alone. This function holds that key and refuses to use it until Cloudflare
  Turnstile confirms a real browser. Payloads are validated with zod; RPC errors
  pass through an allowlist so unexpected Postgres detail never reaches a user.
- **`export-products`** builds a catalogue CSV and emails it via Resend, only
  ever to the caller's own verified account email read from the JWT. There is no
  recipient parameter: an endpoint that mails an arbitrary address is an open
  relay. Throttled to one export per seller per five minutes (migration 0042).

### Vercel Functions (Node)

- **`api/render.ts`** injects a real per-URL `<head>` into the built shell.
  WhatsApp, Instagram and Facebook read raw bytes and run no JavaScript, and the
  way PulseShop spreads is sellers pasting links into WhatsApp, so without this
  every shared product previews as the same generic blurb. Head injection, not
  SSR: the body is still an empty root.
- **`api/sitemap.ts`** serves a sitemap index plus paginated shop and product
  sitemaps. Pagination is clamped in SQL and again in code.
- **`api/log.ts`** proxies browser error reports to Axiom, holding the token
  server-side. Falls back to Vercel runtime logs when unconfigured.
- All read with the **anon key only**, never service role, forward no request
  header or cookie, and HTML-escape every interpolated value. This is the app's
  only raw-HTML path, so React's automatic escaping does not apply.

### Payments

`services/api/payments.ts` is a deliberate placeholder. M-Pesa Daraja, PayPal and
card-gateway secrets must never reach the browser, so the adapter talks only to
`VITE_PAYMENTS_API`. Until that is set, all three methods simulate success for
beta UI testing. Expected contracts are documented in the file header.

---

## Automation

### Python operational scripts

`automation/` runs server-side with the **service role key**, which bypasses RLS
and must never reach the frontend.

```bash
cd automation
python -m venv .venv
.venv\Scripts\activate          # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt
cp .env.example .env            # fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
```

- **`image_processor.py`** auto-orients from EXIF, resizes, re-encodes as
  optimized JPEG, uploads to the public `media` bucket, and writes an
  original-to-URL CSV. Per-image failures are caught so one bad file does not
  abort the batch.

  ```bash
  python image_processor.py --input ./photos --merchant <uuid> \
      --folder products --max-size 1200 --quality 82 --out urls.csv
  ```

- **`analytics_report.py`** prints revenue, order counts, average order value,
  top products, channel breakdown and low-stock items; optionally writes JSON.

  ```bash
  python analytics_report.py --merchant <uuid> --json report.json

  # daily at 06:00
  0 6 * * *  cd /path/to/PulseShop/automation && \
             ./.venv/bin/python analytics_report.py --json /var/log/pulseshop/report.json
  ```

### Build-time gates

The build is a four-stage chain: `check-seo-routes.mjs`, `tsc -b`, `vite build`,
`emit-shell.mjs`.

- **`check-seo-routes.mjs`** fails the build when `main.tsx` grows a top-level
  route `api/render.ts` does not know about. The renderer treats an unrecognised
  single segment as a shop handle, so a new `/wishlist` route would be looked up
  as a shop, miss, and be served 404 with noindex. The page would still render
  client-side, so the failure is invisible until someone wonders why it never
  appears in search.
- **`emit-shell.mjs`** writes the built `dist/index.html` into `api/_shell.ts`
  and copies `src/lib/seo.ts` to `api/_seo.ts`. It has to be the built file
  because Vite rehashes asset names every build, and a stale shell links to
  assets that no longer exist. Server and browser must emit identical tags, or a
  crawler sees one thing following a link and another fetching directly, which
  reads as cloaking.

### Verification

- **`smoke.mjs`** drives headless Chromium at 390x844 over every route, checking
  each renders and no console errors fire.
- **`verify-pwa.mjs`** installs the service worker, goes offline, reloads, and
  confirms the shell still renders.

### Database-side

Triggers keep invariants true regardless of which client writes:
`set_updated_at`, `set_product_status` (available/low/out from `stock_qty`),
`set_product_slug`, `refresh_product_rating`, `handle_new_user` and
`create_merchant_profile`, `log_follow_event`.

### Release pipeline

`.github/workflows/deploy.yml` applies migrations and deploys edge functions
**before** the frontend ships. Old code against a new schema is survivable; new
code against an old schema is not. If the migration fails, no code ships.
`ci.yml` runs the same build on pull requests, with no database access and no
secrets, which also proves the zero-config mock path still works.

---

## Android app

A **TWA**: a thin native shell rendering `pulseshop.space` full-screen in
Chrome's engine, with no browser UI. It contains no app code, so **every deploy
updates the app instantly** for everyone who has it installed. An APK rebuild is
only needed when the icon, name or package id changes.

iOS has no equivalent. There, PulseShop installs as a PWA through Safari's
Share, then Add to Home Screen, which the in-app install prompt walks users
through.

### The keystore is irreplaceable

`frontend/public/.well-known/assetlinks.json` publishes the SHA-256 fingerprint
of `android/pulseshop.keystore`. That file is the Digital Asset Links handshake,
and it is the only reason the app renders without a URL bar. If the keystore is
lost, a rebuilt APK is signed with a different key, every installed copy shows
the address bar, and Play Store updates are rejected outright.

```
56:E7:0D:22:25:13:07:1B:9C:F5:BA:DD:21:F5:74:E7:F6:C7:B3:77:D9:8B:79:80:6B:BF:B6:28:3A:C8:26:1D
```

```bash
keytool -list -v -keystore pulseshop.keystore -alias pulseshop
```

`keystore-password.txt` is gitignored. Move it into a password manager and delete
the file.

### Building

`twa-manifest.json` is the only source file here; everything else Bubblewrap
generates and is gitignored.

```powershell
npm i -g @bubblewrap/cli
cd android
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = (Get-Content keystore-password.txt -Raw).Trim()
$env:BUBBLEWRAP_KEY_PASSWORD      = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
bubblewrap build --skipPwaValidation
```

The first run downloads a JDK 17 and the Android SDK, and Google's SDK terms have
to be accepted by a human, so it is interactive by design.

**Two Windows traps:**

1. `'gradlew.bat' is not recognized`, when `NoDefaultCurrentDirectoryInExePath=1`
   is set. Bubblewrap invokes `gradlew.bat` bare, without `.\`, and `cmd`
   refuses. Clear it first:
   `Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue`
2. Do not pipe blanket `y` answers in. Bubblewrap asks free-text questions too,
   and a stream of `y` set `versionName` to the literal string `"y"`.

Verify the handshake after deploying:

```bash
curl -s https://pulseshop.space/.well-known/assetlinks.json
```

---

## Operations checklist

The hardening that is **not** code. Every item is a dashboard setting, so it
cannot be committed, reviewed or tested. This is the record that it was decided,
and the place to check when something behaves unexpectedly.

### 1. Release pipeline

- [x] **Vercel's Git auto-deploy for production is off**, via
      `git.deploymentEnabled: { "main": false }` in `vercel.json`. Without it
      every push deploys twice, and the first one is the exact race the workflow
      exists to remove. Only `main` is affected; PR previews still work, and CLI
      deploys from CI are unaffected.
- [x] **Repository secrets are set:** `SUPABASE_ACCESS_TOKEN`,
      `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`,
      `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Verified 27 Jul 2026, except
      `SUPABASE_DB_PASSWORD`, which nothing local can check. If the `migrate` job
      fails on authentication, that secret is the first suspect.
- [ ] **Create a `production` GitHub environment** if you want a human between a
      merge and a schema change.

### 2. Captcha must not be optional in production

`captchaOk()` returns `true` when no secret is set, so local stacks work without
Cloudflare keys. In production that fallback is a silently open door on the
endpoint that decrements stock.

- [ ] Confirm `TURNSTILE_SECRET_KEY` is set: `supabase secrets list`
- [ ] `supabase secrets set CAPTCHA_REQUIRED=true`, so the function answers 503
      rather than accepting an unverified order if the secret goes missing.

### 3. Token lifetime and refresh

GoTrue already issues short-lived access tokens and rotates refresh tokens, and
the browser client sets `autoRefreshToken`. Nothing to build; confirm the numbers.

- [ ] Authentication → Sessions: **JWT expiry ≤ 3600s**
- [ ] **Refresh token rotation enabled**
- [ ] **Reuse interval 10s or less.** This turns a stolen refresh token into a
      detectable event rather than a permanent session.

### 4. Rate limiting

| Endpoint | Control | Where |
|---|---|---|
| `place-order` | Cloudflare Turnstile | function |
| `export-products` | one per seller per 5 min | migration 0042 + function |

- [ ] **Vercel WAF on `/api/*`**, roughly 100 req/min/IP. Both `/api/render` and
      `/api/sitemap` are CDN-cached, so legitimate traffic rarely reaches them,
      but a cache miss is a Supabase round trip someone can issue in a loop.
- [ ] **Tighter rule on `/api/log`**, say 60/min/IP. The function limits per
      instance already, but that is best-effort by design.
- [ ] **Check Supabase auth rate limits** are at defaults or lower.

### 5. Error reporting (optional)

- [ ] Set `AXIOM_TOKEN` and `AXIOM_DATASET` in Vercel production environment
      variables, using an **ingest-only** token.
- [ ] Without them, browser errors land in `vercel logs` prefixed
      `[client-error]`. That is a supported state, not a broken one.

### 6. Verify after deploying

```bash
# 429 on the second export within five minutes
curl -i -X POST "$SUPABASE_URL/functions/v1/export-products" \
  -H "Authorization: Bearer $SELLER_JWT"

# 400 "invalid order: check items", not a Postgres error
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
`Access-Control-Allow-Origin: *`, which is correct here. CORS is enforced by the
browser; `curl` sends no `Origin` at all, and the anon key is public by design.
"Only our frontend may call this" cannot be expressed as an origin rule, which is
exactly why `place-order` uses proof-of-humanity instead. Locking it down would
buy nothing and would break the Android TWA and local development.

**Argon2id password hashing.** There is no password-handling code in this project
and there should not be. GoTrue stores passwords with bcrypt and a per-user salt.
Replacing it means giving up OAuth, email confirmation and recovery.

**Runtime-injected frontend credentials.** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are baked into the bundle at build time and cannot be
otherwise in a static SPA. Both are public; RLS, not secrecy, protects the data.
Server-side credentials are already read from the environment at runtime.

**Exponential backoff for dropped database connections.** There are no persistent
connections to drop. The equivalent, a retry policy for transient request
failures, is in `main.tsx`.

---

## Known issues

**Four open Dependabot advisories**, none currently fixable: `react-router` (no
patched 7.x exists; the fix is a v8 migration, and the advisory covers RSC mode,
which this SPA does not use), plus `postcss`, `fast-uri` and `brace-expansion`,
all transitive build tooling pinned out of reach by their parents.
