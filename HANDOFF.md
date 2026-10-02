# Developer handoff: Dr Shanker Website (Shanker Dental & Craniofacial Centre)

Everything a new developer (or a new AI session) needs to pick this up cold.
Read `README.md` first for the design system and file layout; this document
covers state, decisions and traps.

---

## 1. What this is

A rebuild of the practice's website, consolidating their two existing sites —
[dentalmadurai.com](https://dentalmadurai.com/) and
[shankerdentalcentremadurai.com](https://www.shankerdentalcentremadurai.com/),
which were mirrors of each other — into one modern static site.

**All copy and imagery is the client's own, taken from those two sites.**
Nothing was invented. Where a caption describes a clinical outcome, it came
from the original page.

## 2. Current state

| | |
|---|---|
| Repo | `dsignedbyharish/dr-shanker-website` (renamed from `Shankar-Dental-Hospital` on 2 Oct 2026; GitHub redirects the old URL) |
| Vercel project | `dr-shanker-website` (renamed from `shankar-dental-hospital`) |
| Live (preview host) | https://dr-shanker-website.vercel.app (the old `shankar-dental-hospital.vercel.app` still works) |
| Primary domain | https://dentalmadurai.com, waiting on DNS (§9) |
| `main` | deployed, stable — everything described here is on it |
| Open branches | none — `redesign-sections` is merged and deleted |
| Pages | 16 |
| Assets | ~250 images, WebP since Oct 2026 (~18 MB, down from ~40 MB) |

`main` is what is live, and it carries the editorial redesign — borderless
layout, serif display type, parallax, before/after sliders, Dr Shanker in the
hero. [PR #1](https://github.com/dsignedbyharish/Shankar-Dental-Hospital/pull/1)
merged it on 2 August 2026.

> **A trap this document itself fell into.** The handoff docs and `tools/` were
> committed to `redesign-sections` on 10 August — eight days *after* PR #1 had
> already been merged. Pushing to the branch of a merged PR does not reopen it
> and does not carry the commits to `main`, so the tooling and this file sat off
> `main` until a follow-up merge landed them. Before pushing to a branch, check
> that its PR is still open.

## 3. Running it

No build step, no dependencies, no package manager. It is plain HTML/CSS/JS.

```bash
node tools/dev-server.js         # http://localhost:8791, admin panel included
python3 tools/check.py           # pre-deploy validation — run before every push
python3 tools/bump_assets.py     # after editing anything in assets/css or assets/js
```

`python3 -m http.server` still serves the public pages, but only the Node dev
server runs the admin API (see §10). It has no dependencies beyond Node 18+.

Deploy is automatic: any push to `main` triggers a Vercel build. There is
nothing to compile.

## 4. Architecture, and the one sharp edge

Every page is standalone HTML. That keeps it simple, but it means the shared
chrome — top bar, header, nav, footer, back-to-top, lightbox — is **physically
duplicated in all 16 files**.

Do not hand-edit the nav 16 times. Edit it in `index.html` and run:

```bash
python3 tools/sync_chrome.py           # push chrome from index.html to the rest
python3 tools/sync_chrome.py --check   # report drift without writing
```

It preserves each page's own `<head>`, `<main>` and body classes, and re-applies
`aria-current="page"` per page from the map at the top of the script. If you add
a page, add it to `NAV_CURRENT` there.

> **Note:** these pages were originally produced by a set of Python generator
> scripts that lived in a session scratchpad, which has since been deleted. The
> generated HTML is complete and committed, so nothing is lost from the site
> itself — but the generator is gone. `tools/sync_chrome.py` replaces the part
> that actually mattered day to day. If you ever want full generation back,
> rebuild it from the committed HTML rather than from memory.

## 5. Decisions worth not undoing

These look like things to "clean up" but each is deliberate.

**The consent gate shows content when JavaScript is off.**
Treatment pages and the case archive gate surgical photography behind the 18+
disclaimer the original site used. That gate engages *only* when scripts run
(`html.js body.needs-consent`). Without JS the content is shown rather than
locked behind a button that could never be clicked — hiding it would also hide
it from crawlers.

**Homepage specialty cards use icons, not clinical photos.**
An earlier pass used surgical thumbnails there. The original site deliberately
gated exactly those images; putting them on the landing page contradicts that.
Photos stay behind the gate.

**Share cards never show a clinical photo.** Every page has its own 1200x630
card in `assets/images/og/` (portrait, facility photo or the 3D treatment
illustration, never surgical photography), including the surgical treatment
pages. `og:image` is what auto-previews when a link is shared on WhatsApp —
the most common way this practice gets referred — so a surgical photograph
there would walk straight past the consent gate, in the one context where the
person seeing it never chose to. Same reasoning as the specialty cards above.

**Canonicals are absolute and per-page**, pointing at the live domain rather
than the `.vercel.app` host. `tools/check.py` verifies each one against its own
filename, not merely that one exists: a page that canonicalises to the homepage
looks fine, renders fine, and quietly stops ranking. Copying a `<head>` between
pages is how that happens.

**Asset URLs carry a content hash** (`style.css?v=7a9ec922`).
`vercel.json` serves `/assets/*` with `Cache-Control: immutable, max-age=1yr`.
Without the hash, returning visitors keep stale CSS/JS after a deploy — a
half-broken site they cannot fix without a hard refresh. Every CSS and JS
file carries its **own** hash, written by `python3 tools/bump_assets.py`, and
`tools/check.py` fails if any version is missing **or no longer matches the
file**. (The language-toggle files once had no version at all, so no fix to
them could ever reach a returning visitor.)

**Filename case matters.**
`assets/images/IP-rooms.JPG` is uppercase. macOS is case-insensitive so a wrong
reference passes locally and 404s in production. `tools/check.py` compares
case-sensitively for this reason.

**Before/after sliders are on 6 pairs only.**
Orthognathic ×3, TMJ ×2, orthodontics ×1. Every candidate pair was checked:
these six share framing and dimensions, so the wipe compares like with like.
Other "pre/post" images only share a caption — wiping between two different
views compares nothing, so they were left as separate figures. Verify framing
before adding more.

**Old URLs are 301-redirected** in `vercel.json` (`staff_details.html` →
`doctors.html`, and 15 others). The previous site's pages are indexed; do not
remove these.

**`--ink-4` is not a text colour.** It is 2.96:1 on white. It is for borders and
disabled states only. Use `--ink-3` for secondary text (4.6:1).

**Any scroll-reveal on gated content must be refreshed when the gate opens.**
`IntersectionObserver` never fires for a target that is `display: none` when
`observe()` is called — it has no box, so it cannot intersect, and making it
visible later does not restart it. Every clinical `.figure` lives inside
`.clinical`, which is hidden until the visitor accepts the 18+ disclaimer, so
a reveal effect on those figures leaves them permanently masked: the visitor
passes the gate and gets a blank page, which is the exact opposite of what the
gate is for. `main.js` exposes `revealRefresh()` and the consent handler calls
it. **Anything else that reveals hidden content must call it too.** This is the
concrete form of the rule in README: never hide content behind an animation
that may not run.

**The header's `z-index` must clear the drawer scrim, not `--z-sticky`.**
`.site-header` is `position: sticky` with a `z-index`, which makes it a
stacking context. The mobile nav drawer lives *inside* it, so the drawer's own
`z-index: var(--z-drawer)` is resolved within the header and can never beat the
scrim, which is appended to `<body>`. At `--z-sticky` the scrim painted over the
open menu **and took the taps** — every link press closed the drawer instead of
navigating, so the mobile menu did nothing. It shipped that way and went
unnoticed through the whole first build. Raising the header is what lifts the
drawer; a child cannot outrank its own container.

**`.wrap` + `padding` shorthand is a trap.** `.page-head-inner` and
`.footer-top` sit on the *same element* as `.wrap`. A `padding: X 0 Y`
shorthand there wipes out `.wrap`'s `padding-inline` and the content goes flush
to the viewport edge. Use `padding-block`. This bug shipped unnoticed for three
commits.

## 6. Known constraints

**Photography.** The doctor portraits, hero cutout and facility photos were
replaced with enhanced high-resolution versions in September 2026 (the `-hd`
files). The clinical photographs on the treatment pages are still the old
site's originals, so their resolution is the ceiling there.

**Originals were downscaled.** Images over 1600px were resized in place before
the first commit, so git history holds the reduced versions only. The true
originals still exist on the two live source sites if ever needed.

**Canonicals, `sitemap.xml`, `robots.txt` and `llms.txt` all name
`https://dentalmadurai.com`**, correct once that domain points at Vercel.
Share-card and schema image URLs deliberately use the `.vercel.app` host
(`IMAGE_BASE` in `tools/seo.py`) because the main domain still serves the old
site; after the cutover set `IMAGE_BASE = SITE`, run `tools/seo.py`, and
update the image URLs in `sitemap.xml`. Do not submit the `.vercel.app` URL
to Search Console.

**The repo is public** and contains clinical patient photographs. They are
already published on the client's live sites, so nothing new is exposed, but a
public repo makes them bulk-downloadable in a way the gated site does not.
Worth a conversation with the client.

## 7. Access you will need

Nothing in this repo is tied to any particular Claude account — it is ordinary
files, git and a Vercel project. To continue you need:

- **GitHub** — push access to `dsignedbyharish/dr-shanker-website`
- **Vercel** — the account the project is linked to, for deploys and the domain
- **Domain registrar** — only when pointing the live domain at Vercel

> **Recurring gotcha on this machine.** Git authenticates to GitHub through the
> macOS keychain (`credential.helper = osxkeychain`). Something — an automated
> tool session — periodically writes per-host helpers into `~/.gitconfig`
> pointing at a `gh` binary inside a temporary directory that later gets
> deleted:
>
> ```
> credential.https://github.com.helper = !/private/tmp/.../gh_2.96.0_macOS_arm64/bin/gh auth git-credential
> ```
>
> These shadow `osxkeychain`, so **every** GitHub push from **any** repo on this
> machine fails with `could not read Username`. It has come back at least twice.
> When it does:
>
> ```bash
> git config --show-origin --get-regexp '^credential'
> git config --global --unset-all "credential.https://github.com.helper"
> git config --global --unset-all "credential.https://gist.github.com.helper"
> ```

## 8. Suggested next steps

1. **Point dentalmadurai.com at Vercel** (§9). Everything in search is
   waiting on this: until it moves, Google keeps ranking the old Apache site.
2. **Claim the Google Business Profile** ("Shankar Mohan Dental & Craniofacial
   Center", currently unclaimed, 4.3 stars from 24 reviews). Then set its
   website to https://dentalmadurai.com, make its hours match the site (it
   says 4:30pm evenings and 10am Sundays; the site says 4pm and 9:30am, so
   the clinic must confirm which is right), fix its Tamil name, add photos,
   and ask happy patients for reviews. For local searches this matters as
   much as the website itself.
3. Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools
   once the domain is live.
4. Renew `shankerdentalcentremadurai.com` before **17 Dec 2026** so its
   redirect keeps working (dentalmadurai.com runs to Feb 2027).
5. Decide whether the repo should be private.

## 9. Domain cutover

**dentalmadurai.com is the primary domain** (chosen October 2026: a short,
exact-match name for "dental Madurai"). `shankerdentalcentremadurai.com`, the
other mirror, should 301 to it, so the two old sites' rankings consolidate on
one address instead of splitting.

Both domains are registered with Good Domain Registry and use HostingRaja's
nameservers (`ns155/ns156.hostingraja.org`), where the old Apache site lives
at `103.92.235.55`. **Mail:** both domains' MX record points at the bare
domain itself, so moving the bare domain's `A` record would also move mail.
The old sites only ever listed Gmail addresses, but if anyone uses an
`@dentalmadurai.com` mailbox, first point MX at `mail.dentalmadurai.com`
(which already resolves to `103.92.235.55`) and wait an hour.

All four hostnames are added to the Vercel project first, so they show
"Invalid configuration" until DNS changes. That order is deliberate: if DNS
points at Vercel before the project claims the domain, patients get a Vercel
error page.

1. **A day ahead**, drop the TTL on the existing records to 300s, so a
   rollback takes minutes. Keep a copy of the old values.
2. **In HostingRaja's DNS zone editor** (keep their nameservers), for both
   domains:
   - `A` record for the bare domain (`@`): `76.76.21.21`
   - `CNAME` for `www`: `cname.vercel-dns.com`
   If Vercel's domain page shows different values, use those.
3. **Wait for the certificates.** Vercel issues SSL once each name resolves.
   Check the domains page shows all four as valid, not just that a page loads.
4. **Verify:** `curl -sI https://dentalmadurai.com/` shows a Vercel header,
   not `Server: Apache`; `www.dentalmadurai.com` and both
   `shankerdentalcentremadurai.com` names answer with a redirect to
   `https://dentalmadurai.com`; an old URL such as `/staff_details.html` lands
   on `/doctors.html`.
5. **Then** set `IMAGE_BASE = SITE` in `tools/seo.py`, re-run it, update the
   image URLs in `sitemap.xml`, push, and submit the sitemap in Search Console.
6. **Leave the old hosting running** for a few weeks as the fallback; it also
   holds the only full-size copies of the old originals (§6).

## 10. Case of the Month and the admin panel

### How the archive is built

`data/cases.json` is the source of truth: one entry per case with its month,
year, English and Tamil titles, topic, page images and card image. The
archive on `case-of-the-month.html` and the "Latest cases" list on
`index.html` are **generated** into the blocks between
`<!-- cases:archive:start -->` / `<!-- cases:latest:start -->` and their
`:end` markers. Never hand-edit inside those markers.

| File | Role |
|---|---|
| `api/_lib/cases.js` | The one renderer and validator, shared by everything below |
| `tools/build-cases.js` | Re-renders the blocks after a hand edit to the JSON (`--check` reports drift; `check.py` runs it) |
| `api/admin/*.js` | The admin API (Vercel functions) |
| `admin/index.html`, `assets/{css,js}/admin.*` | The admin panel |
| `tools/dev-server.js` | Local server that runs the same API with local storage |

The archive shows newest first, grouped by year, filterable by topic
(`?topic=trauma` is shareable), and each case can be linked directly
(`case-of-the-month.html#case-<id>`). The homepage list links there. The
homepage never shows clinical images, only titles, per §5.

Cards show a 4:3 crop of page 1 starting just under the letterhead
(`cropY`, 0.165 of the page height by default). Multi-page cases open as one
item in the viewer and page through before moving to the next case.

### How publishing works

The clinic signs in at `/admin/`, drops in the month's PDF (or a JPG/PNG),
fills in month, year, title, optional Tamil title and topic, and presses
Publish. The browser renders the PDF to 1236px-wide pages with pdf.js (WebP
where the browser can encode it, JPEG otherwise)
(loaded from jsDelivr, pinned to 6.3.289), so the server only ever receives
images. The API validates them, names each file by its content hash (so a
replaced document always gets a new URL under the year-long `/assets` cache)
and makes **one commit** to `main` through the GitHub API containing the
images, `data/cases.json`, the regenerated pages and the sitemap date. Vercel
deploys that commit like any push, so a case is live about a minute later
and every change can be reverted in git.

Editing a case (title, topic, month, re-crop, replace the document) and
Hide/Show work the same way. Nothing is ever deleted: hidden cases stay in
the JSON with `"published": false`.

### Setting it up on Vercel (one time)

In the Vercel project, **Settings, Environment Variables**, Production:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | The password the clinic signs in with. 8 characters or more. |
| `GITHUB_TOKEN` | A GitHub **fine-grained** personal access token, repository access limited to `dsignedbyharish/dr-shanker-website`, permission **Contents: Read and write**. Nothing else. (A token follows its repo through a rename.) |
| `ADMIN_SESSION_SECRET` | Optional. Any long random string. If unset, sessions are signed with a key derived from the password, so changing the password signs everyone out anyway. |
| `GITHUB_REPO`, `GITHUB_BRANCH` | Optional. Default to the repo above and `main`. |

Redeploy after adding them. Until they exist the panel says so instead of
failing. Fine-grained tokens expire: when the panel reports that GitHub
refused the request, issue a new token and replace `GITHUB_TOKEN`.

### Security notes

- One shared password, exchanged for an HttpOnly, SameSite=Strict, signed
  session cookie scoped to `/api/admin` (8 hours). Wrong passwords wait
  700ms. Every write also needs an `X-Admin-Request` header, which a
  cross-site page cannot send.
- `/admin/` has its own Content-Security-Policy in `vercel.json`, is
  `noindex`, and is disallowed in `robots.txt`.
- The repo is public, so anything published is public in git too, exactly
  like the 44 existing posters (§6).

### Testing locally

`node tools/dev-server.js`, then `http://localhost:8791/admin/` with the
password `shanker-local` (or `ADMIN_PASSWORD` if you set one). Storage is
local: publishing writes straight into this checkout, which you can inspect
with `git diff` and throw away with `git checkout -- <files>` (only after
checking `git status` for work of your own).

### Traps found while building it

- **`[data-year]` is taken.** `main.js` fills every `[data-year]` element
  with the current year for the footer copyright. The archive's year groups
  once used that attribute and were wiped to "2026". They use
  `data-case-year`.
- **pdf.js 5+:** the document proxy has no `destroy()`; the loading task
  does. And render with `intent: 'print'`: the default display intent paces
  itself on `requestAnimationFrame`, which stops in a background tab.
- **`behavior: 'auto'` is not instant** when the page has CSS
  `scroll-behavior: smooth`. Use `'instant'` to really jump.

## 11. Tamil

**The Tamil version is live** (switched on 2 October 2026). The top-bar toggle
switches every page, the case archive and the admin's Tamil title field.

It is controlled by one switch that exists in two places, which must match:

- `TAMIL_LIVE` in `assets/js/i18n.js` (what visitors get), and
- `TAMIL_LIVE` in `api/_lib/cases.js` (generated pages and the admin).

Every visible string is a key in `assets/js/i18n-data.js` (636 entries).
After changing page text, run `python3 tools/i18n_audit.py`: it lists any
English that would show untranslated in Tamil mode. Glossary used throughout:
case = நிகழ்வு, cleft = பிளவு, implant = உள்வைப்பு, craniofacial = மண்டை-முக,
syndrome = நோய்க்குறி; the clinic name follows its letterhead,
ஷங்கர் டென்டல் & க்ரேனியோஃபேஷியல் சென்டர்.

## 12. Motion and interaction added in this pass

- Page-to-page cross-fades (CSS `@view-transition`; the header is its own
  layer and stays put). Off under reduced motion; unsupported browsers
  navigate normally.
- On phones and tablets the header slides away while reading down and
  returns on any scroll up. It publishes its current height as
  `--header-h`, which the sticky case filter and page index use.
- Treatment pages with three or more sections get a sticky "On this page"
  index built from their own headings, marking the section being read.
- The mobile menu's items enter in sequence.
- Fixed along the way: back-to-top sat on the phone call bar (a media query
  placed before the base rule it was meant to override), the menu button
  overflowed the header on 320px phones and in Tamil, and the Tamil "NABH"
  stat was clipped.

## 13. Search, AI answers and sharing (October 2026)

- **`tools/seo.py`** writes every page's `<title>`, description, canonical,
  Open Graph and Twitter tags, icons and one schema.org `@graph`: the clinic
  as `Dentist` + `MedicalClinic` (address, map pin, hours, phones, services,
  Google Business Profile in `sameAs`), both doctors as `Person` with their
  credentials, `MedicalWebPage` + `MedicalProcedure` on treatment pages
  (reviewed by the treating consultant), `BreadcrumbList` read from each
  page's breadcrumb, and `FAQPage` read from its FAQ section. `check.py`
  fails if any head is out of date.
- **FAQ sections** on the homepage (8) and every treatment page (3 each)
  answer the questions patients actually type into Google or ask an AI
  assistant. Every answer restates facts already on the site; nothing is
  invented. They sit outside the 18+ consent gate (no images), in English
  and Tamil.
- **`llms.txt`** is a plain summary of the clinic for AI assistants;
  `robots.txt` explicitly welcomes the main search and AI crawlers and keeps
  them out of `/admin` and `/api`.
- **`sitemap.xml`** lists every page with image entries for the non-clinical
  photos. The admin bumps the case archive and home `lastmod` on publish, so
  keep `<lastmod>` directly after `<loc>`.
- **Share cards** are rendered from an HTML template with headless Chrome
  (1200x630 JPEG). To change one, re-render it under a new filename (the
  `/assets` cache lasts a year) rather than editing the image.
- **Performance:** images are WebP, fonts are self-hosted (no Google Fonts
  request; Inter and Source Serif are preloaded), and the hero portrait went
  from 505 KB to 68 KB.
- **Name variants.** Google lists the clinic as "Shankar Mohan Dental &
  Craniofacial Center"; the schema carries that and the other spellings
  patients search for as `alternateName`, so search engines treat them as one
  place.
