# Heartara CRM — Supabase implementation

This is a server-backed CRM with a real PostgreSQL schema and Supabase Auth integration. It is **not connected to Penny’s hosted project yet**. No production data was migrated, no real customer messages sent, and no CRM changes published to the live website during development.

The target project URL supplied by Penny is `https://emsheprjvfwjwkamfxss.supabase.co`. This is a public identifier, not database access. Never commit keys, passwords, real client data, backups or `.env` files.

## Architecture and verified source

- Existing static public website retained, with on-site enquiry/booking/feedback forms.
- Separately hosted Node.js 24 server (`crm/server.js`) receives public submissions and serves the private app at `/crm/`.
- Supabase hosts PostgreSQL, the REST API and managed Auth. The browser gets only the public/publishable key; the server-only service-role key is never returned or bundled.
- Staff requests are made with the verified user's JWT and database row-level security, not with the bypass key. The bypass key is limited in application code to validated public intake, public-review projection, authenticated owner staff management, and notification operations.
- Background `crm/worker.js` uses the transactional outbox. Default transport is a file preview under `/tmp`; it sends no real email.
- Supabase JavaScript **v2**, pinned in package-lock.json. Official Supabase server-side auth and row-level-security documentation was consulted from the Supabase repository. All SDK APIs exercised locally use the pinned package. The local REST fixture uses PostgREST 12.2.12 and PostgreSQL 17; those are testing tools, not a replacement for hosted Supabase Auth.

Inspected source: local base `1ff0c37`, with no pre-existing application changes. The brief's audit mentions later pages and seven reviews that are **not in this checkout**. This implementation adds contact, booking and privacy pages and retains the four actual supplied review texts. Wendy’s review and the additional three texts were not present; none were invented. No externally edited website was downloaded and overwritten. Verify the current production source before release.

## What is implemented

- Durable enquiries, source context, consent history, idempotent public submission, rate limiting and a honeypot.
- Owner inbox, contacts, manual matching/conversion, reviewed duplicate merge, non-clinical notes, archival and reviewed erasure.
- Contacts with a shared email are never automatically merged.
- Requested/tentative/confirmed/completed/cancelled/no-show appointment states, UTC storage/Brisbane display, immutable service/price snapshots, buffered overlap exclusion, leave blocks and change history.
- Tasks with owner, due time, completion actor and timestamp. Overview shows new enquiries, upcoming confirmed appointments, overdue tasks and notification failures.
- Editable services including **Reiki 1, 2, 3a and Master**, the eight service keys in the brief, integer AUD cents and draft prices. No payment integration or certificate automation.
- Three-session packages with a transaction-protected completion ledger, unique appointment consumption, reversal history and exact server-computed balances.
- Individual/group nine-rite journeys, capacity one/three, a shared appointment slot, three group meeting numbers and explicitly recorded unique rite receipt. Attendance never automatically grants a rite.
- Feedback permission, immutable originals, owner review/approval/publication/withdrawal and minimal noncached public output. Public reviews rotate every 10 seconds with pause, previous/next and reduced-motion handling.
- Owner CSV exports with formula-injection protection and audit counts, without private notes or full enquiry messages.
- Authentication uses Supabase Auth; no public registration or home-grown password storage. Password reset and TOTP enrollment/verification are implemented. Owner MFA is enforced by both API and RLS once enabled.
- Origin allowlist, bearer-token CSRF model, no private record cache, escaped text rendering, server-only keys and no clinical data model.

## Explicit limits of this first release

The owner workflow is the writable workflow. Additional practitioners and assistants have strictly limited **read-only** assigned-record access. Delegated staff mutations, richer calendars, configurable work-hour exceptions, attachments, advanced retention automation and audit search remain follow-up work; do not advertise those as completed Phase 1 features.

The public form checks the brief’s request windows and whole-session weekend fit for fixed-duration offers. The owner explicitly agrees actual appointment times/durations, using leave blocks and the overlap rule. There is no live free/busy promise, automated working-hours engine or automatic appointment confirmation. No customer reminder jobs are scheduled, so rescheduling cannot leave an old reminder active.

Internal notes are append-only; write a correction rather than overwriting a note. Packages, participants, meetings and rite receipt are also append-only through the API. Mistaken rite entries or entitlement policy changes require an owner-reviewed database correction; there is no automatic certificate or forfeiture policy. Service prices are draft values, not a launch approval.

The browser app keeps Auth sessions in memory (`persistSession:false`), so a full reload requires sign-in. This avoids shared-browser persistent tokens. Password recovery and MFA require the actual hosted Auth configuration and must be tested before launch. No API response claims inbox delivery from provider acceptance.

