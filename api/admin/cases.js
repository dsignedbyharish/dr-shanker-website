/* GET   /api/admin/cases   → every case (hidden ones too) + the topic/month lists
   POST  /api/admin/cases   → add a case: fields + page images + card image
   PATCH /api/admin/cases   → edit a case's fields, visibility, or document

   Images arrive already rendered by the admin page (a PDF is drawn to WebP or
   JPEG in the browser with pdf.js), so this function never parses a PDF. It checks
   that each image really is a JPEG or WebP of sane size, names it by its content
   hash, and hands everything to the store to publish as one change. */
'use strict';

const crypto = require('crypto');
const auth = require('../_lib/auth.js');
const store = require('../_lib/store.js');
const cases = require('../_lib/cases.js');
const { send, fail, readJson, httpError, isSameSiteWrite } = require('../_lib/http.js');

const MAX_PAGES = 8;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const DIR = 'assets/images/cases/';

/* JPEG everywhere; WebP from browsers that can encode it (about half the
   size for the same poster). The extension follows the actual bytes. */
function decodeImage(img, label) {
  if (!img || typeof img.data !== 'string') throw httpError(400, 'The ' + label + ' image is missing.');
  const buf = Buffer.from(img.data, 'base64');
  const jpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (buf.length < 1000 || !(jpeg || webp)) {
    throw httpError(400, 'The ' + label + ' image could not be read. Please choose the file again.');
  }
  if (buf.length > MAX_IMAGE_BYTES) throw httpError(413, 'The ' + label + ' image is too large.');
  const w = parseInt(img.w, 10);
  const h = parseInt(img.h, 10);
  if (!(w >= 200 && w <= 4000 && h >= 150 && h <= 6000)) throw httpError(400, 'The ' + label + ' image has unexpected dimensions.');
  return { buffer: buf, w: w, h: h, ext: webp ? '.webp' : '.jpg', hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8) };
}

/* Page + card images for a case, with content-hashed names: /assets is
   cached for a year, so a replaced document must get a new URL. */
function documentFiles(id, body) {
  if (!Array.isArray(body.pages) || !body.pages.length) throw httpError(400, 'Add the case document first.');
  if (body.pages.length > MAX_PAGES) throw httpError(400, 'A case can have at most ' + MAX_PAGES + ' pages.');
  const files = [];
  const pages = body.pages.map(function (p, i) {
    const img = decodeImage(p, 'page ' + (i + 1));
    const file = DIR + id + '-p' + (i + 1) + '-' + img.hash + img.ext;
    files.push({ path: file, buffer: img.buffer });
    return { src: file, w: img.w, h: img.h };
  });
  const cardImg = decodeImage(body.card, 'card');
  const cardPath = DIR + id + '-card-' + cardImg.hash + cardImg.ext;
  files.push({ path: cardPath, buffer: cardImg.buffer });
  const cropY = Math.min(0.6, Math.max(0, Number(body.cropY) || 0));
  return { files: files, pages: pages, card: { src: cardPath, w: cardImg.w, h: cardImg.h }, cropY: Math.round(cropY * 1000) / 1000 };
}

function label(c) {
  return cases.MONTHS_EN[c.month - 1] + ' ' + c.year + ', ' + c.title;
}

module.exports = async function handler(req, res) {
  try {
    if (!auth.signedIn(req)) return fail(res, 401, 'Please sign in again.', { signedOut: true });

    if (req.method === 'GET') {
      const data = await store.read();
      return send(res, 200, {
        ok: true,
        mode: store.mode(),
        cases: cases.sortCases(data.cases),
        meta: {
          topics: Object.keys(cases.TOPICS).map(function (k) {
            return cases.TAMIL_LIVE ? { id: k, en: cases.TOPICS[k].en, ta: cases.TOPICS[k].ta } : { id: k, en: cases.TOPICS[k].en };
          }),
          months: cases.MONTHS_EN,
          tamil: cases.TAMIL_LIVE,
        },
      });
    }

    if (!isSameSiteWrite(req)) return fail(res, 403, 'Request refused.');
    const body = await readJson(req);
    const data = await store.read();
    const list = data.cases.slice();

    if (req.method === 'POST') {
      const fields = cases.cleanFields(body);
      const id = cases.makeId(fields.year, fields.month, fields.title, list.map(function (c) { return c.id; }));
      const doc = documentFiles(id, body);
      const entry = Object.assign({ id: id }, fields, { pages: doc.pages, card: doc.card, cropY: doc.cropY, added: new Date().toISOString().slice(0, 10) });
      list.push(entry);
      const result = await store.publish({
        cases: list,
        files: doc.files,
        message: 'Case of the Month: add ' + label(entry) + (entry.published ? '' : ' (hidden)'),
      });
      return send(res, 201, { ok: true, case: entry, result: result });
    }

    if (req.method === 'PATCH') {
      const i = list.findIndex(function (c) { return c.id === body.id; });
      if (i === -1) throw httpError(404, 'That case no longer exists. Refresh the list and try again.');
      const current = list[i];
      const fields = cases.cleanFields(Object.assign({}, current, body));
      let next = Object.assign({}, current, fields, { updated: new Date().toISOString().slice(0, 10) });
      let files = [];
      if (body.pages) {
        const doc = documentFiles(current.id, body);
        files = doc.files;
        next = Object.assign(next, { pages: doc.pages, card: doc.card, cropY: doc.cropY });
      } else if (body.card) {
        /* Re-cropped card, same document. */
        const cardImg = decodeImage(body.card, 'card');
        const cardPath = DIR + current.id + '-card-' + cardImg.hash + cardImg.ext;
        files = [{ path: cardPath, buffer: cardImg.buffer }];
        const cropY = Math.min(0.6, Math.max(0, Number(body.cropY) || 0));
        next = Object.assign(next, { card: { src: cardPath, w: cardImg.w, h: cardImg.h }, cropY: Math.round(cropY * 1000) / 1000 });
      }
      list[i] = next;
      const what = body.pages ? 'replace document for'
        : body.card && current.published === next.published ? 'recrop card for'
        : current.published !== next.published ? (next.published ? 'show' : 'hide')
        : 'edit';
      const result = await store.publish({ cases: list, files: files, message: 'Case of the Month: ' + what + ' ' + label(next) });
      return send(res, 200, { ok: true, case: next, result: result });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return fail(res, 405, 'Method not allowed.');
  } catch (err) {
    if (!err.status) console.error(err);
    return fail(res, err.status || 500, err.status ? err.message : 'Something went wrong while publishing. Nothing was changed; please try again.');
  }
};
