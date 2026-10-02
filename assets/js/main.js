/* ==========================================================================
   Shanker Dental & Craniofacial Centre — Site scripts
   ==========================================================================
   Progressive enhancement only: every feature here degrades to plain,
   usable HTML when scripts do not run.
   ========================================================================== */
(function () {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Assigned by the reveal section below. Anything that makes hidden content
     displayable must call this, or elements that were `display: none` when the
     observer was built stay masked forever — they never intersected, so the
     observer never fired for them. The consent gate is exactly that case. */
  var revealRefresh = function () {};

  /* Keep Tab inside `container` while it is open. */
  function trapFocus(container, event) {
    var items = Array.prototype.filter.call(
      container.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* Locks background scroll behind a full-screen overlay (nav drawer,
     lightbox). `body.style.overflow = 'hidden'` looks like it should do
     this, but it does not: the page's actual scrolling element is <html>,
     not <body>, so the page keeps whatever scroll position it had — and
     because <body> is an ancestor of the sticky `.site-header`, giving it
     a non-visible overflow breaks that header's `position: sticky`
     entirely, so it (and the drawer's own close button, which lives in
     it) renders off-screen the moment the page has been scrolled before
     opening. Pinning <body> itself with a negative top offset freezes
     scroll for real, without disturbing sticky/fixed descendants, since
     with no scrolling ancestor left they position against the viewport
     directly — which is what makes the header stay put and visible. */
  var scrollLockY = 0;
  var scrollLockCount = 0;
  function lockScroll() {
    if (scrollLockCount === 0) {
      scrollLockY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = (-scrollLockY) + 'px';
      document.body.style.width = '100%';
    }
    scrollLockCount += 1;
  }
  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo({ top: scrollLockY, left: 0, behavior: 'instant' });
    }
  }

  /* ======================================================================
     Mobile navigation drawer
     ====================================================================== */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  if (toggle && nav) {
    /* Entry order for the popup's staggered entrance (CSS reads --i). Only
       the items the popup actually shows, in the order it shows them. */
    Array.prototype.forEach.call(
      nav.querySelectorAll(':scope > a, .nav-more-flat, .nav-more-panel:not(.is-wide) > a'),
      function (el, i) { el.style.setProperty('--i', i); }
    );

    var scrim = document.createElement('button');
    scrim.className = 'nav-scrim';
    scrim.setAttribute('tabindex', '-1');
    scrim.setAttribute('aria-label', 'Close menu');
    document.body.appendChild(scrim);

    var openNav = function () {
      nav.classList.add('open');
      scrim.classList.add('show');
      toggle.setAttribute('aria-expanded', 'true');
      /* Only meaningful while the toggle turns `.nav` into the full-screen
         popup (mobile/tablet) — the toggle itself is display:none above
         that breakpoint, so this branch never runs for the desktop bar. */
      nav.setAttribute('role', 'dialog');
      nav.setAttribute('aria-modal', 'true');
      lockScroll();
      var firstLink = nav.querySelector(FOCUSABLE);
      if (firstLink) firstLink.focus();
    };

    var closeNav = function (returnFocus) {
      nav.classList.remove('open');
      scrim.classList.remove('show');
      toggle.setAttribute('aria-expanded', 'false');
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      unlockScroll();
      if (returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', function () {
      if (nav.classList.contains('open')) closeNav(true);
      else openNav();
    });

    scrim.addEventListener('click', function () { closeNav(true); });

    /* Following a link closes the drawer; focus goes with the navigation. */
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!nav.classList.contains('open')) return;
      if (e.key === 'Escape') closeNav(true);
      if (e.key === 'Tab') trapFocus(nav, e);
    });

    /* Resizing past the breakpoint must not leave a hidden drawer holding
       the scroll lock. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1060 && nav.classList.contains('open')) closeNav(false);
    });
  }

  /* ======================================================================
     Nav dropdowns ("Treatment Options", "More")
     ----------------------------------------------------------------------
     Desktop only — on mobile every toggle is hidden and each panel is
     unwrapped into the drawer's normal flow by CSS, so none of this runs
     against it. Two independent dropdowns share the header, so opening one
     closes the other rather than letting both sit open at once.
     ====================================================================== */
  var moreWraps = Array.prototype.slice.call(document.querySelectorAll('.nav-more'));
  if (moreWraps.length) {
    var dropdowns = moreWraps.map(function (wrap) {
      return { wrap: wrap, toggle: wrap.querySelector('.nav-more-toggle'), panel: wrap.querySelector('.nav-more-panel') };
    });

    var closeDropdown = function (d) {
      d.panel.classList.remove('open');
      d.toggle.setAttribute('aria-expanded', 'false');
    };
    var closeAllDropdowns = function (except) {
      dropdowns.forEach(function (d) { if (d !== except) closeDropdown(d); });
    };
    var openDropdown = function (d) {
      closeAllDropdowns(d);
      d.panel.classList.add('open');
      d.toggle.setAttribute('aria-expanded', 'true');
    };

    dropdowns.forEach(function (d) {
      d.toggle.addEventListener('click', function () {
        if (d.panel.classList.contains('open')) closeDropdown(d);
        else openDropdown(d);
      });
    });

    /* Click anywhere outside every dropdown closes whichever is open. */
    document.addEventListener('click', function (e) {
      dropdowns.forEach(function (d) {
        if (!d.wrap.contains(e.target)) closeDropdown(d);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = dropdowns.find(function (d) { return d.panel.classList.contains('open'); });
      if (!open) return;
      closeDropdown(open);
      open.toggle.focus();
    });

    /* A panel left open while resizing past the breakpoint would sit under
       the mobile drawer's own layout with stale inline state. */
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 1060) closeAllDropdowns();
    });
  }

  /* ======================================================================
     Accordions
     ====================================================================== */
  document.querySelectorAll('.acc-head').forEach(function (head) {
    head.addEventListener('click', function () {
      var body = head.nextElementSibling;
      var open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (body) body.classList.toggle('open', !open);
    });
  });

  /* ======================================================================
     Consent gate
     ----------------------------------------------------------------------
     Mirrors the disclaimer the original site showed before any clinical
     imagery. Consent is remembered for the browsing session only.
     ====================================================================== */
  if (document.body.classList.contains('needs-consent')) {
    var stored = null;
    try { stored = sessionStorage.getItem('sdcc-consent'); } catch (err) {}

    if (stored === 'yes') {
      document.body.classList.remove('needs-consent');
    } else {
      var box = document.getElementById('consent-check');
      var agree = document.getElementById('consent-agree');
      if (box && agree) {
        var sync = function () {
          agree.disabled = !box.checked;
          agree.setAttribute('aria-disabled', box.checked ? 'false' : 'true');
        };
        sync();
        box.addEventListener('change', sync);

        agree.addEventListener('click', function () {
          try { sessionStorage.setItem('sdcc-consent', 'yes'); } catch (err) {}
          document.body.classList.remove('needs-consent');
          /* The clinical figures were display:none until this instant, so the
             observer never saw them. Without this they stay masked and the
             page reads as empty — the whole point of passing the gate. */
          revealRefresh();
          /* Move focus to the now-revealed content so keyboard and screen
             reader users land where the new content starts. */
          var main = document.getElementById('main');
          if (main) {
            main.setAttribute('tabindex', '-1');
            main.focus({ preventScroll: true });
          }
          /* A link to one case (#case-...) scrolls to that case instead. */
          if (/^#case-[\w-]+$/.test(window.location.hash) && document.getElementById(window.location.hash.slice(1))) {
            document.dispatchEvent(new CustomEvent('sdcc:consent'));
          } else {
            window.scrollTo({
              top: 0,
              behavior: reduceMotion.matches ? 'auto' : 'smooth'
            });
          }
        });
      }
    }
  }

  /* ======================================================================
     Lightbox
     ====================================================================== */
  var isTamil = function () { return document.documentElement.lang === 'ta'; };

  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('.lb-cap-text');
    var lbCount = lb.querySelector('.lb-count');
    /* One slide per page. A case can be several pages long, so "next" walks
       its pages before moving to the next case. */
    var slides = [];
    var itemTotal = 0;
    var idx = 0;
    var lastFocused = null;

    var collect = function (opener) {
      slides = [];
      itemTotal = 0;
      var seen = {};
      var triggers = Array.prototype.filter.call(document.querySelectorAll('[data-lb]'), function (el) {
        /* Filtered-out cards are not part of what the visitor is browsing,
           and the featured case is a second door to a card in the grid, so
           it never counts as an item of its own. */
        return !el.closest('[hidden]') && !el.closest('.case-feature');
      });
      /* Opened from somewhere the sequence does not include (the featured
         case while a filter hides its card): start with it anyway. */
      var openerSrc = opener.getAttribute('data-lb');
      if (!triggers.some(function (el) { return el.getAttribute('data-lb') === openerSrc; })) triggers.unshift(opener);
      triggers.forEach(function (el) {
        var first = el.getAttribute('data-lb');
        if (seen[first]) return;
        seen[first] = true;
        var pages = (el.getAttribute('data-lb-pages') || first).split('|');
        var item = { el: el, n: itemTotal, pages: pages.length };
        itemTotal += 1;
        pages.forEach(function (src, p) { slides.push({ item: item, src: src, page: p }); });
      });
    };

    var captionFor = function (el) {
      var cap = el.getAttribute('data-cap') || '';
      if (!isTamil()) return cap;
      var dict = window.SDCC_I18N || {};
      return el.getAttribute('data-cap-ta') || dict[cap] || cap;
    };

    var countFor = function (s) {
      var ta = isTamil();
      var isCase = s.item.el.getAttribute('data-lb-kind') === 'case';
      var text = ta
        ? (isCase ? 'நிகழ்வு ' : 'படம் ') + (s.item.n + 1) + ' / ' + itemTotal
        : (isCase ? 'Case ' : 'Image ') + (s.item.n + 1) + ' of ' + itemTotal;
      if (s.item.pages > 1) {
        text += ta ? ', பக்கம் ' + (s.page + 1) + ' / ' + s.item.pages
                   : ', page ' + (s.page + 1) + ' of ' + s.item.pages;
      }
      return text;
    };

    var show = function (i) {
      if (!slides.length) return;
      idx = (i + slides.length) % slides.length;
      var s = slides[idx];
      var cap = captionFor(s.item.el);
      /* Hide the outgoing image until the new one has decoded, then let the
         entrance animation replay, so paging never flashes the old slide. */
      lbImg.classList.add('is-swapping');
      lbImg.onload = lbImg.onerror = function () { lbImg.classList.remove('is-swapping'); };
      lbImg.setAttribute('src', s.src);
      lbImg.setAttribute('alt', cap);
      if (lbCap) lbCap.textContent = cap;
      if (lbCount) lbCount.textContent = countFor(s);
      lb.setAttribute('aria-label', cap || 'Image viewer');
      var next = slides[(idx + 1) % slides.length];
      if (next && next.src !== s.src) { var pre = new Image(); pre.src = next.src; }
    };

    var open = function (trigger) {
      collect(trigger);
      var first = trigger.getAttribute('data-lb');
      var start = 0;
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].src === first && slides[i].page === 0) { start = i; break; }
      }
      lastFocused = document.activeElement;
      show(start);
      lb.classList.add('open');
      lockScroll();
      var closeBtn = lb.querySelector('.lb-close');
      if (closeBtn) closeBtn.focus();
    };

    var close = function () {
      lb.classList.remove('open');
      unlockScroll();
      lbImg.onload = lbImg.onerror = null;
      lbImg.setAttribute('src', '');
      /* Return focus to whatever opened the viewer. */
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    };

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-lb]');
      if (!trigger) return;
      e.preventDefault();
      open(trigger);
    });

    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

    /* Horizontal swipe pages on touch screens, where the arrow buttons sit
       at the far edges of a small viewport. */
    var swipeX = null;
    var swipeY = null;
    lb.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.target.closest('.lb-btn')) return;
      swipeX = e.clientX;
      swipeY = e.clientY;
    });
    lb.addEventListener('pointerup', function (e) {
      if (swipeX === null) return;
      var dx = e.clientX - swipeX;
      var dy = e.clientY - swipeY;
      swipeX = swipeY = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) show(idx + (dx < 0 ? 1 : -1));
    });
    lb.addEventListener('pointercancel', function () { swipeX = swipeY = null; });

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { show(idx - 1); return; }
      if (e.key === 'ArrowRight') { show(idx + 1); return; }
      if (e.key === 'Tab') trapFocus(lb, e);
    });
  }

  /* Fades on a horizontally scrolling chip row, only on the side that has
     more to scroll to (the case filter bar and the page index share it). */
  function edgeFades(row) {
    var sync = function () {
      var max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('can-left', row.scrollLeft > 2);
      row.classList.toggle('can-right', row.scrollLeft < max - 2);
    };
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    document.addEventListener('sdcc:lang', sync);
    sync();
    return sync;
  }

  /* ======================================================================
     "On this page" index for the long treatment pages
     ----------------------------------------------------------------------
     Built from the page's own section headings, so no page carries a list
     that can drift from its content. It follows the reader: the section on
     screen is marked current, and the row keeps that chip in view. Pages
     with fewer than three sections do not get one. It lives inside the
     consent-gated content, so it only appears once the gate is passed.
     The case archive is skipped: its own year groups and topic filter already
     do this job, and a second chip row there led with one case's title.
     ====================================================================== */
  var clinical = document.querySelector('.clinical');
  if (clinical && !clinical.querySelector('[data-case-year]') && 'IntersectionObserver' in window) {
    var heads = Array.prototype.filter.call(clinical.querySelectorAll('h2'), function (h) {
      return !h.closest('.cta-band, .gate');
    });
    if (heads.length >= 3) {
      var slug = function (s) {
        return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      };
      var tocNav = document.createElement('nav');
      tocNav.className = 'toc';
      tocNav.setAttribute('aria-label', 'On this page');
      var row = document.createElement('div');
      row.className = 'toc-row';
      var label = document.createElement('span');
      label.className = 'toc-label';
      label.innerHTML = '<span data-i18n>On this page</span>';
      row.appendChild(label);
      var links = heads.map(function (h) {
        /* The text is still English here (main.js runs before i18n.js), so
           the id stays the same in both languages and the chip's span is
           picked up and translated along with everything else. */
        var text = h.textContent.replace(/\s+/g, ' ').trim();
        if (!h.id) h.id = slug(text) || 'section';
        var a = document.createElement('a');
        a.className = 'toc-chip';
        a.href = '#' + h.id;
        var span = document.createElement('span');
        span.setAttribute('data-i18n', '');
        span.textContent = text;
        a.appendChild(span);
        row.appendChild(a);
        return a;
      });
      tocNav.appendChild(row);
      clinical.insertBefore(tocNav, clinical.firstChild);
      edgeFades(row);

      var current = null;
      var setCurrent = function (i) {
        if (current === i) return;
        current = i;
        links.forEach(function (a, n) {
          if (n === i) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
        var chip = links[i];
        if (chip) {
          var left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
          row.scrollTo({ left: Math.max(0, left), behavior: reduceMotion.matches ? 'instant' : 'smooth' });
        }
      };
      /* The current section is the last heading that has passed a line
         a third of the way down the viewport. */
      var spy = function () {
        var line = window.innerHeight * 0.33;
        var idx = -1;
        heads.forEach(function (h, n) { if (h.getBoundingClientRect().top < line) idx = n; });
        setCurrent(idx);
      };
      var sTick = false;
      window.addEventListener('scroll', function () {
        if (sTick) return;
        sTick = true;
        window.requestAnimationFrame(function () { spy(); sTick = false; });
      }, { passive: true });
      spy();
    }
  }

  /* ======================================================================
     Case archive: topic filter + links to a single case
     ----------------------------------------------------------------------
     Filtering only toggles `hidden`, so the full archive is the no-script
     state. The chosen topic is kept in the URL (?topic=) so a filtered view
     can be shared or survives a reload.
     ====================================================================== */
  var browse = document.querySelector('.case-browse');
  if (browse) {
    var chips = Array.prototype.slice.call(browse.querySelectorAll('.case-chip'));
    var caseCards = Array.prototype.slice.call(browse.querySelectorAll('.case-card'));
    var caseYears = Array.prototype.slice.call(browse.querySelectorAll('.case-year'));
    var results = browse.querySelector('.case-results');
    var currentTopic = 'all';
    var shownCount = caseCards.length;

    var writeResults = function () {
      if (!results) return;
      var total = caseCards.length;
      if (isTamil()) {
        results.textContent = shownCount === total
          ? 'அனைத்து ' + total + ' நிகழ்வுகளும் காட்டப்படுகின்றன'
          : total + ' நிகழ்வுகளில் ' + shownCount + ' காட்டப்படுகின்றன';
      } else {
        results.textContent = shownCount === total
          ? 'Showing all ' + total + ' cases'
          : 'Showing ' + shownCount + ' of ' + total + ' cases';
      }
    };

    var applyTopic = function (topic) {
      if (!chips.some(function (c) { return c.getAttribute('data-topic') === topic; })) topic = 'all';
      currentTopic = topic;
      shownCount = 0;
      caseCards.forEach(function (card) {
        var on = topic === 'all' || card.getAttribute('data-topic') === topic;
        card.hidden = !on;
        if (on) shownCount += 1;
      });
      caseYears.forEach(function (y) {
        var n = y.querySelectorAll('.case-card:not([hidden])').length;
        y.hidden = n === 0;
        /* The year's count follows the filter. Written into the attributes
           i18n.js reads too, so switching language keeps the right number. */
        var countEl = y.querySelector('.case-year-count [data-i18n]');
        if (countEl && n) {
          var en = n + (n === 1 ? ' case' : ' cases');
          var ta = n + (n === 1 ? ' நிகழ்வு' : ' நிகழ்வுகள்');
          countEl.setAttribute('data-i18n-en', en);
          countEl.setAttribute('data-ta', ta);
          countEl.textContent = isTamil() ? ta : en;
        }
      });
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c.getAttribute('data-topic') === topic ? 'true' : 'false');
      });
      writeResults();
      revealRefresh();
    };

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var topic = chip.getAttribute('data-topic');
        applyTopic(topic === currentTopic ? 'all' : topic);
        try {
          var url = new URL(window.location.href);
          if (currentTopic === 'all') url.searchParams.delete('topic');
          else url.searchParams.set('topic', currentTopic);
          url.hash = '';
          history.replaceState(null, '', url.pathname + url.search);
        } catch (err) {}
        /* Deep in the grid, a shorter result set would leave the visitor
           staring at the footer. Bring the start of the results into view. */
        var top = browse.getBoundingClientRect().top;
        if (top < 0) {
          window.scrollTo({ top: window.scrollY + top - 8, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        }
      });
    });

    var toolbar = browse.querySelector('.case-toolbar');
    if (toolbar) {
      edgeFades(toolbar);
      /* Keep the active chip in view when it is chosen from a URL or by
         keyboard, instead of leaving it scrolled off the edge. */
      toolbar.addEventListener('focusin', function (e) {
        var chip = e.target.closest('.case-chip');
        if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }

    var initial = 'all';
    try { initial = new URL(window.location.href).searchParams.get('topic') || 'all'; } catch (err) {}
    applyTopic(initial);
    document.addEventListener('sdcc:lang', writeResults);

    /* #case-<id> from the homepage list or a shared link. The archive sits
       behind the consent gate, so the browser's own anchor jump fires while
       the card is still display:none and lands nowhere; this runs once the
       content is actually showing. */
    var focusTargetCase = function () {
      var hash = window.location.hash;
      if (!/^#case-[\w-]+$/.test(hash)) return;
      var card = document.getElementById(hash.slice(1));
      if (!card) return;
      if (card.hidden) applyTopic('all');
      /* A timeout rather than requestAnimationFrame: rAF never fires in a
         tab opened in the background (the admin's "View on the site"). */
      setTimeout(function () {
        /* Smooth scrolling is frame-driven too, so jump when not visible.
           'instant', not 'auto': auto defers to the page's CSS
           scroll-behavior, which is smooth. */
        var instant = reduceMotion.matches || document.visibilityState !== 'visible';
        card.scrollIntoView({ block: 'center', behavior: instant ? 'instant' : 'smooth' });
        card.classList.remove('is-target');
        void card.offsetWidth;
        card.classList.add('is-target');
      }, 60);
    };
    document.addEventListener('sdcc:consent', focusTargetCase);
    if (!document.body.classList.contains('needs-consent')) focusTargetCase();
    window.addEventListener('hashchange', focusTargetCase);
  }

  /* ======================================================================
     Treatment carousel
     ----------------------------------------------------------------------
     Arrows are a convenience on top of native scroll, not a replacement —
     the track is a plain overflow-x scroller underneath, so touch and
     trackpad scrolling work with or without this script. Both arrows stay
     permanently active: past the last card, next wraps to the first; before
     the first, prev wraps to the last.
     ====================================================================== */
  document.querySelectorAll('.carousel').forEach(function (car) {
    var track = car.querySelector('.carousel-track');
    var prev = car.querySelector('.carousel-prev');
    var next = car.querySelector('.carousel-next');
    if (!track || !prev || !next) return;

    var step = function () {
      var item = track.querySelector('.carousel-item');
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return item ? item.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    };
    var atStart = function () { return track.scrollLeft <= 1; };
    var atEnd = function () { return track.scrollLeft >= track.scrollWidth - track.clientWidth - 1; };

    prev.addEventListener('click', function () {
      if (atStart()) {
        track.scrollTo({ left: track.scrollWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      } else {
        track.scrollBy({ left: -step(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
    });
    next.addEventListener('click', function () {
      if (atEnd()) {
        track.scrollTo({ left: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      } else {
        track.scrollBy({ left: step(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
    });
  });

  /* ======================================================================
     Back to top
     ====================================================================== */
  var top = document.querySelector('.to-top');
  if (top) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      /* Read layout inside rAF so the scroll handler never forces a sync
         reflow on every event. */
      window.requestAnimationFrame(function () {
        top.classList.toggle('show', window.scrollY > 480);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      /* Send focus back to the top of the document, not just the viewport. */
      var skip = document.querySelector('.skip');
      if (skip) skip.focus({ preventScroll: true });
    });
  }

  /* ======================================================================
     Before / after comparison sliders
     ----------------------------------------------------------------------
     The range input is the single source of truth, so dragging, arrow keys
     and assistive tech all drive the same value.
     ====================================================================== */
  document.querySelectorAll('.compare').forEach(function (cmp) {
    var range = cmp.querySelector('.compare-range');
    if (!range) return;

    var apply = function () {
      cmp.style.setProperty('--pos', range.value + '%');
      range.setAttribute('aria-valuetext', range.value + '% of the after image shown');
    };
    range.addEventListener('input', apply);
    apply();

    /* Dragging anywhere on the frame feels more natural than only on the
       handle; pointer events cover mouse, pen and touch in one path. */
    var dragging = false;
    var setFromX = function (clientX) {
      var r = cmp.getBoundingClientRect();
      var pct = ((clientX - r.left) / r.width) * 100;
      range.value = Math.max(0, Math.min(100, pct));
      apply();
    };
    cmp.addEventListener('pointerdown', function (e) {
      if (e.target === range) return;         /* let the input handle itself */
      dragging = true;
      cmp.setPointerCapture(e.pointerId);
      setFromX(e.clientX);
    });
    cmp.addEventListener('pointermove', function (e) { if (dragging) setFromX(e.clientX); });
    cmp.addEventListener('pointerup', function () { dragging = false; });
    cmp.addEventListener('pointercancel', function () { dragging = false; });
  });

  /* ======================================================================
     Parallax + scroll progress
     ----------------------------------------------------------------------
     One rAF loop drives every effect. Layout is read in a single batch and
     only transforms are written, so there is no per-scroll reflow.
     ====================================================================== */
  var parallaxItems = Array.prototype.slice.call(document.querySelectorAll('.parallax'));
  var progressBar = document.querySelector('.scroll-progress');

  if ((parallaxItems.length || progressBar) && !reduceMotion.matches) {
    var pTicking = false;

    var updateScrollFx = function () {
      var vh = window.innerHeight;

      parallaxItems.forEach(function (el) {
        var box = el.getBoundingClientRect();
        if (box.bottom < -200 || box.top > vh + 200) return;
        var depth = parseFloat(el.getAttribute('data-depth')) || 0.14;
        /* -1 at the top of the viewport, +1 at the bottom. */
        var mid = (box.top + box.height / 2 - vh / 2) / (vh / 2);
        el.style.setProperty('--py', (mid * depth * 100).toFixed(2) + 'px');
      });

      if (progressBar) {
        var max = document.documentElement.scrollHeight - vh;
        progressBar.style.setProperty('--progress', max > 0 ? (window.scrollY / max).toFixed(4) : 0);
      }
      pTicking = false;
    };

    var onScrollFx = function () {
      if (pTicking) return;
      pTicking = true;
      window.requestAnimationFrame(updateScrollFx);
    };

    window.addEventListener('scroll', onScrollFx, { passive: true });
    window.addEventListener('resize', onScrollFx, { passive: true });
    updateScrollFx();
  }

  /* ======================================================================
     Reveal on scroll (+ staggered children, + heading wipes)
     ====================================================================== */
  /* `.lit` is an in-view flag with no styles of its own — it lets an element
     react to entering the viewport without the opacity fade `.reveal` implies.
     The hero rule and the portrait mask use it. */
  var reveals = document.querySelectorAll('.reveal, .stagger, .rise, .lit, .unmask, .figure');

  if (!reveals.length) {
    /* nothing to do */
  } else if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach(function (el) { io.observe(el); });

    /* Re-scan after content that was `display: none` becomes displayable.
       An element with no box never intersects, so the observer will not fire
       for it later — re-observing is what actually restarts it. Anything
       already on screen is revealed outright rather than waiting for a scroll
       the visitor may never make. */
    revealRefresh = function () {
      window.requestAnimationFrame(function () {
        reveals.forEach(function (el) {
          if (el.classList.contains('in')) return;
          var box = el.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0) {
            el.classList.add('in');
            io.unobserve(el);
          } else {
            io.unobserve(el);
            io.observe(el);
          }
        });
      });
    };

    /* Anything already on screen at load is revealed on the next frame rather
       than waiting for a scroll. Without this an above-the-fold heading inside
       a `.rise` clip stays invisible if the observer never fires — and the
       hero h1 is the worst possible thing to lose. */
    window.requestAnimationFrame(function () {
      reveals.forEach(function (el) {
        var box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) {
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    });

    /* Last-resort guard: if anything is still hidden after load (observer
       never fired, layout shifted), show it rather than leave a blank page. */
    window.addEventListener('load', function () {
      setTimeout(function () {
        reveals.forEach(function (el) {
          var box = el.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0) el.classList.add('in');
        });
      }, 400);
    });
  }

  /* If the user turns reduced-motion on mid-session, drop the animations. */
  var onMotionChange = function () {
    if (!reduceMotion.matches) return;
    document.querySelectorAll('.reveal, .stagger, .rise, .lit, .unmask, .figure').forEach(function (el) {
      el.classList.add('in');
    });
    document.querySelectorAll('.parallax').forEach(function (el) {
      el.style.removeProperty('--py');
    });
  };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);
  else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

  /* ======================================================================
     Header state
     ----------------------------------------------------------------------
     The header carries no rule while the page is at rest and gains one once
     there is content behind it. Purely presentational — without scripts the
     header simply stays in its resting state, which is a valid design.
     ====================================================================== */
  var header = document.querySelector('.site-header');
  if (header) {
    var hTicking = false;
    var syncHeader = function () {
      if (hTicking) return;
      hTicking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle('is-stuck', window.scrollY > 12);
        hTicking = false;
      });
    };
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();

    /* Anything else that pins under the header (the case filter bar, the
       page index) needs the height it currently occupies: its live height,
       or nothing while it is tucked away (below). */
    var syncHeaderH = function () {
      var h = header.classList.contains('is-away') ? 0 : header.offsetHeight;
      document.documentElement.style.setProperty('--header-h', h + 'px');
    };
    if ('ResizeObserver' in window) new ResizeObserver(syncHeaderH).observe(header);

    /* Phones and tablets: the header steps out of the way while reading
       downwards and returns the moment the visitor scrolls up, so long
       treatment pages get the full screen without losing the menu. Desktop
       keeps it pinned, where it costs far less of the height. */
    var compact = window.matchMedia('(max-width: 1060px)');
    var lastY = window.scrollY;
    var travel = 0;
    var away = false;
    var setAway = function (v) {
      if (v === away) return;
      away = v;
      header.classList.toggle('is-away', v);
      syncHeaderH();
    };
    var aTick = false;
    window.addEventListener('scroll', function () {
      if (aTick) return;
      aTick = true;
      window.requestAnimationFrame(function () {
        aTick = false;
        var y = Math.max(0, window.scrollY);
        var dy = y - lastY;
        lastY = y;
        /* Scroll-locked (menu or viewer open): leave the header alone. */
        if (!compact.matches || document.body.style.position === 'fixed') { setAway(false); return; }
        if ((dy > 0) !== (travel > 0)) travel = 0;
        travel += dy;
        if (y < 320) setAway(false);
        else if (travel > 24) setAway(true);
        else if (travel < -10) setAway(false);
      });
    }, { passive: true });
    /* Keyboard focus landing in the header always brings it back. */
    header.addEventListener('focusin', function () { setAway(false); });
    if (compact.addEventListener) compact.addEventListener('change', function () { setAway(false); });
  }

  /* ======================================================================
     Stat count-up
     ----------------------------------------------------------------------
     Counts only the numeric part, so "7,500" animates and "NABH" is left
     alone. The final text is already in the HTML — this replaces it during
     the animation and restores it exactly, so a failure mid-flight cannot
     leave a wrong number on screen.
     ====================================================================== */
  var stats = document.querySelectorAll('.stat-num');
  if (stats.length && !reduceMotion.matches && 'IntersectionObserver' in window) {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        countIO.unobserve(el);

        var final = el.textContent;
        var match = final.match(/^([^\d]*)([\d,]+)(.*)$/);
        if (!match) return;                       /* e.g. "NABH" — leave it */
        var prefix = match[1];
        var suffix = match[3];
        var target = parseInt(match[2].replace(/,/g, ''), 10);
        if (!isFinite(target) || target <= 0) return;

        var started = null;
        var DURATION = 1100;
        var step = function (now) {
          if (started === null) started = now;
          var t = Math.min((now - started) / DURATION, 1);
          /* ease-out cubic, so it settles rather than stopping dead */
          var eased = 1 - Math.pow(1 - t, 3);
          if (t < 1) {
            el.textContent = prefix + Math.round(target * eased).toLocaleString('en-IN') + suffix;
            window.requestAnimationFrame(step);
          } else {
            el.textContent = final;               /* restore verbatim */
          }
        };
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    stats.forEach(function (el) { countIO.observe(el); });
  }

  /* ======================================================================
     Current year
     ====================================================================== */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
