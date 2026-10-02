# Dr Shanker Website

The website of Shanker Dental & Craniofacial Centre, Madurai, in English and
Tamil. A static, dependency-free rebuild of the practice's two older sites
([dentalmadurai.com](https://dentalmadurai.com/) and
[shankerdentalcentremadurai.com](https://www.shankerdentalcentremadurai.com/)), which were mirrors of
each other. All copy and imagery is taken from those sites.

- Primary domain: **https://dentalmadurai.com** (every canonical points here;
  `shankerdentalcentremadurai.com` is to 301 to it, see HANDOFF.md §9)
- Live preview: https://dr-shanker-website.vercel.app
- Repo: `dsignedbyharish/dr-shanker-website`, Vercel project `dr-shanker-website`

## Structure

```
index.html                                 Home
doctors.html                               Meet the Doctors (+ references, papers, courses)
facilities.html                            Facilities — outpatient, imaging, in-patient
treatments.html                            Treatment Options hub
  maxillofacial-surgery.html
  craniofacial-surgery.html
  orthognathic-surgery.html                (was facial-deformity-correction-surgery.html)
  facial-trauma-surgery.html
  cleft-lip-and-palate-surgery.html
  tmj-surgery.html                         (was temporomandibular-surgery.html)
  oral-and-maxillofacial-pathology.html
  orthodontics.html                        (was orthodontics-madurai.html)
  dental-and-facial-implants.html
case-of-the-month.html                     Case archive, generated from data/cases.json
admin/                                     Case archive admin panel (noindex)
api/                                       Admin API (Vercel functions)
data/cases.json                            Every case: dates, titles, topic, images
contact.html                               Address, hours, map
sitemap.html                               Human-readable sitemap

assets/css/style.css                       Single stylesheet (design tokens at the top)
assets/js/main.js                          Nav, accordions, consent gate, lightbox
assets/images/                             All imagery; thumbs/ holds gallery previews
assets/fonts/                              Self-hosted web fonts (fonts.css declares them)
assets/images/og/                          1200x630 share cards, one per page
sitemap.xml, robots.txt, llms.txt          Search engines and AI assistants
site.webmanifest, favicon.ico              App icons (assets/icon-*.png)
vercel.json                                Redirects from the old site, headers
```

No build step and no framework — edit the HTML directly and refresh.

## Local preview

```bash
python3 -m http.server 8787
```

Then open <http://localhost:8787>.

## Tooling

There is no build step: the HTML is the source. These keep it honest:

```bash
node tools/dev-server.js       # local preview on :8791, with the admin panel working
python3 tools/check.py         # pre-deploy validation; exits non-zero on any problem
python3 tools/bump_assets.py   # re-stamp ?v= hashes after any CSS/JS edit
python3 tools/sync_chrome.py   # push header/nav/footer from index.html to all pages
python3 tools/i18n_audit.py    # language toggle: untranslated and unused entries
python3 tools/seo.py           # titles, descriptions, share cards, structured data
node tools/build-cases.js      # rebuild the case archive after editing data/cases.json
```

## Case of the Month admin

The clinic adds each month's case at `/admin/`: upload the PDF, add the
title (and optionally the Tamil title) and topic, publish. It commits to this
repo and the site updates in about a minute. Setup and internals are in
HANDOFF.md §10.

The shared chrome is duplicated across all 16 pages, so edit it in `index.html`
and run `sync_chrome.py` rather than hand-editing sixteen files. Run `check.py`
before every push.

New developers should read **[HANDOFF.md](HANDOFF.md)** — it covers project
state, the decisions worth not undoing, and the known constraints.

## Design system

Every value in `assets/css/style.css` comes from a token declared in `:root`. If you need a
number that isn't there, add it to the scale rather than hard-coding it in a component.

| Scale | Tokens |
|---|---|
| Spacing | `--sp-1`…`--sp-16` on a 4pt grid |
| Type | `--fs-2xs`…`--fs-3xl`, plus `--lh-*` and `--fw-*` |
| Radius | `--r-xs` … `--r-xl`, `--r-full` |
| Z-index | `--z-raised` 10 · `--z-sticky` 100 · `--z-drawer` 200 · `--z-modal` 300 · `--z-skip` 400 |
| Motion | `--dur-press` 80ms · `--dur-fast` 150 · `--dur-base` 220 · `--dur-exit` 140 · `--dur-slow` 320 · `--dur-reveal` 520 |
| Easing | `--ease-out` (enter) · `--ease-in` (exit) · `--ease-spring` (playful) |
| Touch | `--tap` 44px |

There are no inline styles in any page — layout tweaks use the utility classes
(`.measure`, `.mt-*`, `.actions-row`, …) so spacing stays on the scale.

## Accessibility

- Contrast: every foreground/background pair passes WCAG AA (verified in-browser, 0 failures).
- Touch: all controls reach 44px on coarse pointers and phone-width viewports.
- Keyboard: focus is trapped in the menu drawer and the image viewer, and returned to
  whatever opened them; `Esc` closes both; a visible 3px focus ring switches to white on
  dark surfaces.
- Structure: one `h1` per page, no skipped heading levels, breadcrumbs marked up as
  `<nav><ol>`, current page flagged with `aria-current="page"` and shown with an underline
  rather than colour alone.
- Motion: `prefers-reduced-motion` disables the scroll reveal, stagger, hover lifts and
  smooth scrolling. Content is never hidden behind an animation that may not run.
- Images: every `<img>` declares width/height, so there is no layout shift.

## Notes

- **Consent gate.** Treatment pages and the case archive show the 18+ clinical-imagery
  disclaimer the original site used, before any surgical photograph. Consent is remembered
  for the browser session only. If JavaScript is unavailable the content is shown rather
  than locked behind a button that could never be clicked.
- **Old URLs.** `vercel.json` 301-redirects every page name from the previous site to its
  new equivalent, so existing search rankings and inbound links are preserved.
- **Images.** Served as WebP (about 55% smaller than the JPEGs they replaced; every
  browser in use supports it). Originals larger than 1600px were downscaled, and the case
  archive grid uses small card crops with the full poster in the lightbox. Share cards in
  `assets/images/og/` stay JPEG, which every messaging app previews.
- **SEO.** `tools/seo.py` owns each page's title, description, share tags and schema.org
  data (clinic, doctors, procedures, breadcrumbs, FAQs). Edit the table there, never the
  `<!-- seo:start -->` block in a page. HANDOFF.md §13 has the full picture.

## Deploying

See the deploy steps in the project handover, or:

```bash
npx vercel --prod
```