## Local development

Node.js >=22 (Node 24 used), Docker for integration tests, npm.

```sh
cd /workspace/webapp
npm ci
npm run crm:build
cp crm/.env.example crm/.env
# Configure your isolated development Supabase project in crm/.env.
# Generate RATE_LIMIT_SALT securely, e.g. with node crypto.randomBytes(32).
# Leave EMAIL_MODE=sandbox.
npm run crm:start
```

The server defaults to port 3100. Use internal requests to `/api/health`, `/contact.html`, `/booking.html` and `/crm/`. A health response reports `database_configured`; a running process is not proof of a working hosted database. An unconfigured submission returns 503, never success. Static `npm start` is only for the original website; use `npm run crm:start` for the connected forms and CRM.

Run the deterministic synthetic integration suite:

```sh
bash crm/scripts/test.sh
```

This resets **only** the explicitly named local `heartara-crm-test-db` container’s `heartara_test` database. Do not point it at production. Database-role scaffolding in `crm/tests/bootstrap.sql` is test-only and must never be applied to Supabase. Tests exercise real PostgreSQL constraints and RLS. API tests also exercise the Supabase SDK through real PostgREST and a synthetic signed-auth gateway. The gateway deliberately does **not** prove hosted Supabase Auth sign-in, password reset or MFA delivery. No test sends customer email.

A browser-only synthetic harness is available after running the test suite:

```sh
node crm/tests/local-stack.js
```

In a second terminal, run `npm run crm:test:browser` (Chromium at `/usr/bin/chromium`, or set `CHROMIUM_PATH`). It serves ports 3110/3111 and uses `owner@example.invalid` / `synthetic-test-password` as isolated fixture credentials. These are not usable against any real project and are not included in the production Docker image. No fixture identity is provisioned in production. Do not enable this harness on a public server.

## Connect Penny’s Supabase project

1. Review the migrations in `supabase/migrations/`. Use a **development** project first. Apply them in numeric order using Supabase SQL Editor or the Supabase CLI migration workflow. `auth.users` and managed roles already exist on Supabase; do not run the test bootstrap.
2. In Supabase Auth, disable new public user signups. Configure the production Site URL and password-recovery redirect allowlist to the actual HTTPS CRM host (`…/crm/`). `supabase/config.toml` supplies the local defaults; hosted settings must be applied in the Dashboard or through the supported CLI. Set up the managed-auth SMTP provider before relying on recovery emails.
3. Create/invite Penny’s identity in Supabase Auth through the Dashboard. Confirm her preferred login email; the known business address is `heartarahealing@gmail.com`, but this does not mean an account has been created. Run `crm/scripts/provision-owner.sql` only after replacing `OWNER_AUTH_UUID` with that identity’s actual UUID. No default owner password is created.
4. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or the project’s legacy anon key) and **server-only** `SUPABASE_SERVICE_ROLE_KEY` in the server host’s secret settings. Generate a random `RATE_LIMIT_SALT`. Use TLS and a Node-compatible host. Supabase Postgres/Auth do not host this Node process; GitHub Pages cannot run it.
5. Run `npm ci && npm run crm:build` and start `node crm/server.js`, or build `docker build -f crm/Dockerfile -t heartara-crm .` and run with those secret bindings. The supplied Docker image uses an unprivileged runtime user.
6. Set `ALLOWED_ORIGINS` to the exact public website origin and CRM origin, with no paths. For the GitHub Pages website use `https://heartara.github.io`. Do not use wildcard origins. Only enable `TRUST_PROXY=true` behind a trusted host that replaces incoming forwarded headers; otherwise attackers can bypass IP rate limits. The server stores only short-lived HMAC rate buckets, not raw IP addresses.
7. Set the public, nonsecret `apiBase` in `crm-public-config.js` to the HTTPS server origin. For public pages served by the same server it can be blank. On GitHub Pages a blank origin makes the form honestly unavailable. Never put either a service-role key or private address in this public file.
8. Review `crm/legacy-reviews-review.sql`, generated from the four existing reviews. Verify publication authority, set the owner UUID, and import only in an authenticated owner context. Historical consent dates are **unknown**, not fabricated. Do not import demo identities. Confirm Wendy’s actual words separately if she is to be added. Once connected, the site reads only published database reviews, with no stale JSON fallback.
9. Test all real Auth, staff permissions, receipt/retry, owner moderation, export and deployment-origin paths in the isolated hosted project, then review the public privacy notice, catalogue, actual retention/provider choices and restore procedure before production release. Do not push an unconfigured switch-over to the live website.

