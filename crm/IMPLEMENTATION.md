# Implementation and validation report

Prepared 26 October 2026.

The repository now contains the first owner-operated Supabase CRM implementation, migrations, an API/worker, private screens, public forms and operational documentation. Production connection and release are outstanding. The hosted project URL is known, but no project key, database migration access or owner identity has been supplied. No live data or emails were used.

Verified locally:

- 23 validation/database tests: idempotent transactional capture, original-message preservation, shared-email separation, private RLS, staff revocation, manual conversion and merge, overlap concurrency, snapshots/history, package balances/reversal, journey capacity/explicit rites, outbox leases, MFA assurance policy, reviewed erasure, real synthetic backup/restore, booking choices/windows and CSV escaping.
- 10 SDK/API tests against real PostgreSQL and PostgREST: form persistence, retry conflict, auth gates, unconfigured failure, private-file rejection, owner follow-up, sandbox mail/outage recovery, feedback moderation/unpublishing, rate/origin checks logged exports, signature-verified/deduplicated delivery callbacks and overdue-date filtering.
- 6 existing/public website tests, including all on-site enquiry paths and absence of mail-app fallback.
- Chromium desktop/mobile checks: public form → database, synthetic authenticated login, all nine private navigation screens, contact creation, sign out, first-session package guidance and a network outage retaining the unsent input. Auth in this harness is a **synthetic signed gateway**, so it does not establish that Penny’s hosted Supabase Auth is configured.

Read `crm/README.md` for connection, review/import, migration, hosting, notification and backup steps. The additional staff roles are strictly scoped/read-only in this release. Phase 1 is not claimed fully deployed or complete against every item of the larger brief while these setup and delegated-workflow items remain outstanding.

Container packaging: a Dockerfile is provided, but its dependency-install stage stalled in this environment and the image build was not completed. Native Node startup, database/API tests and browser paths were verified. Validate the image on the chosen deployment host before relying on it.


## Vercel integration follow-up

The website and `/crm/` are prepared for one Vercel project. Added curated static output, Vercel Node API adapters, same-origin form routing, private-page cache/security headers, post-response notification processing and a separately protected retry endpoint. No private/server/environment files are copied to the public bundle. The official @vercel/node 27.0.2 development runtime was used to verify request-body handling and a durable synthetic form submission; signed callback handling was also exercised through that runtime. Three additional build/routing/cron checks cover Vercel packaging.

Read-only hosted Supabase checks now succeed with the supplied keys, but GET requests for staff_users, services and business_settings return PGRST205: CRM tables are not installed. Supabase Auth reports public signup enabled. No hosted CRM submission, database migration, user creation or production email was performed. The earlier HEAD-only checks were not sufficient to prove table readiness; the GET checks establish the remaining setup requirement.

User confirmed no Vercel project exists yet and asked for preparation. No Vercel deployment, custom domain or DNS change has been made. The exact remaining steps are in crm/VERCEL.md and the consolidated supabase/heartara-install.sql.


## Current-main reconciliation

After Penny reported importing GitHub into Vercel, the refreshed main ref was found to contain substantial later website work through 90c328b (the previous implicit fetch had not updated origin/main). The branch now merges that current main without reverting its pages, photos, seven review texts or SEO build. The current .crm-form calendar/contact/feedback forms now map to the Supabase API; the Vercel build wraps the existing 13-page SEO build instead of publishing older page copies. The legacy SQLite implementation and tests remain for compatibility but are not used by the Vercel production API. Live domain checks are blocked by this execution environment’s egress policy, so no public response or successful live submission is claimed.


## Public form submission repair

A live Preview screenshot showed an object-shaped error rendered as [object Object]. Fixed same-origin credential handling for protected Vercel Previews, normalised public error display, same-host origin acceptance and secure key-separated rate-limiter fallback when no dedicated salt is set. Chromium with a simulated Preview-cookie gate verifies a saved synthetic enquiry; API coverage confirms three-setting same-origin requests persist while unapproved cross-origin requests remain rejected. Read-only hosted checks found zero form submissions/enquiries at diagnosis; no live test message or email was sent. Live Preview requests remain blocked by this workspace egress policy, so deployed success still needs confirmation.
