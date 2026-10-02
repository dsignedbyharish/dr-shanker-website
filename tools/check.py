#!/usr/bin/env python3
"""Static pre-deploy checks for the whole site.

Catches the things that have actually broken this project before: dead links,
missing images, filename-case mismatches that only fail on Linux, heading-level
skips, images without alt text or dimensions, and inline styles creeping back
in. Exits non-zero if anything fails, so it can gate a deploy.

    python3 tools/check.py
"""
import glob, os, re, sys
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# The live domain, which every canonical and og: URL must be absolute against.
# Change this in one place if the domain ever changes.
CANON_BASE = "https://dentalmadurai.com/"

# Exact-case index of every file. macOS is case-insensitive but the production
# host is not, so `IP-rooms.JPG` referenced as `.jpg` passes locally and 404s
# once deployed. This is why we compare case-sensitively.
FILES = set()
for base, dirs, names in os.walk("."):
    if ".git" in base:
        continue
    for n in names:
        FILES.add(os.path.normpath(os.path.join(base, n)))

problems = []


def fail(page, kind, detail=""):
    problems.append((page, kind, detail))


for path in sorted(glob.glob("*.html")):
    html = open(path, encoding="utf-8").read()
    body = html[html.find("<body"):]

    # --- structure -------------------------------------------------------
    levels = [int(m) for m in re.findall(r"<h([1-6])[\s>]", body)]
    if levels.count(1) != 1:
        fail(path, "h1 count", str(levels.count(1)))
    prev = 0
    for lv in levels:
        if prev and lv > prev + 1:
            fail(path, "heading skip", "h%d -> h%d" % (prev, lv))
        prev = lv

    if 'lang="en"' not in html:
        fail(path, "missing lang")
    if "width=device-width" not in html:
        fail(path, "missing viewport")
    if "user-scalable=no" in html or "maximum-scale" in html:
        fail(path, "zoom disabled")
    if 'aria-current="page"' not in body and path != "sitemap.html":
        fail(path, "no current nav item")

    # --- images ----------------------------------------------------------
    for tag in re.findall(r"<img[^>]*>", body):
        if "alt=" not in tag:
            fail(path, "img without alt", tag[:70])
        # the lightbox <img src=""> is filled in at runtime
        if "width=" not in tag and 'src=""' not in tag:
            fail(path, "img without dimensions", tag[:70])

    # --- house style -----------------------------------------------------
    if 'style="' in body:
        fail(path, "inline style", "use a utility class instead")
    for tag in re.findall(r"<button[^>]*>", body):
        if "type=" not in tag:
            fail(path, "button without type", tag[:60])

    # --- discoverability -------------------------------------------------
    # A canonical pointing at the wrong page is silent: nothing looks broken,
    # the page just stops ranking. Copying a <head> between pages and missing
    # this one line is the easy way to cause it, so the URL is checked against
    # the filename rather than merely being present.
    head = html[: html.find("<body")]
    canons = re.findall(r'<link rel="canonical" href="([^"]*)"', head)
    expected = CANON_BASE if path == "index.html" else CANON_BASE + path
    if len(canons) != 1:
        fail(path, "canonical count", str(len(canons)))
    elif canons[0] != expected:
        fail(path, "wrong canonical", "%s != %s" % (canons[0], expected))

    og = dict(re.findall(r'<meta property="og:([\w:]+)" content="([^"]*)"', head))
    for key in ("title", "description", "url", "image"):
        if key not in og:
            fail(path, "missing og:" + key)
    # Relative og:image and og:url do not resolve — the card renders blank.
    for key in ("url", "image"):
        if key in og and not og[key].startswith("https://"):
            fail(path, "relative og:" + key, og[key])
    if "url" in og and canons and og["url"] != canons[0]:
        fail(path, "og:url != canonical", og["url"])

    # --- references ------------------------------------------------------
    for src in re.findall(r'(?:src|data-lb)="([^"]+)"', html):
        if src.startswith(("http", "data:")) or src == "":
            continue
        if os.path.normpath(unquote(urlparse(src).path)) not in FILES:
            fail(path, "missing asset", src)
    for href in re.findall(r'href="([^"]+)"', html):
        if href.startswith(("http", "mailto:", "tel:", "#")):
            continue
        target = urlparse(href).path
        if target and os.path.normpath(unquote(target)) not in FILES:
            fail(path, "dead link", href)

# --- asset versioning ----------------------------------------------------
# /assets/* is served immutable for a year (see vercel.json), so every CSS and
# JS URL must carry a version that matches the file's current contents, or
# returning visitors keep stale files forever. The Tamil files once shipped
# with no version at all, which meant no translation fix could ever reach
# anyone who had visited before. tools/bump_assets.py fixes what this finds.
import hashlib
for path in sorted(glob.glob("*.html") + glob.glob("admin/*.html")):
    html = open(path, encoding="utf-8").read()
    for m in re.finditer(r'((?:\.\./)?assets/(?:css|js)/[\w.-]+\.(?:css|js))(\?v=([0-9a-f]*))?(?=")', html):
        ref, version = m.group(1), m.group(3)
        with open(os.path.normpath(ref.replace("../", "")), "rb") as f:
            want = hashlib.sha256(f.read()).hexdigest()[:8]
        if not version:
            fail(path, "unversioned asset", ref)
        elif version != want:
            fail(path, "stale asset version", "%s (run tools/bump_assets.py)" % ref)

# --- generated SEO metadata ------------------------------------------------
# Titles, descriptions, share cards and structured data come from tools/seo.py.
# A hand edit inside a head's seo block, or new FAQ text without a re-run,
# leaves the structured data describing something the page no longer says.
import subprocess
r = subprocess.run([sys.executable, "tools/seo.py", "--check"], capture_output=True, text=True)
if r.returncode != 0:
    fail("(all pages)", "seo out of date", (r.stdout or r.stderr).strip())

# --- generated case archive -------------------------------------------------
# The Case of the Month blocks are rendered from data/cases.json. A hand edit
# to the HTML, or a JSON edit without a rebuild, makes the two disagree.
import subprocess
try:
    r = subprocess.run(["node", "tools/build-cases.js", "--check"], capture_output=True, text=True)
    if r.returncode != 0:
        fail("case-of-the-month.html", "cases out of date", (r.stderr or r.stdout).strip())
except FileNotFoundError:
    print("note: node not found, skipped the case archive check")

pages = len(glob.glob("*.html"))
if problems:
    print("FAIL — %d problem(s) across %d pages\n" % (len(problems), pages))
    for page, kind, detail in problems:
        print("  %-38s %-24s %s" % (page, kind, detail))
    sys.exit(1)

print("OK — %d pages, %d files indexed, no problems found." % (pages, len(FILES)))
