# Heartara website and CRM server

Heartara's established static HTML/CSS design is retained. The public production URL is currently **https://heartara.github.io/webapp/**. There is no confirmed custom domain. Public routes use readable `.html` URLs, matching the existing hosting convention.

See [the SEO and CRM handover](docs/SEO_HANDOVER.md) for the audit, remaining setup and acceptance results. See [deployment](docs/DEPLOYMENT.md) before activating the CRM.

## Build and check

Requires Node.js 24+. There are no npm runtime dependencies.

```sh
SITE_ENV=production npm run build
npm test
npm run check
```

`dist/` is the allowlisted public deployment artifact. It contains no server source, environment files, administration editor, private records or database. Public content, navigation, approved testimonials and JSON-LD are in the initial HTML; JavaScript enhances the menu, card search, reviews and forms.

The source `.html` files remain the editing surface. For the existing GitHub Pages branch deployment, render production metadata and asset hashes into those root files before committing:

```sh
SITE_ENV=production node scripts/build.mjs --publish-root
```

Builds without `SITE_ENV=production` mark every generated page `noindex` and generate a disallow-all robots file. Preview hosts should additionally be access-controlled; never submit a preview sitemap. Do not serve source `.html` files on staging without a preview build or an HTTP noindex header.

`site.config.json` holds the public base URL, optional Search Console verification token, public API base URL and analytics switch. No credentials belong there. `PUBLIC_BASE_URL` and `PUBLIC_API_BASE` can override the build settings. Keep production canonicals pointed at the confirmed production URL, even when inspecting a preview.

Sitemap dates use `.content-dates.json` fingerprints of meaningful page content, metadata and structured data. Rebuilding unchanged content does not reset dates. Do not manually stamp every URL with the build date.

## Serve and operate the CRM

```sh
npm start
```

Without server secrets, the server serves public pages but rejects submissions with 503. GitHub Pages cannot run this server: on the current static deployment the forms show an unavailable message and never claim that details were saved. There are no mailto or external email-form fallbacks.

The CRM uses Node SQLite on persistent storage and AES-256-GCM encryption of personal submission payloads. A successful save and its notification outbox job are committed in one transaction. Email failure leaves the submission intact; retries use capped backoff. Request UUIDs prevent duplicate saves. Resend idempotency keys reduce duplicate notifications within the provider's 24-hour window; notification delivery is not an exactly-once guarantee.

Production requires server-side configuration described in `.env.example`, a verified email sender and Turnstile keys. Do not put credentials in GitHub Pages, public JavaScript, the source repository or chat. Store the database outside `dist/` and outside any public web root; use persistent disk and secure backups.

The server's `/admin` and `/api/admin/*` paths require a strong server-only administrator token. Browser HTTP Basic login uses username `penny` and that token as the password; operate **only over HTTPS**. Bearer authentication is also supported for server-side operations. All private responses are no-store/noindex; these headers are not the access-control mechanism. No database records are in the static website.

The inbox lists requests and notification status via the private API and permits a failed notification to be retried. Booking requests are **pending** and are never automatically confirmed. A full scheduling, payments, marketing and approval CRM is outside this implementation; do not label a request as a confirmed booking.

## Content and assets

Dedicated pages: Home, About Penny, offerings overview, Reiki sessions, Reiki training, Munay Ki, ceremony, retreats/group healing, oracle cards, contact, bookings and practical/client-rights policies. The existing useful group-gathering content supports retreats; there are no invented event dates or thin town pages.

Edit `reviews.json` for approved review records and update the static review cards on `index.html` to match. The 10-second rotation reads the HTML; every approved review is readable without JavaScript. Feedback is private until Penny approves publication. Journal entries are currently empty, so the journal is noindex and absent from the sitemap. Add approved writing to both the HTML and data when publishing; do not rely on a client fetch for essential text.

Responsive WebP assets and `image-manifest.json` were generated from Penny's original photographs. `scripts/optimise-images.py` is an optional maintenance tool requiring Python/Pillow; it is not a production Node dependency. It resizes and compresses images without generating or retouching their content. The build adds dimensions, sizes/srcset, lazy loading below the fold and high fetch priority for the homepage forest photograph.
