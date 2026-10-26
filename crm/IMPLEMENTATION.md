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
