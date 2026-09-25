/* Case of the Month: data model and HTML rendering.
   One module, used by both tools/build-cases.js (local) and the admin API
   (production), so the markup a case gets can never depend on which of the
   two published it. data/cases.json is the source of truth; the marked
   blocks in case-of-the-month.html and index.html are generated from it. */
'use strict';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTHS_TA = ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை',
  'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'];

/* Each topic is one of the site's treatment pages, so a case always has
   somewhere to send a visitor who wants the fuller explanation. */
const TOPICS = {
  trauma:        { en: 'Facial trauma',         ta: 'முகக் காயம்',              page: 'facial-trauma-surgery.html',                pageEn: 'Facial Trauma Surgery',        pageTa: 'முகக் காய அறுவை சிகிச்சை' },
  pathology:     { en: 'Tumours & cysts',       ta: 'கட்டிகள், நீர்க்கட்டிகள்', page: 'oral-and-maxillofacial-pathology.html',     pageEn: 'Head & Neck Pathology',        pageTa: 'தலை, கழுத்து நோயியல்' },
  orthognathic:  { en: 'Jaw correction',        ta: 'தாடை சீரமைப்பு',           page: 'orthognathic-surgery.html',                 pageEn: 'Facial Deformity Correction',  pageTa: 'முக வடிவக் குறைபாடு திருத்தம்' },
  cleft:         { en: 'Cleft lip & palate',    ta: 'உதடு, அண்ணப் பிளவு',      page: 'cleft-lip-and-palate-surgery.html',         pageEn: 'Cleft Lip & Palate Surgery',   pageTa: 'உதடு, அண்ணப் பிளவு அறுவை சிகிச்சை' },
  tmj:           { en: 'Jaw joint (TMJ)',       ta: 'தாடை மூட்டு (TMJ)',        page: 'tmj-surgery.html',                          pageEn: 'TMJ: Jaw Joint Surgery',       pageTa: 'தாடை மூட்டு அறுவை சிகிச்சை' },
  implants:      { en: 'Implants',              ta: 'உள்வைப்புகள்',             page: 'dental-and-facial-implants.html',           pageEn: 'Dental & Facial Implants',     pageTa: 'பல் மற்றும் முக உள்வைப்புகள்' },
  orthodontics:  { en: 'Orthodontics',          ta: 'பல் சீரமைப்பு',            page: 'orthodontics.html',                         pageEn: 'Orthodontics',                 pageTa: 'பல் சீரமைப்பு சிகிச்சை' },
  craniofacial:  { en: 'Craniofacial',          ta: 'மண்டை-முகம்',              page: 'craniofacial-surgery.html',                 pageEn: 'Craniofacial Surgery',         pageTa: 'மண்டை-முக அறுவை சிகிச்சை' },
  maxillofacial: { en: 'Maxillofacial surgery', ta: 'தாடை-முக அறுவை சிகிச்சை',  page: 'maxillofacial-surgery.html',                pageEn: 'Maxillofacial Surgery',        pageTa: 'தாடை-முக அறுவை சிகிச்சை' },
};

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Whether the Tamil version of the site is switched on. Must match
   TAMIL_LIVE in assets/js/i18n.js (see HANDOFF.md, "Tamil"). While it is
   off, generated pages carry no Tamil at all and the admin hides the Tamil
   title field. */
const TAMIL_LIVE = true;

/* An English string plus its Tamil counterpart, in the form i18n.js reads:
   the per-element data-ta wins over the shared dictionary, so generated
   content never needs a dictionary entry of its own. */
function t(en, ta) {
  return '<span data-i18n' + (TAMIL_LIVE && ta ? ' data-ta="' + esc(ta) + '"' : '') + '>' + esc(en) + '</span>';
}

function monthYear(c, lang) {
  const names = lang === 'ta' ? MONTHS_TA : MONTHS_EN;
  return names[c.month - 1] + ' ' + c.year;
}

