/* Where published cases are written.

   github (production): every publish is one commit to the site's repo, made
     through the GitHub API. Vercel deploys each push to main, so a new case
     goes live about a minute later, and every change is in git history and
     can be reverted like any other commit. Needs GITHUB_TOKEN (a fine-grained
     token with Contents: read and write on this one repository).
   local (development): the same files are written straight to this checkout,
     so the whole flow can be tried on localhost without touching GitHub.

   Either way the published change is the same set of files: the new images,
   data/cases.json, and the regenerated blocks in case-of-the-month.html,
   index.html and sitemap.xml. */
'use strict';

const fs = require('fs');
const path = require('path');
const cases = require('./cases.js');
const { httpError } = require('./http.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = 'data/cases.json';
const PAGES = { archive: 'case-of-the-month.html', home: 'index.html' };
const SITEMAP = 'sitemap.xml';

function mode() {
  if (process.env.CASES_STORAGE === 'local') return 'local';
  return 'github';
}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'dsignedbyharish/dr-shanker-website';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) {
    throw httpError(503, 'Publishing is not set up yet: GITHUB_TOKEN is missing from the Vercel project settings.');
  }
  return { token: token, repo: repo, branch: branch };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* Turns the current pages + the new case list into the text files to write. */
function renderAll(text, list) {
  const pages = cases.renderPages({ archive: text.archive, home: text.home }, list);
  return [
    { path: DATA, content: JSON.stringify({ version: 1, cases: cases.sortCases(list) }, null, 2) + '\n' },
    { path: PAGES.archive, content: pages.archive },
    { path: PAGES.home, content: pages.home },
    { path: SITEMAP, content: cases.touchSitemap(text.sitemap, today()) },
  ];
}

/* ---------- local ---------- */
const local = {
  read: function () {
    const raw = fs.readFileSync(path.join(ROOT, DATA), 'utf8');
    return { cases: JSON.parse(raw).cases };
  },
  publish: function (change) {
    const text = {
      archive: fs.readFileSync(path.join(ROOT, PAGES.archive), 'utf8'),
      home: fs.readFileSync(path.join(ROOT, PAGES.home), 'utf8'),
      sitemap: fs.readFileSync(path.join(ROOT, SITEMAP), 'utf8'),
    };
    const out = renderAll(text, change.cases);
    (change.files || []).forEach(function (f) {
      const abs = path.join(ROOT, f.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.buffer);
    });
    out.forEach(function (f) { fs.writeFileSync(path.join(ROOT, f.path), f.content); });
    return { mode: 'local' };
  },
};

/* ---------- github ---------- */
function gh(cfg, method, url, body) {
  return fetch('https://api.github.com/repos/' + cfg.repo + url, {
    method: method,
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sdcc-admin',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(function (r) {
    return r.text().then(function (t) {
      let json = null;
      try { json = t ? JSON.parse(t) : null; } catch (e) { json = null; }
      if (!r.ok) {
        const err = httpError(r.status === 401 || r.status === 403 ? 502 : r.status >= 500 ? 502 : r.status,
          r.status === 401 || r.status === 403
            ? 'GitHub refused the request. The GITHUB_TOKEN may have expired or lack write access to the repository.'
            : 'GitHub returned an error (' + r.status + '). Please try again in a minute.');
        err.githubStatus = r.status;
        throw err;
      }
      return json;
    });
  });
}

function ghText(cfg, file, ref) {
  return gh(cfg, 'GET', '/contents/' + encodeURIComponent(file).replace(/%2F/g, '/') + '?ref=' + encodeURIComponent(ref))
    .then(function (j) { return Buffer.from(j.content, 'base64').toString('utf8'); });
}

const github = {
  read: function () {
    const cfg = githubConfig();
    return ghText(cfg, DATA, cfg.branch).then(function (raw) { return { cases: JSON.parse(raw).cases }; });
  },

  publish: function (change, attempt) {
    const cfg = githubConfig();
    let headSha;
    let baseTree;
    return gh(cfg, 'GET', '/git/ref/heads/' + cfg.branch)
      .then(function (ref) {
        headSha = ref.object.sha;
        return gh(cfg, 'GET', '/git/commits/' + headSha);
      })
      .then(function (commit) {
        baseTree = commit.tree.sha;
        /* Read the pages at exactly the commit being built on, so a parallel
           edit elsewhere is never silently overwritten. */
        return Promise.all([
          ghText(cfg, PAGES.archive, headSha),
          ghText(cfg, PAGES.home, headSha),
          ghText(cfg, SITEMAP, headSha),
        ]);
      })
      .then(function (t) {
        const out = renderAll({ archive: t[0], home: t[1], sitemap: t[2] }, change.cases);
        return Promise.all((change.files || []).map(function (f) {
          return gh(cfg, 'POST', '/git/blobs', { content: f.buffer.toString('base64'), encoding: 'base64' })
            .then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
        })).then(function (blobs) {
          const tree = blobs.concat(out.map(function (f) {
            return { path: f.path, mode: '100644', type: 'blob', content: f.content };
          }));
          return gh(cfg, 'POST', '/git/trees', { base_tree: baseTree, tree: tree });
        });
      })
      .then(function (tree) {
        return gh(cfg, 'POST', '/git/commits', { message: change.message, tree: tree.sha, parents: [headSha] });
      })
      .then(function (commit) {
        return gh(cfg, 'PATCH', '/git/refs/heads/' + cfg.branch, { sha: commit.sha, force: false })
          .then(function () { return { mode: 'github', commit: commit.sha }; });
      })
      .catch(function (err) {
        /* 422 on the ref update: someone pushed in between. Rebuild on the
           new head once rather than failing the upload. */
        if (err.githubStatus === 422 && !attempt) return github.publish(change, 1);
        throw err;
      });
  },
};

function backend() {
  return mode() === 'local' ? local : github;
}

module.exports = {
  mode: mode,
  read: function () { return Promise.resolve().then(function () { return backend().read(); }); },
  publish: function (change) { return Promise.resolve().then(function () { return backend().publish(change); }); },
};
