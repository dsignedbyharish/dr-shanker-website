#!/usr/bin/env python3
"""Writes every page's search, social and structured-data metadata.

One source for the titles, descriptions, share cards and schema.org data, so
the 16 heads cannot drift apart. The block between <!-- seo:start --> and
<!-- seo:end --> in each <head> is generated; the <title> and description are
rewritten in place. Breadcrumbs and FAQ answers are read from the page itself,
so the structured data always matches what visitors see.

    python3 tools/seo.py            # rewrite every page
    python3 tools/seo.py --check    # exit 1 if any page is out of date
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# The live domain. Canonicals, og:url and schema @ids are absolute against it.
SITE = "https://dentalmadurai.com"
# Where share images and schema images are fetched from. Until dentalmadurai.com
# points at Vercel it still serves the old site, so a share card on the main
# domain would 404 on WhatsApp. Set this to SITE after the DNS cutover
# (HANDOFF.md, "Domain cutover") and re-run this script.
IMAGE_BASE = "https://dr-shanker-website.vercel.app"
REVIEWED = "2026-10-02"

NAME = "Shanker Dental & Craniofacial Centre"
CLINIC_ID = SITE + "/#clinic"
SITE_ID = SITE + "/#website"
DR_SHANKER = SITE + "/doctors.html#dr-shanker-mohan"
DR_AIJITHA = SITE + "/doctors.html#dr-aijitha-shanker"
# The clinic's Google Business Profile (listed there as "Shankar Mohan Dental &
# Craniofacial Center"). Linking it lets search engines join the two up.
GBP = "https://maps.google.com/?cid=3733348255092878235"

TREATMENTS = [
    ("Oral and maxillofacial surgery", "maxillofacial-surgery.html"),
    ("Craniofacial surgery", "craniofacial-surgery.html"),
    ("Orthognathic (corrective jaw) surgery", "orthognathic-surgery.html"),
    ("Facial trauma surgery", "facial-trauma-surgery.html"),
    ("Cleft lip and palate surgery", "cleft-lip-and-palate-surgery.html"),
    ("TMJ (jaw joint) surgery", "tmj-surgery.html"),
    ("Oral and maxillofacial pathology", "oral-and-maxillofacial-pathology.html"),
    ("Orthodontics, braces and Invisalign", "orthodontics.html"),
    ("Dental and zygoma implants", "dental-and-facial-implants.html"),
]

# kind: the schema.org page type. proc: the procedure a treatment page is about.
PAGES = {
    "index.html": dict(
        title="Dental Hospital in Madurai | Shanker Dental & Craniofacial Centre",
        desc="Dental and maxillofacial hospital in Gandhi Nagar, Madurai: implants, braces, Invisalign, jaw, cleft and facial surgery by specialist consultants. Call +91 91599 99362.",
        og_title="Shanker Dental & Craniofacial Centre, Madurai",
        og="home", og_alt="Dr Shanker Mohan, Shanker Dental and Craniofacial Centre, Madurai",
        kind="WebPage", geo=True),
    "doctors.html": dict(
        title="Dr Shanker Mohan & Dr Aijitha Shanker | Specialists in Madurai",
        desc="Dr Shanker Mohan (MDS, FDSRCS, FFDRCS), maxillofacial surgeon trained in London and Dublin, and orthodontist Dr Aijitha Shanker (MDS), Invisalign provider, Madurai.",
        og="doctors", og_alt="Dr Shanker Mohan and Dr Aijitha Shanker", kind="AboutPage"),
    "treatments.html": dict(
        title="Dental & Facial Surgery Treatments in Madurai | Shanker Dental",
        desc="Every treatment at Shanker Dental & Craniofacial Centre, Madurai: maxillofacial, craniofacial, jaw, trauma, cleft, TMJ and tumour surgery, braces, Invisalign and implants.",
        og="treatments", og_alt="Treatments at Shanker Dental and Craniofacial Centre", kind="CollectionPage"),
    "facilities.html": dict(
        title="Hospital Facilities in Madurai | Shanker Dental & Craniofacial Centre",
        desc="A 7,500 sq ft purpose-built centre in Madurai with digital OPG and cephalometry, integrated operating theatres and air-conditioned in-patient rooms.",
        og="facilities", og_alt="Dental operating suite at Shanker Dental and Craniofacial Centre", kind="WebPage"),
    "contact.html": dict(
        title="Contact & Directions | Shanker Dental Centre, Gandhi Nagar, Madurai",
        desc="17/33 Rajaji Street, Gandhi Nagar, Madurai 625020, near Anna Bus Stand. Open Mon-Sat 9:30am-1pm and 4pm-8pm, Sun 9:30am-1pm. Call +91 91599 99362.",
        og="contact", og_alt="Outpatient waiting area at Shanker Dental and Craniofacial Centre", kind="ContactPage", geo=True),
    "case-of-the-month.html": dict(
        title="Case of the Month: Maxillofacial Case Archive | Shanker Dental Madurai",
        desc="Interesting maxillofacial, jaw, trauma and cleft cases treated at Shanker Dental & Craniofacial Centre, Madurai, documented every month since 2020.",
        og="case-of-the-month", og_alt="Interesting Case of the Month, Shanker Dental and Craniofacial Centre", kind="CollectionPage"),
    "sitemap.html": dict(
        title="Sitemap | Shanker Dental & Craniofacial Centre, Madurai",
        desc="Every page on the Shanker Dental & Craniofacial Centre website, Madurai: treatments, doctors, facilities, the case archive and contact details.",
        og="home", og_alt="Shanker Dental and Craniofacial Centre, Madurai", kind="WebPage"),
    "maxillofacial-surgery.html": dict(
        title="Oral & Maxillofacial Surgeon in Madurai | Shanker Dental Centre",
        desc="Oral and maxillofacial surgery in Madurai for the mouth, jaws, face and neck, led by Dr Shanker Mohan, trained at the Royal London Hospital and in Dublin.",
        og="maxillofacial-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Oral and maxillofacial surgery", ["Maxillofacial surgery", "Oral surgery"], "SurgicalProcedure")),
    "craniofacial-surgery.html": dict(
        title="Craniofacial Surgery in Madurai: Craniosynostosis | Shanker Dental",
        desc="Craniofacial surgery in Madurai for craniosynostosis, trigonocephaly and plagiocephaly: fronto-orbital advancement by a joint neurosurgical and maxillofacial team.",
        og="craniofacial-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Craniofacial surgery", ["Craniosynostosis surgery", "Fronto-orbital advancement"], "SurgicalProcedure")),
    "orthognathic-surgery.html": dict(
        title="Jaw Surgery (Orthognathic) in Madurai | Shanker Dental Centre",
        desc="Corrective jaw surgery in Madurai for protruding, short or uneven jaws: Le Fort I, BSSO and genioplasty, done from inside the mouth with no visible scars.",
        og="orthognathic-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Orthognathic surgery", ["Corrective jaw surgery", "Facial deformity correction", "Le Fort I osteotomy", "Bilateral sagittal split osteotomy", "Genioplasty"], "SurgicalProcedure")),
    "facial-trauma-surgery.html": dict(
        title="Facial Fracture & Trauma Surgery in Madurai | Shanker Dental",
        desc="Facial trauma surgery in Madurai: plating of jaw, cheekbone, nose and eye socket fractures after accidents, with micro and miniplates and 3D printed custom plates.",
        og="facial-trauma-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Facial trauma surgery", ["Facial fracture surgery", "Open reduction and internal fixation"], "SurgicalProcedure")),
    "cleft-lip-and-palate-surgery.html": dict(
        title="Cleft Lip & Palate Surgery in Madurai | Shanker Dental Centre",
        desc="Complete cleft lip and palate care in Madurai under one roof: lip and palate repair, alveolar bone grafting, orthodontics, jaw surgery and rhinoplasty.",
        og="cleft-lip-and-palate-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Cleft lip and palate surgery", ["Cleft lip repair", "Cleft palate repair", "Alveolar bone grafting"], "SurgicalProcedure")),
    "tmj-surgery.html": dict(
        title="TMJ Surgery for Jaw Locking (Ankylosis) in Madurai | Shanker Dental",
        desc="TMJ ankylosis surgery in Madurai for patients unable to open the mouth: gap arthroplasty, Esmarch's procedure and osteodistraction, with a difficult airway team.",
        og="tmj-surgery", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Temporomandibular joint surgery", ["TMJ ankylosis surgery", "Gap arthroplasty", "Esmarch procedure"], "SurgicalProcedure")),
    "oral-and-maxillofacial-pathology.html": dict(
        title="Jaw Tumour & Oral Pathology Surgery in Madurai | Shanker Dental",
        desc="Diagnosis and surgery for jaw cysts and tumours in Madurai, including ameloblastoma resection with fibula free flap reconstruction and giant cell granuloma.",
        og="oral-and-maxillofacial-pathology", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Surgery for jaw cysts and tumours", ["Oral and maxillofacial pathology", "Ameloblastoma resection", "Fibula free flap reconstruction"], "SurgicalProcedure")),
    "orthodontics.html": dict(
        title="Orthodontist in Madurai: Braces & Invisalign | Shanker Dental",
        desc="Braces and certified Invisalign clear aligners in Madurai for children and adults, by orthodontist Dr Aijitha Shanker (MDS), with jaw surgery when needed.",
        og="orthodontics", kind="MedicalWebPage", author=DR_AIJITHA,
        proc=("Orthodontic treatment", ["Braces", "Invisalign clear aligners", "Dentofacial orthopaedics"], "NoninvasiveProcedure")),
    "dental-and-facial-implants.html": dict(
        title="Dental Implants in Madurai: Zygoma Implants | Shanker Dental",
        desc="Dental implants in Madurai: single tooth, full mouth and zygoma implants for severe bone loss, with bone grafting and sinus lift, placed by a maxillofacial surgeon.",
        og="dental-and-facial-implants", kind="MedicalWebPage", author=DR_SHANKER,
        proc=("Dental implants", ["Zygoma implants", "Full mouth implants", "Bone grafting", "Sinus lift"], "SurgicalProcedure")),
}

BAD = re.compile("[‒–—―→⇒]")


def url(page):
    return SITE + "/" if page == "index.html" else SITE + "/" + page


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def clinic():
    hours = [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "opens": "09:30", "closes": "13:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "opens": "16:00", "closes": "20:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": "Sunday", "opens": "09:30", "closes": "13:00"},
    ]
    return {
        "@type": ["Dentist", "MedicalClinic"],
        "@id": CLINIC_ID,
        "name": NAME,
        "alternateName": ["Shankar Mohan Dental & Craniofacial Center", "Shanker Dental and Craniofacial Centre", "Shanker Dental Centre", "Shankar Mohan Dental Hospital", "Shankar Dental Hospital Madurai", "Dental Madurai"],
        "description": "A purpose-built multi-specialty centre in Madurai for oral and maxillofacial surgery, craniofacial surgery, orthodontics and dental implants, with out-patient and in-patient facilities.",
        "slogan": "Saving faces and changing lives",
        "url": SITE + "/",
        "logo": IMAGE_BASE + "/assets/icon-512.png",
        "image": [IMAGE_BASE + "/assets/images/og/home.jpg", IMAGE_BASE + "/assets/images/dental-operating-suite-hd.webp", IMAGE_BASE + "/assets/images/outpatient-waiting-area-1-hd.webp"],
        "telephone": "+91 91599 99362",
        "email": "orthomax@gmail.com",
        "contactPoint": [
            {"@type": "ContactPoint", "telephone": "+91 91599 99362", "contactType": "appointments", "areaServed": "IN", "availableLanguage": ["English", "Tamil"]},
            {"@type": "ContactPoint", "telephone": "+91 97884 73879", "contactType": "customer service", "areaServed": "IN", "availableLanguage": ["English", "Tamil"]},
        ],
        "address": {"@type": "PostalAddress", "streetAddress": "17/33 Rajaji Street, Gandhi Nagar", "addressLocality": "Madurai", "addressRegion": "Tamil Nadu", "postalCode": "625020", "addressCountry": "IN"},
        "geo": {"@type": "GeoCoordinates", "latitude": 9.923213, "longitude": 78.138549},
        "hasMap": GBP,
        "sameAs": [GBP, "https://www.google.com/search?kgmid=/g/1pw3y95h0"],
        "openingHoursSpecification": hours,
        "areaServed": [{"@type": "City", "name": "Madurai"}, {"@type": "State", "name": "Tamil Nadu"}],
        "medicalSpecialty": ["Dentistry", "Surgical"],
        "availableService": [{"@type": "MedicalProcedure", "name": n, "url": SITE + "/" + p} for n, p in TREATMENTS],
        "knowsLanguage": ["en", "ta"],
        "isAcceptingNewPatients": True,
        "employee": [{"@id": DR_SHANKER}, {"@id": DR_AIJITHA}],
    }


def doctors():
    return [
        {
            "@type": "Person", "@id": DR_SHANKER,
            "name": "Dr Shanker Mohan", "honorificPrefix": "Dr", "honorificSuffix": "MDS, AO/ASIF, FFDRCS, FDSRCS",
            "jobTitle": "Consultant Oral and Maxillofacial Surgeon",
            "description": "Oral and maxillofacial surgeon who trained at the Royal London Hospital, UK, and the National Maxillofacial Unit in Dublin, Ireland, with fellowships from the Royal College of Surgeons of England and Ireland.",
            "image": IMAGE_BASE + "/assets/images/dr-shanker-mohan-hd.webp",
            "url": SITE + "/doctors.html",
            "worksFor": {"@id": CLINIC_ID},
            "hasCredential": [
                {"@type": "EducationalOccupationalCredential", "credentialCategory": "degree", "name": "Master of Dental Surgery (MDS)"},
                {"@type": "EducationalOccupationalCredential", "credentialCategory": "fellowship", "name": "Fellowship in Dental Surgery (FDSRCS)", "recognizedBy": {"@type": "Organization", "name": "Royal College of Surgeons of England"}},
                {"@type": "EducationalOccupationalCredential", "credentialCategory": "fellowship", "name": "Fellowship in Oral Surgery (FFDRCS)", "recognizedBy": {"@type": "Organization", "name": "Royal College of Surgeons in Ireland"}},
            ],
            "knowsAbout": ["Oral and maxillofacial surgery", "Craniofacial surgery", "Orthognathic surgery", "Facial trauma", "Cleft lip and palate", "TMJ surgery", "Dental implants"],
        },
        {
            "@type": "Person", "@id": DR_AIJITHA,
            "name": "Dr Aijitha Shanker", "honorificPrefix": "Dr", "honorificSuffix": "BDS, MDS (Orthodontia)",
            "jobTitle": "Consultant Orthodontist",
            "description": "Specialist in orthodontics and dentofacial orthopaedics and a certified Invisalign provider, with a special interest in facial deformity and cleft lip and palate.",
            "image": IMAGE_BASE + "/assets/images/dr-aijitha-shanker-hd.webp",
            "url": SITE + "/doctors.html",
            "worksFor": {"@id": CLINIC_ID},
            "hasCredential": [
                {"@type": "EducationalOccupationalCredential", "credentialCategory": "degree", "name": "Bachelor of Dental Surgery (BDS)"},
                {"@type": "EducationalOccupationalCredential", "credentialCategory": "degree", "name": "Master of Dental Surgery in Orthodontics (MDS)"},
            ],
            "knowsAbout": ["Orthodontics", "Dentofacial orthopaedics", "Invisalign", "Cleft lip and palate"],
        },
    ]


def crumbs(page, body):
    m = re.search(r'<ol class="crumbs">(.*?)</ol>', body, re.S)
    if not m:
        return None
    items = []
    for li in re.findall(r"<li>(.*?)</li>", m.group(1), re.S):
        a = re.search(r'href="([^"]+)"', li)
        items.append((text(li), url(a.group(1)) if a else url(page)))
    return {
        "@type": "BreadcrumbList", "@id": url(page) + "#breadcrumb",
        "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)],
    }


def faq(page, body):
    qa = re.findall(r'<details class="faq-item">\s*<summary>(.*?)</summary>\s*<div class="faq-a">(.*?)</div>\s*</details>', body, re.S)
    if not qa:
        return None
    return {
        "@type": "FAQPage", "@id": url(page) + "#faq",
        "mainEntity": [{"@type": "Question", "name": text(q), "acceptedAnswer": {"@type": "Answer", "text": text(a)}} for q, a in qa],
    }


def graph(page, cfg, body):
    nodes = []
    webpage = {
        "@type": cfg["kind"], "@id": url(page) + "#webpage", "url": url(page),
        "name": cfg["title"], "description": cfg["desc"], "inLanguage": "en-IN",
        "isPartOf": {"@id": SITE_ID}, "about": {"@id": CLINIC_ID},
        "primaryImageOfPage": {"@type": "ImageObject", "url": IMAGE_BASE + "/assets/images/og/" + cfg["og"] + ".jpg", "width": 1200, "height": 630},
    }
    if page == "index.html":
        nodes.append({"@type": "WebSite", "@id": SITE_ID, "url": SITE + "/", "name": NAME, "alternateName": "Dental Madurai",
                      "inLanguage": ["en-IN", "ta-IN"], "publisher": {"@id": CLINIC_ID}})
    nodes.append(clinic())
    if page in ("index.html", "doctors.html"):
        nodes.extend(doctors())
    if cfg.get("proc"):
        name, alt, ptype = cfg["proc"]
        webpage["about"] = {"@type": "MedicalProcedure", "name": name, "alternateName": alt, "procedureType": ptype,
                            "url": url(page), "provider": {"@id": CLINIC_ID}}
        webpage["audience"] = {"@type": "MedicalAudience", "audienceType": "Patient"}
        webpage["lastReviewed"] = REVIEWED
        webpage["reviewedBy"] = {"@id": cfg["author"]}
        webpage["author"] = {"@id": cfg["author"]}
        webpage["publisher"] = {"@id": CLINIC_ID}
    bc = crumbs(page, body)
    if bc:
        webpage["breadcrumb"] = {"@id": bc["@id"]}
        nodes.append(bc)
    fq = faq(page, body)
    if fq:
        nodes.append(fq)
    nodes.insert(0, webpage)
    return {"@context": "https://schema.org", "@graph": nodes}


def block(page, cfg, body):
    a = lambda s: html.escape(s, quote=True)
    img = IMAGE_BASE + "/assets/images/og/" + cfg["og"] + ".jpg"
    og_title = cfg.get("og_title", cfg["title"])
    alt = cfg.get("og_alt") or text(re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S).group(1)) + ", Shanker Dental and Craniofacial Centre, Madurai"
    lines = [
        "<!-- seo:start: generated by tools/seo.py, do not edit by hand -->",
        '<link rel="canonical" href="%s">' % url(page),
        '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
        '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">',
        '<link rel="icon" href="favicon.ico" sizes="48x48">',
        '<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">',
        '<link rel="manifest" href="site.webmanifest">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="%s">' % a(NAME),
        '<meta property="og:locale" content="en_IN">',
        '<meta property="og:locale:alternate" content="ta_IN">',
        '<meta property="og:title" content="%s">' % a(og_title),
        '<meta property="og:description" content="%s">' % a(cfg["desc"]),
        '<meta property="og:url" content="%s">' % url(page),
        '<meta property="og:image" content="%s">' % img,
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="%s">' % a(alt),
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="%s">' % a(og_title),
        '<meta name="twitter:description" content="%s">' % a(cfg["desc"]),
        '<meta name="twitter:image" content="%s">' % img,
        '<meta name="twitter:image:alt" content="%s">' % a(alt),
    ]
    if cfg.get("geo"):
        lines += [
            '<meta name="geo.region" content="IN-TN">',
            '<meta name="geo.placename" content="Madurai">',
            '<meta name="geo.position" content="9.923213;78.138549">',
            '<meta name="ICBM" content="9.923213, 78.138549">',
        ]
    data = json.dumps(graph(page, cfg, body), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    lines.append('<script type="application/ld+json">' + data + "</script>")
    lines.append("<!-- seo:end -->")
    return "\n".join(lines) + "\n"


def render(page, src):
    cfg = PAGES[page]
    for k in ("title", "desc", "og_title"):
        if k in cfg and BAD.search(cfg[k]):
            raise SystemExit("%s: use plain punctuation in %s" % (page, k))
    head_end = src.index("</head>")
    head, rest = src[:head_end], src[head_end:]
    body = rest
    head = re.sub(r"<title>.*?</title>", "<title>%s</title>" % html.escape(cfg["title"], quote=False), head, count=1, flags=re.S)
    head = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % html.escape(cfg["desc"], quote=True), head, count=1)
    head = re.sub(r'<meta name="keywords" content="[^"]*">\n', "", head)
    head = re.sub(r'<link rel="icon" href="assets/favicon\.svg" type="image/svg\+xml">\n', "", head)
    if "<!-- seo:start" in head:
        head = re.sub(r"<!-- seo:start.*?<!-- seo:end -->\n", "", head, flags=re.S)
    else:
        # First run: drop the hand-written tags this block replaces.
        cut = head.find('<link rel="canonical"')
        if cut != -1:
            head = head[:cut]
    return head + block(page, cfg, body) + rest


def main():
    check = "--check" in sys.argv
    stale = []
    for page in sorted(PAGES):
        src = open(page, encoding="utf-8").read()
        out = render(page, src)
        if out != src:
            stale.append(page)
            if not check:
                open(page, "w", encoding="utf-8").write(out)
    missing = sorted(set(p for p in os.listdir(".") if p.endswith(".html")) - set(PAGES))
    if missing:
        print("pages with no SEO entry:", ", ".join(missing))
        sys.exit(1)
    if check:
        if stale:
            print("SEO metadata out of date (run tools/seo.py):", ", ".join(stale))
            sys.exit(1)
        print("SEO metadata current.")
    else:
        print("Updated %d page(s)." % len(stale) if stale else "Already current.")


if __name__ == "__main__":
    main()
