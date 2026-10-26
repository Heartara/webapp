# Heartara on Vercel + Supabase

The public website and private CRM are designed to run on **one Vercel project and domain**:

- `/` — Heartara website
- `/contact.html` and `/booking.html` — on-site CRM forms
- `/#reviews` — moderated public reviews and feedback form
- `/crm/` — private login and CRM
- `/api/…` — Vercel Node functions using Supabase

No separate always-running server or backend host is needed for this deployment. `npm run crm:start` remains the local development command. Vercel uses `vercel.json`, `api/handler.js` and the curated `dist/` build instead.

## Actual connection state, 26 October 2026

The supplied Supabase project is reachable and its supplied keys can access the API. Read-only checks found the CRM tables absent (`PGRST205` for staff_users, services and business_settings). Public Auth signup is currently enabled. No customer records were submitted during these checks. No Vercel project, deployment credentials or deployment URL is available to this task yet. Thus the integration is prepared, not live-verified.

## 1. Install the database once

In your existing Supabase project, open **SQL Editor → New query**. Copy the contents of `supabase/heartara-install.sql` and run it once. It contains the three reviewed migrations in order. Use an empty development project first if you need an isolated trial. Do not run `crm/tests/bootstrap.sql` on Supabase. Do not rerun the install script on a partially installed database without checking which numbered migration completed.

In **Authentication**, disable new public user signups. Create your own user securely in the Supabase Auth Dashboard. Then open `crm/scripts/provision-owner.sql`, replace `OWNER_AUTH_UUID` with your actual Auth user ID, and run it. This assigns the private CRM owner role without any default password.

Import the actual four existing reviews only after reviewing `crm/legacy-reviews-review.sql`, replacing its owner UUID, and confirming the supplied permission provenance. No production review import is performed automatically. With no imported/published feedback, the site honestly shows no published reviews.

## 2. Import the repository into Vercel

Open Vercel's **Add New → Project**, select `Heartara/webapp` and use branch **crm/supabase-phase-one**. Set the project's production branch to that branch while reviewing this implementation; `main` does not contain the CRM deployment configuration yet. Do not publish a different branch by accident.

- Framework preset: **Other**
- Root directory: repository root
- Build command: `npm run vercel:build`
- Output directory: `dist`
- Install command: `npm ci`
- Node.js: **24.x** (22.x is also supported by the application)

The build copies an explicit list of public assets. It does **not** publish `.env` files, packages, tests, migrations, private settings, source server scripts or the legacy public moderation editor. The API uses the same-origin database-backed forms; no email-app fallback remains.

## 3. Add secrets in Vercel, not website code

Add these under **Vercel Project → Settings → Environment Variables**, for the environments you intend to test/deploy:

| Variable | Value / handling |
|---|---|
| `SUPABASE_URL` | `https://emsheprjvfwjwkamfxss.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key, or legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Actual Supabase server-only service-role key; sensitive |
| `RATE_LIMIT_SALT` | A new long random secret (32+ random bytes recommended) |
| `ALLOWED_ORIGINS` | Exact HTTPS Vercel/custom domain origins, comma-separated, no paths |
| `EMAIL_MODE` | `sandbox` until a sender is verified and alerts are approved |
| `CRON_SECRET` | A separate strong random secret for the notification recovery endpoint |

Vercel's own `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` origins are accepted automatically. The explicit origins setting is for custom domains or any separately hosted approved site. The IP limiter uses Vercel's platform-managed forwarded client header in Vercel Functions; generic Node deployments keep their existing explicit proxy setting.

Keys saved in the chat cloud environment are **not automatically copied to Vercel**. Copy actual keys directly from Supabase into Vercel's secure settings. Never copy proxy placeholders, put a service-role key in `crm-public-config.js`, or paste secrets into chat. Public config stays blank for same-origin hosting, so the site and CRM cannot accidentally point to different backend URLs.

After the first deployment, set Supabase Auth **Site URL** to `https://YOUR-VERCEL-DOMAIN/crm/`, and allow that exact recovery redirect. Add only preview origins/redirects you control; avoid a blanket wildcard. Redeploy after changing Vercel environment variables.

## 4. Email alerts and scheduled retries

Sandbox mode does not send email. The Vercel notification endpoint deliberately leaves jobs queued rather than discarding them into ephemeral sandbox files.

After a real sending domain is verified, configure `EMAIL_MODE=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_NOTIFICATION_EMAIL` and `CRM_PUBLIC_URL=https://YOUR-DOMAIN/crm/`, then enable matching alerts in private CRM Settings. Successful website submissions schedule a bounded post-response outbox drain through Vercel `waitUntil`; records are stored before any alert attempt. Email failure never removes a request.

Recovery retries need a scheduler calling `GET /api/notifications` with `Authorization: Bearer CRON_SECRET`. The endpoint is protected, and does not reveal customer messages. For Vercel Cron, use a schedule your Vercel plan actually supports; minute-level schedules may require a paid plan. No subscription or unapproved schedule is added by this repository. Without a scheduler, failed alerts remain visible and queued until another eligible run or owner-operated retry; do not claim automatic recovery is active.

For Resend delivery/bounce/failure tracking, use `/api/provider/resend-webhook` and set `RESEND_WEBHOOK_SECRET`. Callback signatures and event deduplication are enforced. A provider-accepted notification is not labelled delivered until the verified event arrives.

## 5. Verify before making this the live site

1. `/api/health` returns a running server with database configuration; separately verify the database tables and owner access.
2. Anonymous requests to `/api/private/contacts` fail, and Supabase's public key cannot enumerate private contacts.
3. Sign into `/crm/`, verify only approved staff can enter, set up MFA, and test password recovery against hosted Supabase Auth.
4. Use one clearly synthetic enquiry/booking/feedback against the deployed test project. Verify stored source/consent, private pending feedback, manual publication/withdrawal and a retried request without duplication.
5. Confirm all website enquiry actions, service query values and removal/privacy requests reach the same domain's API. Simulate an outage: no success message, no email-app fallback, and text retained for retry.
6. Check that `/crm/` is not publicly cached; published reviews are fetched without caching. No private home address or secret key appears in public files, scripts, response payloads or logs.
7. Review the actual privacy text, catalogue, retention/provider settings and backup/restore plan, then select the Vercel deployment/domain as the live site. Change DNS/custom domain only when its ownership and destination are confirmed. This task has not changed DNS.

See `crm/README.md` for the detailed permissions and operational limitations. The owner workflow is implemented; other staff roles remain assigned/read-only. Deploying these files alone does not install the database, create the owner user, verify email or prove the site is live.

## Reproducing Vercel runtime checks

`node --test crm/tests/vercel.test.js` checks the build allowlist, routes and protected notification endpoint. The full `bash crm/scripts/test.sh` includes those tests. For the official runtime test, first prepare the synthetic database, install `@vercel/node@27.0.2` in a tooling directory outside the checkout, then run `VERCEL_RUNTIME_PACKAGE_PATH=/absolute/path/to/tooling/node_modules/@vercel/node node --test crm/tests/vercel-runtime.test.js`. This uses synthetic credentials and records only, and tests the actual Vercel body helper path including signed callback bytes. It does not deploy or contact a live email provider.