function sortCases(list) {
  return list.slice().sort(function (a, b) {
    return (b.year - a.year) || (b.month - a.month) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

function publishedCases(list) {
  return sortCases(list.filter(function (c) { return c.published !== false; }));
}

function caption(c, lang) {
  return monthYear(c, lang) + ', ' + (lang === 'ta' ? (c.titleTa || c.title) : c.title);
}

/* Attributes that make an element open the case in the lightbox. Every page
   of the document travels with it, so a two-page case reads as one item. */
function lbAttrs(c) {
  const pages = c.pages.map(function (p) { return p.src; });
  return ' data-lb="' + esc(pages[0]) + '"' +
    (pages.length > 1 ? ' data-lb-pages="' + esc(pages.join('|')) + '"' : '') +
    ' data-lb-kind="case"' +
    ' data-cap="' + esc(caption(c, 'en')) + '"' +
    (TAMIL_LIVE ? ' data-cap-ta="' + esc(caption(c, 'ta')) + '"' : '');
}

function topicChip(c) {
  const tp = TOPICS[c.topic] || TOPICS.maxillofacial;
  return '<span class="case-topic">' + t(tp.en, tp.ta) + '</span>';
}

function card(c, headingTag) {
  const h = headingTag || 'h3';
  return (
    '<li class="case-card" id="case-' + esc(c.id) + '" data-topic="' + esc(c.topic) + '">\n' +
    '  <a class="case-card-link" href="' + esc(c.pages[0].src) + '"' + lbAttrs(c) + '>\n' +
    '    <span class="case-card-media"><img src="' + esc(c.card.src) + '" alt="" loading="lazy" decoding="async" width="' + c.card.w + '" height="' + c.card.h + '"></span>\n' +
    '    <span class="case-card-body">\n' +
    '      <span class="case-date">' + t(monthYear(c, 'en'), monthYear(c, 'ta')) + '</span>\n' +
    '      <' + h + ' class="case-card-title">' + t(c.title, c.titleTa) + '</' + h + '>\n' +
    '      ' + topicChip(c) + '\n' +
    (c.pages.length > 1
      ? '      <span class="case-pages">' + t(c.pages.length + ' pages', c.pages.length + ' பக்கங்கள்') + '</span>\n'
      : '') +
    '    </span>\n' +
    '  </a>\n' +
    '</li>'
  );
}

function renderArchive(list) {
  const cases = publishedCases(list);
  if (!cases.length) {
    return '<section class="section case-archive"><div class="wrap"><p>' +
      t('New cases will appear here soon.', 'புதிய நிகழ்வுகள் விரைவில் இங்கே வெளியிடப்படும்.') +
      '</p></div></section>';
  }
  const latest = cases[0];
  const lt = TOPICS[latest.topic] || TOPICS.maxillofacial;

  const counts = {};
  cases.forEach(function (c) { counts[c.topic] = (counts[c.topic] || 0) + 1; });
  /* Most-used topics first: the chip row scrolls on small screens, and the
     ones a visitor is likeliest to want should be visible without it. */
  const order = Object.keys(TOPICS);
  const topicKeys = order.filter(function (k) { return counts[k]; }).sort(function (a, b) {
    return (counts[b] - counts[a]) || (order.indexOf(a) - order.indexOf(b));
  });
  const chips = topicKeys.map(function (k) {
    return '      <button class="case-chip" type="button" data-topic="' + k + '" aria-pressed="false">' +
      t(TOPICS[k].en, TOPICS[k].ta) + ' <span class="case-chip-count">' + counts[k] + '</span></button>';
  });

  const years = [];
  cases.forEach(function (c) {
    if (!years.length || years[years.length - 1].year !== c.year) years.push({ year: c.year, items: [] });
    years[years.length - 1].items.push(c);
  });

  const out = [];
  out.push('<section class="section case-archive" aria-labelledby="latest-case-heading">');
  out.push('  <div class="wrap">');
  out.push('    <article class="case-feature reveal">');
  out.push('      <a class="case-feature-media" href="' + esc(latest.pages[0].src) + '"' + lbAttrs(latest) + ' aria-label="' + esc('Open the case: ' + latest.title) + '">');
  out.push('        <img src="' + esc(latest.card.src) + '" alt="" decoding="async" width="' + latest.card.w + '" height="' + latest.card.h + '">');
  out.push('        <span class="case-feature-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg></span>');
  out.push('      </a>');
  out.push('      <div class="case-feature-body">');
  out.push('        <p class="eyebrow">' + t('Latest case', 'சமீபத்திய நிகழ்வு') + '</p>');
  out.push('        <p class="case-date">' + t(monthYear(latest, 'en'), monthYear(latest, 'ta')) + '</p>');
  out.push('        <h2 id="latest-case-heading" class="case-feature-title">' + t(latest.title, latest.titleTa) + '</h2>');
  out.push('        ' + topicChip(latest));
  out.push('        <p class="actions-row">');
  out.push('          <a class="btn btn-primary" href="' + esc(latest.pages[0].src) + '"' + lbAttrs(latest) + '>' + t('Read the case', 'நிகழ்வைப் படிக்க') + '</a>');
  out.push('          <a class="btn btn-outline" href="' + esc(lt.page) + '">' + t('Explore ' + lt.pageEn, lt.pageTa + ' பற்றி அறிய') + '</a>');
  out.push('        </p>');
  out.push('      </div>');
  out.push('    </article>');
  out.push('');
  out.push('    <div class="case-browse">');
  out.push('      <div class="case-toolbar" role="group" aria-label="Filter cases by topic">');
  out.push('      <button class="case-chip" type="button" data-topic="all" aria-pressed="true">' + t('All cases', 'அனைத்தும்') + ' <span class="case-chip-count">' + cases.length + '</span></button>');
  out.push(chips.join('\n'));
  out.push('      </div>');
  out.push('      <p class="case-results" aria-live="polite" data-total="' + cases.length + '"></p>');
  years.forEach(function (y) {
    out.push('');
    /* Not data-year: main.js fills every [data-year] with the current year
       (the footer copyright), which would wipe this whole group. */
    out.push('      <section class="case-year" data-case-year="' + y.year + '" aria-labelledby="cases-' + y.year + '">');
    out.push('        <h2 class="case-year-title" id="cases-' + y.year + '">' + y.year +
      ' <span class="case-year-count">' + t(y.items.length + (y.items.length === 1 ? ' case' : ' cases'), y.items.length + (y.items.length === 1 ? ' நிகழ்வு' : ' நிகழ்வுகள்')) + '</span></h2>');
    out.push('        <ul class="case-grid stagger" role="list">');
    y.items.forEach(function (c) {
      out.push(card(c).split('\n').map(function (l) { return '          ' + l; }).join('\n'));
    });
    out.push('        </ul>');
    out.push('      </section>');
  });
  out.push('');
  out.push('      <p class="case-note">' + t(
    'These images are shown with the sole aim of educating and creating awareness among the general population about the problems associated with facial surgery, its potential complications and its possible solutions. Select any case to read it full size.',
    'முக அறுவை சிகிச்சை தொடர்பான பிரச்சினைகள், அவற்றின் சாத்தியமான சிக்கல்கள் மற்றும் தீர்வுகள் குறித்து பொதுமக்களுக்குக் கல்வி அளிப்பதும் விழிப்புணர்வு ஏற்படுத்துவதும் மட்டுமே இப்படங்களைக் காட்டுவதன் நோக்கம். எந்த நிகழ்வையும் முழு அளவில் படிக்க அதைத் தேர்ந்தெடுக்கவும்.'
  ) + '</p>');
  out.push('    </div>');
  out.push('  </div>');
  out.push('</section>');
  return out.join('\n');
}

/* Homepage teaser: titles and dates only. Clinical imagery stays behind the
   archive's consent gate, so nothing here shows a photograph. */
function renderLatest(list, n) {
  const cases = publishedCases(list).slice(0, n || 3);
  const rows = cases.map(function (c) {
    return (
      '  <li>\n' +
      '    <a class="case-latest-link" href="case-of-the-month.html#case-' + esc(c.id) + '">\n' +
      '      <span class="case-date">' + t(monthYear(c, 'en'), monthYear(c, 'ta')) + '</span>\n' +
      '      <span class="case-latest-title">' + t(c.title, c.titleTa) + '</span>\n' +
      '      ' + topicChip(c) + '\n' +
      '      <span class="case-latest-arrow">' + ARROW + '</span>\n' +
      '    </a>\n' +
      '  </li>'
    );
  });
  return '<ol class="case-latest" role="list">\n' + rows.join('\n') + '\n</ol>';
}

function replaceBlock(html, name, inner) {
  const start = '<!-- cases:' + name + ':start -->';
  const end = '<!-- cases:' + name + ':end -->';
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a === -1 || b === -1 || b < a) throw new Error('Marker block "' + name + '" not found');
  return html.slice(0, a + start.length) + '\n' + inner + '\n' + html.slice(b);
}

function renderPages(pages, list) {
  return {
    archive: replaceBlock(pages.archive, 'archive', renderArchive(list)),
    home: replaceBlock(pages.home, 'latest', renderLatest(list, 3)),
  };
}

function touchSitemap(xml, isoDate) {
  ['case-of-the-month.html', ''].forEach(function (path) {
    const re = new RegExp('(<loc>[^<]*/' + path.replace(/\./g, '\\.') + '</loc>\\s*<lastmod>)[^<]*(</lastmod>)');
    xml = xml.replace(re, '$1' + isoDate + '$2');
  });
  return xml;
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .split('-').slice(0, 6).join('-') || 'case';
}

function makeId(year, month, title, existing) {
  const base = year + '-' + String(month).padStart(2, '0') + '-' + slugify(title);
  let id = base;
  let n = 2;
  while (existing.indexOf(id) !== -1) id = base + '-' + (n++);
  return id;
}

const DASHES = /[\u2012\u2013\u2014\u2015\u2192\u21d2]/;

/* Validates the editable fields of a case. Returns a clean copy or throws
   an Error whose message is safe to show in the admin panel. */
function cleanFields(input) {
  const year = parseInt(input.year, 10);
  const month = parseInt(input.month, 10);
  const title = String(input.title || '').replace(/\s+/g, ' ').trim();
  const titleTa = String(input.titleTa || '').replace(/\s+/g, ' ').trim();
  const topic = String(input.topic || '');
  const thisYear = new Date().getFullYear();
  if (!(year >= 2000 && year <= thisYear + 1)) throw new Error('Choose a year between 2000 and ' + (thisYear + 1) + '.');
  if (!(month >= 1 && month <= 12)) throw new Error('Choose a month.');
  if (title.length < 4) throw new Error('Add a title of at least a few words.');
  if (title.length > 200) throw new Error('Keep the title under 200 characters.');
  if (titleTa.length > 300) throw new Error('Keep the Tamil title under 300 characters.');
  if (DASHES.test(title) || DASHES.test(titleTa)) throw new Error('Please use a colon or comma instead of long dashes or arrows in titles.');
  if (!TOPICS[topic]) throw new Error('Choose a topic.');
  return { year: year, month: month, title: title, titleTa: titleTa, topic: topic, published: input.published !== false };
}

module.exports = {
  TAMIL_LIVE, MONTHS_EN, MONTHS_TA, TOPICS,
  esc, monthYear, sortCases, publishedCases,
  renderArchive, renderLatest, replaceBlock, renderPages, touchSitemap,
  slugify, makeId, cleanFields,
};
