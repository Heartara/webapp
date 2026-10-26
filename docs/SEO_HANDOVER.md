# Heartara SEO and CRM handover — 26 October 2026

## Outcome

The implementation preserves Heartara's blush/botanical design, original logo blending, photographs, prices, spiritual voice and approved testimonials. The About page uses a professional Heartara introduction and approach: automatic publication review rejected re-uploading the detailed personal biography, so sensitive life and nursing-experience details were omitted as a safer alternative. Penny can supply an explicitly approved public biography for a later update. Thirteen public pages are statically rendered with unique metadata and crawlable links. The enquiry, booking and feedback interfaces are wired exclusively for the new server-backed CRM.

**Live CRM activation remains blocked by hosting and account configuration.** GitHub Pages cannot execute the Node server or persist enquiries. The forms must not be advertised as operational until the checklist in DEPLOYMENT.md is complete. No real email delivery or live Turnstile verification is claimed.

## Audit and changes

| Area | Before | Implemented |
| --- | --- | --- |
| Framework/routing | Plain HTML, CSS and JS, GitHub Pages; mostly `.html` routes | Keep static HTML and existing URL convention; add `reiki.html`, `reiki-training.html`, `ceremony.html`, `oracle-cards.html`, `policies.html`, `404.html` |
| Navigation/content | Several links/photos/reviews inserted by JavaScript; Reiki training embedded in sessions | Navigation, approved photographs and all seven testimonials appear in HTML. Separate useful Reiki sessions/training pages; no generated town pages |
| Retreats | Existing substantive group gathering and Wendy's mini-retreat review | Retain `group-healing.html` for retreats and groups; practical details clearly by enquiry, no invented public event |
| Metadata | Repeated descriptions, draft noindex, no canonicals | Unique titles/descriptions; `en-AU`; production canonicals; Open Graph/Twitter metadata; favicon; one main heading; breadcrumbs |
| Indexing | Draft pages noindex | Production build indexes 13 public pages. Journal without posts, thank-you, alias and 404 excluded. Preview builds noindex; administration unavailable publicly |
| Discovery | No sitemap or robots | Canonical XML sitemap, stable content-based dates, generated robots, configurable verification. Origin-root robots setup remains required on GitHub Pages |
| Structured data | None | Organization/WebSite on home, WebPage/BreadcrumbList on appropriate public pages. No self-serving review stars, speculative LocalBusiness, Product, Event or FAQ markup |
| Images | Large original photos and missing dimensions | 33 responsive WebP variants, width/height for 51 rendered image occurrences, lazy loading, high-priority hero image. Original artwork preserved |
| Forms/CRM | Booking and feedback used mailto; no storage; interrupted FormSubmit work had not made delivery live | Server validates; encrypted SQLite save plus outbox transaction; fixed-recipient email; retry/backoff; token/rate-limit/honeypot/Turnstile; authenticated private records. Browser success only after saved response |
| Analytics | None | Optional PII-free completion-event adapter, off by default. Button clicks are not completions; a booking request is not a confirmed booking |

Canonical production base: `https://heartara.github.io/webapp/`. Query strings such as deployment `?v=` are not canonical URLs. There is no confirmed custom domain and none was invented.

## Structured-data decisions

Organization is supported by the visible Heartara identity, Penny's name, supplied logo, email and Facebook group. BreadcrumbList mirrors visible two-level breadcrumbs. All JSON-LD is in the initial HTML and parses successfully.

LocalBusiness rich-result markup is deferred because the public physical address/details are not confirmed for publication; Penny shares her home address only after confirmation. Product rich-result markup is deferred because there is no confirmed offer price/availability or eligible product review data. Event markup is deferred because no individually scheduled public event has approved date/venue information. FAQ text is for people; no FAQ rich-result claim is made.

These are local structural/schema-contract checks against current official guidance, **not a Google eligibility certification**. Google’s live Rich Results Test has now detected one valid Organization item on the homepage and one valid Breadcrumbs item on the Reiki training page. Search Console monitoring and any later template/content changes still need follow-up checks.

## Verification performed

