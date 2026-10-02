/* ==========================================================================
   Case archive admin
   --------------------------------------------------------------------------
   Talks to /api/admin/session and /api/admin/cases. A PDF is rendered to
   image pages right here in the browser with pdf.js, so the server only ever
   receives images: nothing uploaded is parsed or executed server-side.
   ========================================================================== */
(function () {
  'use strict';

  var PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/';
  var PAGE_WIDTH = 1236;          /* the width every existing case page has */
  var CARD_W = 640, CARD_H = 480; /* 4:3, as generated for the archive      */
  var MAX_PAGES = 8;
  var MAX_PAYLOAD = 3.9 * 1024 * 1024;
  var DASHES = /[\u2012\u2013\u2014\u2015]/;
  var ARROWS = /[\u2192\u21d2]/;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    mode: null, cases: [], meta: null,
    editing: null,        /* id of the case being edited, or null for a new one */
    pages: [],            /* canvases of the chosen document                   */
    newDocument: false,   /* true once a file has been chosen in this session  */
    page1: null,          /* canvas the card is cut from (new or existing)     */
    cropChanged: false,
    dirty: false,
    returnToEditor: false,
    lastSavedId: null,
  };

  /* ---------------------------------------------------------------- API */
  function api(method, path, body) {
    return fetch('/api/admin/' + path, {
      method: method,
      credentials: 'same-origin',
      headers: body || method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Admin-Request': '1' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          var err = new Error(j.error || 'The server did not respond. Check the connection and try again.');
          err.status = r.status;
          err.signedOut = !!j.signedOut;
          throw err;
        }
        return j;
      });
    }, function () {
      throw new Error('Could not reach the server. Check the internet connection and try again.');
    });
  }

  /* -------------------------------------------------------------- views */
  var views = ['view-loading', 'view-login', 'view-list', 'view-editor', 'view-done'];
  function show(id, focusId) {
    views.forEach(function (v) { $(v).hidden = v !== id; });
    $('sign-out').hidden = id === 'view-login' || id === 'view-loading';
    window.scrollTo(0, 0);
    var f = focusId && $(focusId);
    if (f) f.focus({ preventScroll: true });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function setMode(mode) {
    state.mode = mode;
    var m = $('adm-mode');
    m.hidden = !mode;
    m.className = 'adm-mode ' + (mode === 'local' ? 'is-local' : 'is-live');
    m.textContent = mode === 'local' ? 'Local preview' : 'Live site';
    m.title = mode === 'local'
      ? 'Changes are saved to this computer only, not published to the website.'
      : 'Changes are published to the website.';
  }

  /* The Tamil version of the site can be switched off (TAMIL_LIVE in
     api/_lib/cases.js). While it is, the Tamil title field is hidden and
     never sent, so a Tamil title already stored on a case is kept. */
  function tamilOn() { return !!(state.meta && state.meta.tamil); }

  function monthName(m) { return (state.meta ? state.meta.months : [])[m - 1] || ''; }
  function topicOf(id) {
    var t = (state.meta ? state.meta.topics : []).filter(function (x) { return x.id === id; })[0];
    return t || { id: id, en: id, ta: '' };
  }

  function handleAuthError(err) {
    if (err && err.signedOut) {
      state.returnToEditor = !$('view-editor').hidden || !$('view-done').hidden;
      showLogin('Your session ended. Please sign in again; nothing you entered has been lost.');
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- sign in */
  function showLogin(message) {
    show('view-login', 'password');
    var e = $('login-error');
    e.hidden = !message;
    e.textContent = message || '';
  }

  $('reveal-password').addEventListener('click', function () {
    var input = $('password');
    var on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(on));
    this.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
    input.focus();
  });

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('login-submit');
    var pw = $('password').value;
    if (!pw) { showLogin('Enter the password.'); return; }
    btn.disabled = true;
    btn.textContent = 'Signing in';
    api('POST', 'session', { password: pw }).then(function (res) {
      $('password').value = '';
      setMode(res.mode);
      if (state.returnToEditor) {
        state.returnToEditor = false;
        show('view-editor', 'editor-title');
        toast('Signed in again. You can publish now.');
        return;
      }
      return loadList();
    }).catch(function (err) {
      $('login-error').hidden = false;
      $('login-error').textContent = err.message;
      var form = $('login-form');
      form.classList.remove('is-shaking');
      void form.offsetWidth;
      form.classList.add('is-shaking');
      $('password').select();
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    });
  });

  $('sign-out').addEventListener('click', function () {
    if (state.dirty && !confirm('Leave without publishing? Your changes to this case will be lost.')) return;
    state.dirty = false;
    api('DELETE', 'session').catch(function () {}).then(function () { showLogin(''); });
  });

  /* ---------------------------------------------------------------- list */
  function loadList(flashId) {
    return api('GET', 'cases').then(function (res) {
      state.cases = res.cases;
      state.meta = res.meta;
      setMode(res.mode);
      fillFilters();
      renderList(flashId);
      show('view-list', 'list-title');
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      show('view-list');
      $('setup-banner').hidden = false;
      $('setup-banner').textContent = err.message;
      $('case-list').innerHTML = '';
    });
  }

  function fillFilters() {
    var sel = $('year-filter');
    var current = sel.value;
    var years = [];
    state.cases.forEach(function (c) { if (years.indexOf(c.year) === -1) years.push(c.year); });
    sel.innerHTML = '<option value="">All years</option>' + years.map(function (y) {
      return '<option value="' + y + '">' + y + '</option>';
    }).join('');
    sel.value = current;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.3 4.2M6.6 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    show: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  function renderList(flashId) {
    var q = $('search').value.trim().toLowerCase();
    var year = $('year-filter').value;
    var status = $('status-filter').value;
    var live = state.cases.filter(function (c) { return c.published !== false; });
    var latest = live[0];
    $('list-summary').textContent = live.length + ' on the website' +
      (state.cases.length - live.length ? ', ' + (state.cases.length - live.length) + ' hidden' : '') +
      (latest ? '. Latest: ' + monthName(latest.month) + ' ' + latest.year + '.' : '.');

    var list = $('case-list');
    list.innerHTML = '';
    var shown = 0;
    state.cases.forEach(function (c, i) {
      var isLive = c.published !== false;
      if (year && String(c.year) !== year) return;
      if (status === 'live' && !isLive) return;
      if (status === 'hidden' && isLive) return;
      if (q && (c.title + ' ' + (c.titleTa || '') + ' ' + monthName(c.month) + ' ' + c.year).toLowerCase().indexOf(q) === -1) return;
      shown += 1;

      var li = el('li', 'adm-item' + (isLive ? '' : ' is-hidden') + (c.id === flashId ? ' is-flash' : ''));
      li.style.animationDelay = Math.min(shown, 12) * 25 + 'ms';
      var img = el('img', 'adm-thumb');
      img.src = '../' + c.card.src;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 96; img.height = 72;
      li.appendChild(img);

      var body = el('div', 'adm-item-body');
      var meta = el('div', 'adm-item-meta');
      meta.appendChild(el('span', 'case-date', monthName(c.month) + ' ' + c.year));
      meta.appendChild(el('span', 'case-topic', topicOf(c.topic).en));
      meta.appendChild(el('span', 'adm-status ' + (isLive ? 'is-live' : 'is-hidden'), isLive ? 'Live' : 'Hidden'));
      body.appendChild(meta);
      body.appendChild(el('p', 'adm-item-title', c.title));
      if (c.titleTa && tamilOn()) {
        var ta = el('p', 'adm-item-ta', c.titleTa);
        ta.lang = 'ta';
        body.appendChild(ta);
      }
      li.appendChild(body);

      var actions = el('div', 'adm-item-actions');
      var edit = el('button', 'adm-icon-btn');
      edit.type = 'button';
      edit.innerHTML = ICON.edit + '<span>Edit</span>';
      edit.setAttribute('aria-label', 'Edit ' + c.title);
      edit.addEventListener('click', function () { openEditor(c); });
      var vis = el('button', 'adm-icon-btn');
      vis.type = 'button';
      vis.innerHTML = (isLive ? ICON.hide : ICON.show) + '<span>' + (isLive ? 'Hide' : 'Show') + '</span>';
      vis.setAttribute('aria-label', (isLive ? 'Hide ' : 'Show ') + c.title + (isLive ? ' from the website' : ' on the website'));
      vis.addEventListener('click', function () { toggleVisible(c, vis); });
      actions.appendChild(edit);
      actions.appendChild(vis);
      if (isLive) {
        var view = el('a', 'adm-icon-btn');
        view.href = '../case-of-the-month.html#case-' + c.id;
        view.target = '_blank';
        view.rel = 'noopener';
        view.innerHTML = ICON.view;
        view.setAttribute('aria-label', 'View ' + c.title + ' on the website (opens in a new tab)');
        actions.appendChild(view);
      }
      li.appendChild(actions);
      list.appendChild(li);
    });
    $('list-empty').hidden = shown > 0;
  }

  ['search', 'year-filter', 'status-filter'].forEach(function (id) {
    $(id).addEventListener('input', function () { renderList(); });
  });

  function toggleVisible(c, btn) {
    var makeLive = c.published === false;
    if (!makeLive && !confirm('Hide "' + c.title + '" from the website? You can show it again at any time.')) return;
    btn.setAttribute('aria-busy', 'true');
    api('PATCH', 'cases', { id: c.id, published: makeLive }).then(function () {
      toast(makeLive ? 'Shown on the website' + liveDelay() : 'Hidden from the website' + liveDelay());
      return loadList(c.id);
    }).catch(function (err) {
      btn.removeAttribute('aria-busy');
      if (!handleAuthError(err)) toast(err.message);
    });
  }

  function liveDelay() {
    return state.mode === 'local' ? ' (local preview).' : '. The site updates in about a minute.';
  }

  $('add-case').addEventListener('click', function () { openEditor(null); });

  /* -------------------------------------------------------------- editor */
  function fillSelects() {
    $('month').innerHTML = state.meta.months.map(function (m, i) {
      return '<option value="' + (i + 1) + '">' + m + '</option>';
    }).join('');
    $('topic').innerHTML = '<option value="">Choose a topic</option>' + state.meta.topics.map(function (t) {
      return '<option value="' + t.id + '">' + t.en + '</option>';
    }).join('');
    $('year').max = new Date().getFullYear() + 1;
  }

  function resetDocUi() {
    state.pages = [];
    state.newDocument = false;
    state.page1 = null;
    state.cropChanged = false;
    $('doc-pages').hidden = true;
    $('page-strip').innerHTML = '';
    $('dropzone').hidden = false;
    $('doc-progress').hidden = true;
    $('doc-error').hidden = true;
    $('crop-step').disabled = true;
    $('card-empty').hidden = false;
    var ctx = $('card-canvas').getContext('2d');
    ctx.clearRect(0, 0, CARD_W, CARD_H);
  }

  function openEditor(c) {
    fillSelects();
    resetDocUi();
    clearErrors();
    state.editing = c ? c.id : null;
    $('editor-title').textContent = c ? 'Edit case' : 'Add a case';
    $('editor-submit').textContent = c ? 'Save changes' : 'Publish case';
    var now = new Date();
    $('month').value = c ? c.month : now.getMonth() + 1;
    $('year').value = c ? c.year : now.getFullYear();
    $('title').value = c ? c.title : '';
    $('title-ta').value = c ? (c.titleTa || '') : '';
    $('title-ta').closest('.adm-field').hidden = !tamilOn();
    $('topic').value = c ? c.topic : '';
    $('published').checked = c ? c.published !== false : true;
    $('crop').value = c && c.cropY != null ? c.cropY : 0.165;

    if (c) {
      /* Existing pages: shown as they are, and page 1 is loaded (same
         origin, so the canvas stays readable) to allow re-cropping the card. */
      $('dropzone').hidden = true;
      $('doc-pages').hidden = false;
      $('replace-doc').textContent = 'Replace the document';
      c.pages.forEach(function (p, i) { addPageThumb('../' + p.src, i); });
      loadImage('../' + c.pages[0].src).then(function (img) {
        state.page1 = imageToCanvas(img, img.naturalWidth);
        $('crop-step').disabled = false;
        drawCard();
      }).catch(function () {});
    } else {
      $('replace-doc').textContent = 'Choose a different file';
    }
    updatePreview();
    state.dirty = false;
    show('view-editor', 'editor-title');
  }

  function leaveEditor() {
    if (state.dirty && !confirm('Leave without publishing? Your changes to this case will be lost.')) return;
    state.dirty = false;
    show('view-list', 'list-title');
  }
  $('editor-back').addEventListener('click', leaveEditor);
  $('editor-cancel').addEventListener('click', leaveEditor);

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  ['month', 'year', 'title', 'title-ta', 'topic', 'published'].forEach(function (id) {
    var onEdit = function () {
      state.dirty = true;
      /* The summary line only describes the last attempt; once the fields
         change it is stale, and each field keeps its own message anyway. */
      $('form-error').hidden = true;
      if (id === 'topic' || id === 'year') $(id).removeAttribute('aria-invalid');
      updatePreview();
    };
    $(id).addEventListener('input', onEdit);
    $(id).addEventListener('change', onEdit);
  });
  $('title').addEventListener('blur', function () { checkDashes('title'); });
  $('title-ta').addEventListener('blur', function () { checkDashes('title-ta'); });

  function updatePreview() {
    var m = parseInt($('month').value, 10);
    var y = parseInt($('year').value, 10);
    $('pv-date').textContent = (m && y) ? monthName(m) + ' ' + y : '';
    $('pv-title').textContent = $('title').value.trim() || 'Case title';
    var t = $('topic').value;
    $('pv-topic').textContent = t ? topicOf(t).en : 'Topic';
    var len = $('title').value.length;
    $('title-count').textContent = len ? len + ' / 200' : '';

    /* Where the case will land on the site, in plain words. */
    var note = '';
    if (m && y) {
      var others = state.cases.filter(function (c) { return c.id !== state.editing && c.published !== false; });
      var newest = others.every(function (c) { return y > c.year || (y === c.year && m >= c.month); });
      var same = others.filter(function (c) { return c.year === y && c.month === m; })[0];
      if (!$('published').checked) note = 'Hidden: saved in the admin only, not shown on the website.';
      else if (newest) note = 'This will be the latest case, featured at the top of the archive and listed on the homepage.';
      else note = 'This will be listed under ' + y + ' in the archive, in date order.';
      if (same) note += ' Note: "' + same.title + '" is also dated ' + monthName(m) + ' ' + y + '.';
    }
    $('pv-note').textContent = note;
  }

  /* --------------------------------------------------- document handling */
  var drop = $('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function () { drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) takeFile(f);
  });
  $('file').addEventListener('change', function () {
    if (this.files[0]) takeFile(this.files[0]);
    this.value = '';
  });
  $('replace-doc').addEventListener('click', function () { $('file').click(); });

  function progress(frac, text) {
    $('doc-progress').hidden = false;
    $('doc-progress-fill').style.width = Math.round(frac * 100) + '%';
    $('doc-progress-text').textContent = text;
  }

  function docError(msg) {
    $('doc-progress').hidden = true;
    $('doc-error').hidden = !msg;
    $('doc-error').textContent = msg || '';
  }

  function takeFile(file) {
    docError('');
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    var isImg = /^image\/(jpeg|png|webp)$/.test(file.type);
    if (!isPdf && !isImg) { docError('Please choose a PDF, JPG or PNG file.'); return; }
    if (file.size > 40 * 1024 * 1024) { docError('That file is over 40 MB. Please export a smaller PDF.'); return; }
    progress(0.05, isPdf ? 'Opening the PDF' : 'Reading the image');
    var job = isPdf ? renderPdf(file) : renderImage(file);
    job.then(function (canvases) {
      state.pages = canvases;
      state.newDocument = true;
      state.page1 = canvases[0];
      state.dirty = true;
      $('page-strip').innerHTML = '';
      canvases.forEach(function (cv, i) { addPageThumb(cv.toDataURL('image/jpeg', 0.6), i); });
      $('dropzone').hidden = true;
      $('doc-pages').hidden = false;
      $('doc-progress').hidden = true;
      $('crop-step').disabled = false;
      $('replace-doc').textContent = 'Choose a different file';
      drawCard();
      toast(canvases.length === 1 ? 'Page ready.' : canvases.length + ' pages ready.');
    }).catch(function (err) {
      docError(err.message || 'That file could not be read. Try exporting the PDF again.');
    });
  }

  function addPageThumb(src, i) {
    var li = el('li');
    li.style.animationDelay = i * 60 + 'ms';
    var img = el('img');
    img.src = src;
    img.alt = 'Page ' + (i + 1);
    li.appendChild(img);
    li.appendChild(el('span', null, 'Page ' + (i + 1)));
    $('page-strip').appendChild(li);
  }

  var pdfjs = null;
  function loadPdfJs() {
    if (pdfjs) return Promise.resolve(pdfjs);
    return import(PDFJS + 'build/pdf.min.mjs').then(function (lib) {
      lib.GlobalWorkerOptions.workerSrc = PDFJS + 'build/pdf.worker.min.mjs';
      pdfjs = lib;
      return lib;
    }, function () {
      throw new Error('The PDF reader could not load. Check the internet connection and try again.');
    });
  }

  function renderPdf(file) {
    var task = null;
    return Promise.all([loadPdfJs(), file.arrayBuffer()]).then(function (r) {
      /* Keep the loading task: in pdf.js 5+ it, not the document, is what
         frees the worker and memory afterwards. */
      task = r[0].getDocument({
        data: new Uint8Array(r[1]),
        cMapUrl: PDFJS + 'cmaps/', cMapPacked: true,
        standardFontDataUrl: PDFJS + 'standard_fonts/',
        wasmUrl: PDFJS + 'wasm/', iccUrl: PDFJS + 'iccs/',
        isEvalSupported: false,
      });
      return task.promise;
    }).then(function (d) {
      if (d.numPages > MAX_PAGES) throw new Error('This PDF has ' + d.numPages + ' pages. A case can have at most ' + MAX_PAGES + '.');
      var out = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= d.numPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            progress(0.1 + 0.85 * (n - 1) / d.numPages, 'Preparing page ' + n + ' of ' + d.numPages);
            return d.getPage(n);
          }).then(function (page) {
            var base = page.getViewport({ scale: 1 });
            var vp = page.getViewport({ scale: PAGE_WIDTH / base.width });
            var cv = document.createElement('canvas');
            cv.width = Math.round(vp.width);
            cv.height = Math.round(vp.height);
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            /* 'print' intent: pdf.js paces 'display' renders on
               requestAnimationFrame, which stops while the tab is in the
               background, so switching tabs mid-upload froze the render. */
            return page.render({ canvas: cv, viewport: vp, intent: 'print' }).promise.then(function () { out.push(cv); });
          });
        })(i);
      }
      return chain.then(function () { return out; });
    }).finally(function () {
      if (task) task.destroy();
    }).catch(function (err) {
      /* The visitor-facing message is generic; the real cause goes to the
         console for whoever has to debug a file that will not open. */
      if (window.console) console.error('PDF render failed:', err);
      if (err && err.name === 'PasswordException') throw new Error('That PDF is password protected. Please export it without a password.');
      if (err && /at most|could not load/.test(err.message)) throw err;
      throw new Error('That PDF could not be read. Try exporting it again, or upload a JPG of the page.');
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That image could not be read.')); };
      img.src = src;
    });
  }

  function imageToCanvas(img, width) {
    var w = Math.min(width, PAGE_WIDTH);
    var h = Math.round(img.naturalHeight * w / img.naturalWidth);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return cv;
  }

  function renderImage(file) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < 600) throw new Error('That image is only ' + img.naturalWidth + ' pixels wide. Please use a larger export (at least 1000 pixels) so it reads clearly.');
      progress(0.8, 'Preparing the page');
      return [imageToCanvas(img, img.naturalWidth)];
    });
  }

  /* The card is a 4:3 window onto page 1, starting cropY down the page. */
  function cardSource() {
    var src = state.page1;
    var h = Math.round(src.width * CARD_H / CARD_W);
    var y = Math.round(src.height * parseFloat($('crop').value));
    y = Math.max(0, Math.min(y, src.height - h));
    return { x: 0, y: y, w: src.width, h: Math.min(h, src.height) };
  }

  function drawCard(target) {
    if (!state.page1) return;
    var cv = target || $('card-canvas');
    var ctx = cv.getContext('2d');
    var s = cardSource();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.page1, s.x, s.y, s.w, s.h, 0, 0, CARD_W, CARD_H);
    $('card-empty').hidden = true;
  }

  $('crop').addEventListener('input', function () {
    state.cropChanged = true;
    state.dirty = true;
    drawCard();
  });

  /* ---------------------------------------------------------- validation */
  function clearErrors() {
    ['title-error', 'title-ta-error', 'form-error', 'doc-error'].forEach(function (id) { $(id).hidden = true; });
    ['title', 'title-ta', 'topic', 'year'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
  }

  function fieldError(field, errId, msg, fix) {
    var box = $(errId);
    box.hidden = false;
    box.textContent = msg;
    $(field).setAttribute('aria-invalid', 'true');
    if (fix) {
      var b = el('button', null, fix.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        $(field).value = fix.apply($(field).value);
        box.hidden = true;
        $(field).removeAttribute('aria-invalid');
        state.dirty = true;
        updatePreview();
        $(field).focus();
      });
      box.appendChild(b);
    }
  }

  /* House style: no long dashes or arrow symbols in site copy. Offer the
     fix rather than just refusing, since they often arrive by copy-paste. */
  function undash(v) {
    var first = true;
    return v
      .replace(/\s*[\u2192\u21d2]\s*/g, ' to ')
      .replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, function () {
        var r = first ? ': ' : ', ';
        first = false;
        return r;
      })
      .replace(/\s+/g, ' ').trim();
  }

  function checkDashes(id) {
    var v = $(id).value;
    var errId = id === 'title' ? 'title-error' : 'title-ta-error';
    if (DASHES.test(v) || ARROWS.test(v)) {
      fieldError(id, errId, 'Long dashes and arrows are not used in the site text.', { label: 'Replace with a colon', apply: undash });
      return false;
    }
    $(errId).hidden = true;
    $(id).removeAttribute('aria-invalid');
    return true;
  }

  function validate() {
    clearErrors();
    var ok = true;
    var first = null;
    var title = $('title').value.trim();
    if (title.length < 4) { fieldError('title', 'title-error', 'Add the case title.'); ok = false; first = first || 'title'; }
    else if (!checkDashes('title')) { ok = false; first = first || 'title'; }
    if (tamilOn() && !checkDashes('title-ta')) { ok = false; first = first || 'title-ta'; }
    if (!$('topic').value) { $('topic').setAttribute('aria-invalid', 'true'); ok = false; first = first || 'topic'; }
    var y = parseInt($('year').value, 10);
    if (!(y >= 2000 && y <= new Date().getFullYear() + 1)) { $('year').setAttribute('aria-invalid', 'true'); ok = false; first = first || 'year'; }
    if (!state.editing && !state.newDocument) {
      docError('Add the case document (PDF, JPG or PNG).');
      ok = false; first = first || 'file';
    }
    if (!ok) {
      $('form-error').hidden = false;
      $('form-error').textContent = 'A few things need attention before publishing.';
      var f = $(first);
      if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); }
    }
    return ok;
  }

  /* ------------------------------------------------------------- publish */
  /* WebP where the browser can encode it (Chrome, Edge, Firefox): about half
     the size of the same page as JPEG. Elsewhere toBlob quietly returns PNG
     for an unknown type, so support is checked once up front. */
  var WEBP = (function () {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 1;
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (err) { return false; }
  })();

  function encodeImage(canvas, quality, type) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        var r = new FileReader();
        r.onload = function () { resolve(String(r.result).split(',')[1]); };
        r.readAsDataURL(blob);
      }, type || 'image/jpeg', quality);
    });
  }

  function encodeDocument() {
    var card = document.createElement('canvas');
    card.width = CARD_W; card.height = CARD_H;
    drawCard(card);
    var cardJob = encodeImage(card, 0.74);
    if (!state.newDocument) return cardJob.then(function (c) { return { card: c }; });

    /* Keep the whole upload under the hosting limit: step the quality down
       until it fits, instead of failing a large scanned PDF. */
    var qualities = WEBP ? [0.84, 0.78, 0.7, 0.6, 0.5] : [0.86, 0.78, 0.7, 0.6, 0.5];
    var pageType = WEBP ? 'image/webp' : 'image/jpeg';
    function attempt(i) {
      return Promise.all(state.pages.map(function (cv) { return encodeImage(cv, qualities[i], pageType); })).then(function (pages) {
        return cardJob.then(function (c) {
          var size = pages.reduce(function (s, p) { return s + p.length; }, c.length);
          if (size > MAX_PAYLOAD && i < qualities.length - 1) return attempt(i + 1);
          if (size > MAX_PAYLOAD) throw new Error('This document is too large to upload. Try a PDF with fewer pages.');
          return { pages: pages, card: c };
        });
      });
    }
    return attempt(0);
  }

  function doneView(stateName, title, text) {
    var icon = $('done-icon');
    icon.className = 'adm-done-icon' + (stateName === 'done' ? ' is-done' : stateName === 'error' ? ' is-error' : '');
    $('done-title').textContent = title;
    $('done-text').textContent = text;
    $('done-actions').hidden = stateName === 'busy';
  }

  $('editor-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;
    var editingId = state.editing;
    var sendDoc = state.newDocument || (editingId && state.cropChanged);
    show('view-done', 'done-title');
    doneView('busy', editingId ? 'Saving' : 'Publishing', sendDoc ? 'Preparing the images' : 'Saving the details');
    $('done-another').hidden = false;

    var docJob = sendDoc ? encodeDocument() : Promise.resolve(null);
    docJob.then(function (doc) {
      doneView('busy', editingId ? 'Saving' : 'Publishing', state.mode === 'local' ? 'Saving to this computer' : 'Publishing to the website');
      var body = {
        month: parseInt($('month').value, 10),
        year: parseInt($('year').value, 10),
        title: $('title').value.trim(),
        topic: $('topic').value,
        published: $('published').checked,
        cropY: parseFloat($('crop').value),
      };
      if (tamilOn()) body.titleTa = $('title-ta').value.trim();
      if (doc && doc.pages) {
        body.pages = doc.pages.map(function (data, i) { return { data: data, w: state.pages[i].width, h: state.pages[i].height }; });
      }
      if (doc) body.card = { data: doc.card, w: CARD_W, h: CARD_H };
      if (editingId) body.id = editingId;
      return api(editingId ? 'PATCH' : 'POST', 'cases', body);
    }).then(function (res) {
      state.dirty = false;
      state.lastSavedId = res.case.id;
      var live = res.case.published !== false;
      $('done-view').hidden = !live;
      $('done-view').href = '../case-of-the-month.html#case-' + res.case.id;
      doneView('done', editingId ? 'Saved' : (live ? 'Published' : 'Saved as hidden'),
        state.mode === 'local'
          ? 'Saved to this computer (local preview). Reload the case archive page to see it.'
          : live ? 'The website will show it in about a minute, once the update finishes deploying.'
                 : 'It is saved in the admin and hidden from the website until you choose Show.');
      $('done-title').focus();
      return api('GET', 'cases').then(function (r) { state.cases = r.cases; }).catch(function () {});
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      doneView('error', 'Not published', err.message + ' Your case is still in the form.');
      $('done-view').hidden = true;
      $('done-another').hidden = true;
      $('done-list').textContent = 'Back to the form';
      $('done-list').dataset.back = 'editor';
    });
  });

  $('done-list').addEventListener('click', function () {
    if (this.dataset.back === 'editor') {
      delete this.dataset.back;
      this.textContent = 'Back to all cases';
      show('view-editor', 'editor-title');
      return;
    }
    fillFilters();
    renderList(state.lastSavedId);
    show('view-list', 'list-title');
  });
  $('done-another').addEventListener('click', function () { openEditor(null); });

  /* ---------------------------------------------------------------- boot */
  api('GET', 'session').then(function (s) {
    setMode(s.mode);
    if (!s.configured) {
      showLogin('The admin password has not been set up yet. See "Admin panel" in the project handoff notes.');
      return;
    }
    if (s.signedIn) return loadList();
    showLogin('');
  }).catch(function (err) { showLogin(err.message); });
})();