## Owner email alerts

The first operational transport is optional Resend; no provider account is assumed. Keep sandbox mode until a sending domain and sender are verified and Penny approves the alert wording. Penny’s Gmail address is the recipient, not an assumed verified sender.

For live alerts set `EMAIL_MODE=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_NOTIFICATION_EMAIL` and `CRM_PUBLIC_URL` securely on the server, and enable matching notifications in private Settings. A scheduled job must run `npm run crm:worker` about once a minute. The scheduler uses the same server-only Supabase key. The worker does not run automatically from a GitHub Pages deploy.

Jobs are claimed with `FOR UPDATE SKIP LOCKED`, lease tokens, bounded exponential backoff and stable provider idempotency keys. They finish as sandboxed, provider-accepted or failed, never falsely delivered. Failed transport leaves the enquiry intact. Retry is visible to the owner. Resend’s idempotency window is finite: automated sends older than 23 hours stop for manual review, avoiding a blind resend after the provider’s deduplication window. Check the provider before a manual retry; do not reset timestamps to force sending.

For verified delivery events configure Resend webhooks to `/api/provider/resend-webhook`, set server-only `RESEND_WEBHOOK_SECRET`, and subscribe to delivery/bounce/failure events. The route uses Svix signature verification, bounded payloads and a database-unique event ID. Unauthenticated signatures are rejected; callbacks cannot regress an already final state. Signed callback parsing and deduplication are testable locally, but live provider callbacks and email delivery remain unverified until sending-domain setup exists.

## Permissions

| Capability | Owner | Practitioner | Assistant | Public |
|---|---|---|---|---|
| Business/settings/staff/export/notes/erasure | Full | Denied | Denied | Denied |
| Contacts | All | Assigned, read-only | Assigned, read-only | Denied |
| Enquiries | All | Denied | Explicit owner assignment, excluding privacy/removal/concerns; read-only | Submit only |
| Appointments | All | Own practitioner + assigned contact, read-only | Own assignment + contact, read-only | Request only |
| Tasks | All | Own assigned, read-only | Own assigned, read-only | Denied |
| Services | Edit | Read | Read | Only form choices, no direct DB access |
| Feedback moderation | Full | Denied | Denied | Submit, or read published projection only |
| Package/journey records | Full | Denied | Denied | Enquiry/request only |

Inactive staff are denied at the next request and by RLS, even if an Auth token has not expired. Public signup never grants membership. All authenticated operational writes use owner RLS. Staff management requires a separately verified owner session. Do not grant direct deletion or table-wide anonymous access to make an integration work.

## Archival, erasure, backups and rollback

- Archival retains the profile and history. Owner-reviewed anonymisation is a separate action requiring the exact contact UUID and typed confirmation. It scrubs linked contact details, form payloads, enquiry messages, ordinary notes, task titles and private appointment locations, while retaining constrained operational IDs and an erasure ledger.
- Merged contacts deliberately block one-record erasure; review all linked identities first. Feedback identities are separate and must be withdrawn/erased through a separately verified review request, not automatic email/name matching. This is not a universal legal erasure engine.
- Retention periods, backup schedule and storage location are business/deployment decisions, not invented defaults. Supabase backup/PITR availability depends on the actual plan. Verify its real recovery point/retention and restrict access before launch. Keep any independent dumps encrypted outside the public repository and website root.
- The automated synthetic test actually uses `pg_dump`/`pg_restore` into `heartara_restore_test`, then compares submissions and deletion history. Hosted backup restoration is not yet verified.
- Before restoring an older backup, preserve the **latest** deletion ledger separately under restricted access. Restore into an isolated environment, reconcile every erasure after the backup timestamp, reapply approved anonymisation and review withdrawal/unpublication records before exposing it. A historical restored ledger alone cannot identify erasures performed after that backup. Never restart notification workers on a restored outbox without reconciling provider IDs/deduplication state.
- Rollback the public integration to the previous approved release if necessary, preserving the CRM database and outbox for recovery. Do not drop tables as a deployment rollback. Keep submissions visibly unavailable rather than reviving an email-app fallback.

## Deferred and outstanding

No live account connection, hosted Auth/MFA/reset verification, sending-domain verification, production deployment, hosted backup restore, or automatic work-hours engine has been claimed. Multi-user delegated editing, events/ticketing, payments, stock, certificates, mailbox sync, client portal and wider journal publishing remain deferred. The original static journal editor remains separate and is not represented as a secure CRM publishing system.