- Production build: successful; 13 indexable public pages.
- Automated suite: 13 tests pass. Includes direct public routes, protected private paths, redirects, true 404s, booking time rules, request validation, cross-origin/spam rejection, encrypted durability across a restart, idempotent saves, missing-backend/storage failures, email outage and successful retry, provider request contract and pending booking status.
- Build checker: all canonical public URLs in the sitemap; unique titles/descriptions; no deployment parameters in canonicals; internal links/fragments resolve; 51 image occurrences have alt text and dimensions; 13 JSON-LD graphs parse and have the intended types; no mailto/external email-form substitutes in the public build.
- Repeated production build: content-date file unchanged when content is unchanged.
- Preview output and server: noindex controls checked. Public artifact excludes environment files, server code, database, private administration and download editors.
- Browser checks: direct training page; mobile-width iframe (~375 content pixels inside a 390px frame), no horizontal overflow on home/contact; menu opens, Escape closes; all public navigation links visible in HTML; enquiry fields labelled; unavailable backend retains entries; successful enquiry and booking acknowledgements checked against a temporary in-memory CRM and fake email transport. Test data was ephemeral and no real email was sent.
- Image laboratory checks: forest photo 146,246 bytes to 64,824 bytes at 640px; despacho 368,588 to 113,174; Reiki group photo 478,893 to 54,166. Homepage HTML gzip approximately 6.2 KB before final metadata regeneration. Main text/button palette contrast checks range from 4.92:1 to 8.54:1 against the relevant supplied backgrounds.
- No Lighthouse score or real-user Core Web Vitals result is claimed. No exhaustive screen-reader audit, real-device matrix, field analytics or real email-provider delivery test was possible in this session.

## Penny's missing-information list

1. Reiki training prices for each level/individual/group option; learning outline, prerequisites, duration and dates; exact approved certificate/training wording. No accreditation is inferred.
2. Retreat dates, venue, duration, capacity, fees, inclusions, practical requirements and the final facilitator flow.
3. Oracle prototype-arrival confirmation, release date, sale price, stock, ordering/checkout, delivery areas/costs/times, dispatch and returns arrangements. The dated 25 October expected-arrival statement is preserved as an expectation, not an arrival claim.
4. Cancellation/rescheduling notice periods, deposits, package validity, transfers and refund arrangements. Current policies say these are agreed before commitment; no fees or deadlines were invented.
5. Exact Monday hours and weekday evening finishing times; whether weekend end time means last start or session finish. Existing request rules remain unchanged: weekend requested starts 9 am–5 pm, weekdays from 5 pm, all pending personal confirmation.
6. Confirmed custom domain if desired; business phone/ABN if she wants them published; Google Business Profile and review link. Do not disclose her home street address without her explicit instruction.
7. Hosting/email/spam provider approval, data locations, retention/deletion and secure backup procedures before collecting real CRM data; privacy/legal review against actual operations.
8. Search Console ownership token, approved analytics provider/consent approach and access to live performance data.

## Remaining account/technical setup

Follow DEPLOYMENT.md for Node hosting with persistent disk, secret manager, verified Resend sender, Turnstile, administrator access and API configuration. Configure the origin-root robots file or custom domain. Search Console, Google Business Profile and analytics accounts were not created or modified. Payment, booking approval workflow, SMS, calendar synchronisation and a full CRM contact-management product were not claimed or enabled.

## Official references used

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/essentials
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- https://developers.google.com/search/docs/appearance/structured-data/organization
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/event
- https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/robots/intro
- https://developers.google.com/search/docs/appearance/page-experience
- https://support.google.com/business/answer/7091

Technical implementation references: Node.js SQLite API; Resend send-email and idempotency documentation; Cloudflare Turnstile server-side validation documentation. Search appearance, indexing, rankings and rich results are not guaranteed.

## Live publication verification

Published implementation commit: `95b292072c597ffc588308fe75730b21d437ebfe`. GitHub Pages deployment and the Heartara checks workflow both succeeded.

All 13 public canonical pages returned HTTP 200 with the expected absolute canonical and `index, follow` directive. The live sitemap and project-path robots file returned 200. A deliberately missing page returned 404. The unhosted CRM endpoint `/webapp/api/form-token` returned 404 on GitHub Pages, as expected; live submission activation remains blocked, not silently substituted.

Google Rich Results Test, 26 October 2026:

- Home: one valid Organization item. Result: https://search.google.com/test/rich-results/result?id=4G16keuiKL-Jd0RBnXiPpA
- Reiki training: one valid Breadcrumbs item. Result: https://search.google.com/test/rich-results/result?id=GyJjBpxEZGNDQizzyh0Euw

Live desktop visual verification confirmed the established blush/botanical design, blended logo, navigation and new Reiki training page. Google test results describe the inspected version, not a guarantee of indexing, rankings or rich-result display.
