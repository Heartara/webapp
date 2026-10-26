# Deployment and activation

## Current publication boundary

GitHub Pages can publish only the static files. The public source branch retains rendered root pages for its existing branch deployment. `dist/` is recommended for any new static host. Never publish the SQLite database, backups, secrets or an operator's environment file.

**The CRM is implemented and tested, but it is not active on GitHub Pages.** Do not direct real clients to submit until the backend has been configured, privately tested and connected. The UI intentionally reports unavailable rather than claiming an unsaved request succeeded. No FormSubmit, SimplyBook.me or mailto substitutes are used.

## Backend host

Use a host supporting Node 24, HTTPS termination, a long-running process and persistent storage. Run one server instance against the local SQLite volume. Multiple hosts must not use independent SQLite copies; a multi-instance deployment needs a shared database and appropriate locking/queue architecture.

1. Build the public site using `SITE_ENV=production npm run build`.
2. Deploy the Node application with `npm start`, mounting a persistent directory outside `dist/` for `CRM_DB_PATH`.
3. Set a freshly generated 32-byte hexadecimal `CRM_ENCRYPTION_KEY` in the host secret manager. Back up this key securely and separately from the database. Losing it makes stored payloads unreadable. Key rotation and a data-retention/deletion policy require an operator procedure.
4. Set a long random `ADMIN_TOKEN` (at least 24 characters; 32+ recommended), also in the secret manager. Restrict admin network access where possible and place identity/MFA protection in front of `/admin` for operational use. Never share this token through a public file or chat.
5. Configure Resend with a verified sender domain. Set `RESEND_API_KEY` and `MAIL_FROM`. The notification recipient is fixed server-side to `heartarahealing@gmail.com`; visitor data cannot set recipients or subjects. No real provider delivery was verified in this task.
6. Configure Turnstile for the actual public and API hostnames. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`. Production submissions fail closed if the required spam/admin settings are missing. Server-side token verification checks the allowed hostname. No live CAPTCHA was bypassed or tested.
7. Set `ALLOWED_ORIGINS` to exact HTTPS origins required by the website and private administration host. The current frontend origin is `https://heartara.github.io`. If a separate API host is used, add its own origin for private admin forms and set `PUBLIC_API_BASE` to the API's HTTPS URL ending with `/`. Keep it out of canonical URLs.
8. Use a trusted TLS reverse proxy. Add HSTS and secure operational settings there. Set `TRUST_PROXY=1` only when the proxy replaces forwarded headers; otherwise keep it off. Direct IP rate limits are hashed; raw IP addresses are not stored in the CRM.
9. Back up the encrypted SQLite database using SQLite-aware backups (including WAL consistency). Test restoration with the separately protected key. Monitor the notification outbox, storage health and `email_delivery_failed` events. Logs contain IDs/attempt counts rather than enquiry text or email addresses.
10. Approve and publish the actual hosting/email/spam provider names, data locations, retention, complaint and access procedures in the privacy notice before collecting real submissions.
11. Send an identified test enquiry and booking; verify a stored record, the pending booking status and a real notification in Penny's inbox. Simulate an email outage and verify saved data remains available and retry works. Do not treat this test as a confirmed appointment.

## Domain and discovery

- Keep the current production base unless Penny supplies a confirmed custom domain. For a move, update configuration, sitemap and canonicals together and use host-level 301 redirects from the old URLs where the host permits.
- Google reads robots.txt at the **origin root**. `https://heartara.github.io/webapp/robots.txt` is generated, but cannot govern the origin. Publish the matching robots file at `https://heartara.github.io/robots.txt` using an owner-level site, or use a confirmed custom domain. That owner-level repository/domain was not changed in this task.
- Submit `https://heartara.github.io/webapp/sitemap.xml` directly in Search Console using the URL-prefix property. A domain property needs DNS control, which is unavailable for `github.io`.
- Add the exact verification token to `site.config.json` and rebuild. The code supports verification but does not create a Search Console account or assume ownership.
- On the Node host, `/oracle.html` returns a 301 to `/oracle-cards.html`, `/index.html` redirects to the root and readable directory aliases redirect to the established `.html` routes. GitHub Pages cannot configure those per-path HTTP redirects; the legacy oracle file has a canonical, noindex and immediate HTML redirect as a limited fallback. Validate the final redirect chain when server hosting is enabled.
- The Node host serves genuine 404 responses. GitHub Pages uses `404.html`; check an unknown live URL after publishing. Never use an SPA catch-all with status 200 for missing pages.

## Measurement and post-launch

The frontend emits only allowlisted completion event names after a `saved:true` API response: `enquiry_saved`, `booking_request_saved`, `feedback_saved`. An optional `window.heartaraAnalytics(eventName)` adapter is called only when analytics is enabled. No name, email, message, topic, health information or request ID is passed to this adapter. There is no analytics provider or cookie tracker installed. Add an approved provider/consent configuration separately; disable automatic form-value, URL-query and session-replay collection. No purchase event exists because there is no checkout.

After backend/domain activation, check Search Console ownership, sitemap processing, URL Inspection, selected canonicals, indexing exclusions, structured-data reports and live mobile usability. Use the Rich Results Test on the live homepage (Organization) and public inner pages (BreadcrumbList). Record real-user Core Web Vitals when enough traffic/CrUX data is available. A laboratory load measurement or Lighthouse score is not field performance and does not predict rankings.
