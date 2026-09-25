/* ==========================================================================
   Tamil / English language toggle.
   --------------------------------------------------------------------------
   Every translatable element carries a bare `data-i18n` marker. Its English
   text (as authored in the HTML) is cached once on load, then used as the
   lookup key into window.SDCC_I18N, a flat dictionary shared by every page
   (assets/js/i18n-data.js). Generated content (the case archive) carries its
   own Tamil in `data-ta` instead, which wins over the dictionary.

   The dictionary is large, so it is only fetched when Tamil is actually
   wanted: on load for a returning Tamil reader, or on the first press of
   the toggle. English visitors never download it. For a Tamil reader, the
   inline script in <head> has already set `lang-ta` and `i18n-pending`, so
   the page's text waits hidden for the translation instead of flashing
   English first (i18n.css reveals it after 2s regardless, if this fails).
   ========================================================================== */
(function () {
  'use strict';

  /* Whether the Tamil version is switched on for visitors. Must match
     TAMIL_LIVE in api/_lib/cases.js (see HANDOFF.md, "Tamil"). While it is
     off, the toggle stays in the top bar marked "Soon" and explains that the
     Tamil version is being prepared, and nothing is ever translated. */
  var TAMIL_LIVE = true;

  var STORAGE_KEY = 'sdcc-lang';
  var root = document.documentElement;
  var toggleButtons = Array.prototype.slice.call(document.querySelectorAll('.lang-toggle'));

  if (!TAMIL_LIVE) {
    /* Undo the <head> script's early switch for anyone with a saved Tamil
       choice from testing, and forget that choice. */
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
    root.classList.remove('lang-ta', 'i18n-pending');
    root.lang = 'en';

    var openNote = null;
    var closeNote = function () {
      if (!openNote) return;
      openNote.note.hidden = true;
      openNote.btn.setAttribute('aria-expanded', 'false');
      openNote = null;
    };

    toggleButtons.forEach(function (btn, i) {
      btn.classList.add('is-soon');
      /* Not a language switch while it is off, just a disclosure. */
      btn.removeAttribute('aria-pressed');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'தமிழ்: Tamil version coming soon');
      var badge = document.createElement('span');
      badge.className = 'lang-soon-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'Soon';
      btn.appendChild(badge);

      var note = document.createElement('div');
      note.className = 'lang-soon-note';
      note.id = 'lang-soon-note-' + i;
      note.setAttribute('role', 'status');
      note.hidden = true;
      note.innerHTML =
        '<strong lang="ta">தமிழ் பதிப்பு விரைவில்</strong>' +
        '<span>The Tamil version of this website is being prepared and will be available here soon.</span>';
      btn.setAttribute('aria-controls', note.id);
      btn.parentNode.classList.add('lang-soon-wrap');
      btn.parentNode.appendChild(note);

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openNote && openNote.btn === btn) { closeNote(); return; }
        closeNote();
        note.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        openNote = { btn: btn, note: note };
      });
    });

    document.addEventListener('click', function (e) {
      if (openNote && !openNote.note.contains(e.target)) closeNote();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openNote) {
        var b = openNote.btn;
        closeNote();
        b.focus();
      }
    });
    return;
  }

  var me = document.currentScript;
  var dictUrl = (me && me.getAttribute('data-dict')) || 'assets/js/i18n-data.js';
  var dict = window.SDCC_I18N || null;
  var loading = null;

  function norm(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  nodes.forEach(function (el) {
    if (!el.hasAttribute('data-i18n-en')) {
      el.setAttribute('data-i18n-en', el.textContent);
    }
  });

  var attrNodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n-attr]'));
  attrNodes.forEach(function (el) {
    var attrName = el.getAttribute('data-i18n-attr');
    if (!el.hasAttribute('data-i18n-attr-en')) {
      el.setAttribute('data-i18n-attr-en', el.getAttribute(attrName) || '');
    }
  });

  var toggles = Array.prototype.slice.call(document.querySelectorAll('.lang-toggle'));

  function loadDict() {
    if (dict) return Promise.resolve(dict);
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = dictUrl;
      s.async = true;
      s.onload = function () { dict = window.SDCC_I18N || {}; resolve(dict); };
      /* Offline or blocked: fall back to whatever carries its own data-ta,
         and let a later press try the network again. */
      s.onerror = function () { loading = null; resolve({}); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function apply(lang, table) {
    var isTa = lang === 'ta';
    var d = table || dict || {};
    root.lang = isTa ? 'ta' : 'en';
    root.classList.toggle('lang-ta', isTa);

    nodes.forEach(function (el) {
      var en = el.getAttribute('data-i18n-en');
      if (!isTa) {
        el.textContent = en;
        return;
      }
      var ta = el.getAttribute('data-ta') || d[norm(en)];
      el.textContent = ta || en;
    });

    attrNodes.forEach(function (el) {
      var attrName = el.getAttribute('data-i18n-attr');
      var en = el.getAttribute('data-i18n-attr-en');
      if (!isTa) {
        el.setAttribute(attrName, en);
        return;
      }
      el.setAttribute(attrName, d[norm(en)] || en);
    });

    toggles.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(isTa));
      btn.removeAttribute('aria-busy');
      /* The button names the language it switches TO, in that language,
         and its accessible name starts with that same visible word. */
      btn.setAttribute('aria-label', isTa ? 'English: read this site in English' : 'தமிழ்: read this site in Tamil');
      var label = btn.querySelector('.lang-toggle-label');
      if (label) {
        label.textContent = isTa ? 'English' : 'தமிழ்';
        label.setAttribute('lang', isTa ? 'en' : 'ta');
      }
    });

    root.classList.remove('i18n-pending');
    document.dispatchEvent(new CustomEvent('sdcc:lang', { detail: { lang: lang } }));
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (err) {}
  var current = saved === 'ta' ? 'ta' : 'en';

  if (current === 'ta') loadDict().then(function (d) { apply('ta', d); });
  else apply('en');

  function toggle() {
    current = current === 'ta' ? 'en' : 'ta';
    try { localStorage.setItem(STORAGE_KEY, current); } catch (err) {}
    if (current === 'en') { apply('en'); return; }
    toggles.forEach(function (btn) { btn.setAttribute('aria-busy', 'true'); });
    loadDict().then(function (d) { if (current === 'ta') apply('ta', d); });
  }

  toggles.forEach(function (btn) {
    btn.addEventListener('click', toggle);
  });
})();
