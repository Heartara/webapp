# Heartara website draft

A responsive, dependency-free draft based on the supplied Heartara master reference. Includes the homepage, dedicated oracle page, searchable 44-card contents, mobile navigation and email enquiry links. See [content review](docs/CONTENT_REVIEW.md) for editorial decisions and publication requirements.

## Develop

Requires Node.js 22 or later. No package installation or credentials are needed.

```sh
cd /workspace/webapp
npm start
```

The server uses port 3000, or the `PORT` environment variable. Request `/` and `/oracle.html` to validate startup. Stop with Ctrl+C. The site also works on a standard static host; `server.js` is a development server, not a production deployment platform.

```sh
npm test
```

The test suite checks actual HTTP routes, asset responses, 404 handling, internal navigation targets and the oracle contents. Browser checks should also cover mobile menu, card filtering, keyboard focus and viewport overflow.

No email is sent by this application. Enquiry links open the visitor’s email client. Artwork is illustrative and not final product imagery. Pages are marked noindex while the draft is under review.

## Writing a journal post

Open `write.html` on the website, enter a title, date and your words. Save a local browser draft if needed. **Download updated journal** includes your new post and the existing entries. In the linked GitHub upload screen, upload that `posts.json` file to the repository root and commit to `main`. GitHub Pages then rebuilds the journal. Writing or saving in the editor alone does not publish. Keep a separate backup of your words. Never write private information in a post you intend to publish.

New pages: `offerings.html` (Reiki, Munay Ki and despacho), `group-healing.html` (recorded ceremony flow), `about.html` (expanded biography), `journal.html` and `write.html`. Original logo and photographic asset files are still needed; see the review document.
