# Developer handoff — Shanker Dental & Craniofacial Centre

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
| Repo | `dsignedbyharish/Shankar-Dental-Hospital` |
| Live (preview host) | https://shankar-dental-hospital.vercel.app |
| `main` | deployed, stable — everything described here is on it |
| Open branches | none — `redesign-sections` is merged and deleted |
| Pages | 16 |
| Assets | ~152 images + 44 gallery thumbnails, ~38 MB |

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

**The social preview image is the building, not a clinical photo.** Every
page's `og:image` is the hospital exterior, including on the surgical treatment
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

**Image resolution is the ceiling on visual quality.** These are the largest
sources that exist:

| Asset | Native size | Used for |
|---|---|---|
| `staffimg1.jpg` (Dr Shanker) | **238 × 203** | hero portrait, doctors page |
| `staffimg2.jpg` (Dr Aijitha) | 237 × 206 | doctors page |
| `Shankar-Hospital.jpg` | 335 × 496 | hero background |

The hero portrait is framed at 268px rather than upscaled, and the hero
backdrop carries a deliberate blur so the upscale reads as depth of field.
**Ask the client for professional photography** — it is the single highest-value
improvement available and no amount of CSS substitutes for it.

**Originals were downscaled.** Images over 1600px were resized in place before
the first commit, so git history holds the reduced versions only. The true
originals still exist on the two live source sites if ever needed.

**`sitemap.xml`, `robots.txt` and the homepage `canonical` all point at
`https://www.shankerdentalcentremadurai.com/`** — correct once the domain is
pointed at Vercel, wrong until then. Do not submit the `.vercel.app` URL to
Search Console while the canonical says otherwise.

**The repo is public** and contains clinical patient photographs. They are
already published on the client's live sites, so nothing new is exposed, but a
public repo makes them bulk-downloadable in a way the gated site does not.
Worth a conversation with the client.

## 7. Access you will need

Nothing in this repo is tied to any particular Claude account — it is ordinary
files, git and a Vercel project. To continue you need:

- **GitHub** — push access to `dsignedbyharish/Shankar-Dental-Hospital`
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

1. **Point the real domain at Vercel.** Everything else is waiting on this.
   The canonicals, `sitemap.xml`, `robots.txt` and every `og:` URL already name
   `shankerdentalcentremadurai.com`, while that domain still serves the old
   site from Apache. Until it moves, the new site earns nothing.
2. Request professional photography of both consultants and the premises.
   Also replace the `og:image`: it is currently the 335×496 hospital exterior,
   well under the 1200×630 that social cards want, so shared links render a
   small, soft thumbnail.
3. Decide whether the repo should be private.
4. Consider WebP/AVIF versions of the gallery images — currently JPEG only.

## 9. Domain cutover

The Vercel project has **no custom domain attached** — its domain list is only
the three generated `*.vercel.app` names. So going live is two steps, and the
order is not optional:

> **Add the domain in Vercel *before* changing DNS.** If DNS points at Vercel
> while the project does not claim the domain, Vercel serves an error page on
> the practice's live address. That is worse than the old site, and patients
> see it. The reverse order is safe.

1. **A day ahead**, drop the TTL on the existing records at the registrar to
   300s. Rollback is then minutes rather than hours.
2. **In Vercel**, add both `www.shankerdentalcentremadurai.com` and the apex
   `shankerdentalcentremadurai.com`. Vercel prints the records to create.
   Nothing changes for visitors yet — the domain simply isn't resolving there.
3. **At the registrar**, replace the Apache records with Vercel's. Keep a copy
   of the old values first; they are the rollback.
4. **Wait for the certificate.** Vercel issues SSL after the domain resolves.
   Until it does, HTTPS fails — check the domain in Vercel shows valid, not
   just that the page loads.
5. **Verify** the real domain serves the new site, and that `www` and apex
   agree. `curl -sI https://www.shankerdentalcentremadurai.com/` should show a
   Vercel header rather than `Server: Apache`.
6. **Only then** submit `sitemap.xml` to Search Console. Submitting while the
   canonical names a domain that isn't serving the site wastes the crawl.
7. **Leave the old Apache hosting running** until step 5 passes. It is the
   fallback, and the only remaining copy of the true full-size originals
   (see §6).

**Point `dentalmadurai.com` at the new site too — as a 301, not a copy.** It is
the second of the two mirrored domains. Every canonical names
`shankerdentalcentremadurai.com`, so `dentalmadurai.com` should redirect there
rather than serve the same pages, otherwise the duplicate-content split that
this rebuild set out to fix simply survives at the domain level.

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
Publish. The browser renders the PDF to 1236px-wide JPEG pages with pdf.js
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
| `GITHUB_TOKEN` | A GitHub **fine-grained** personal access token, repository access limited to `dsignedbyharish/Shankar-Dental-Hospital`, permission **Contents: Read and write**. Nothing else. |
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

Tamil is **on**: `TAMIL_LIVE = true` in both `assets/js/i18n.js` and
`api/_lib/cases.js` (they must match). Setting both to `false` turns the
toggle back into a "Soon" note, hides the admin's Tamil title field and
stops generated pages carrying Tamil; run `node tools/build-cases.js` and
`python3 tools/bump_assets.py` after changing them.

The toggle and dictionary are described at the top of `assets/js/i18n.js`.
What changed and why:

- **The dictionary loads only when Tamil is in use.** It is 300 KB (64 KB
  gzipped) and English visitors never download it. A returning Tamil reader
  gets `lang-ta` from the inline `<head>` script before first paint, so text
  waits hidden instead of flashing English (i18n.css shows it after 2s
  regardless).
- **Generated content carries its own Tamil** in `data-ta`, so new cases
  never need dictionary entries.
- **`tools/i18n_audit.py`** lists English text with no Tamil entry, unused
  entries, and Latin letters stuck to Tamil ones. Run it after changing any
  page text: an edited English sentence silently loses its translation,
  because the English text is the lookup key.
- Citations on the doctors page (paper and talk titles, journals, degrees)
  are deliberately English. Their entries map to themselves.

**Terminology, fixed across all 561 entries.** Keep to these:

| English | Tamil | Not |
|---|---|---|
| clinical case | நிகழ்வு | வழக்கு (a legal case) |
| cleft | பிளவு (அண்ணப் பிளவு) | வெடிப்பு (a crack) |
| implant | உள்வைப்பு | பொருத்து (a fitting) |
| craniofacial | மண்டை-முக | முக எலும்பியல் |
| syndrome | நோய்க்குறி | நோய்க்குழு |
| trachea | மூச்சுக்குழாய் | தொண்டைக் குழாய் |
| the practice's name | ஷங்கர் டென்டல் & க்ரேனியோஃபேஷியல் சென்டர் (as on the clinic's own letterhead) | a translation |

Tamil typography lives in `assets/css/i18n.css`: no letter-spacing or
uppercase on Tamil text (tracking breaks its letter clusters apart), smaller
and looser display headings, 13px minimum for small labels.

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
