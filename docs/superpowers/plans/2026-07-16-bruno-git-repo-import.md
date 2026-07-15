# Bruno Git Repo Import + View Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** View a **native Bruno collection** stored in a public git repo (a tree of `.bru`/`.yml` files + `bruno.json`, not a single `opencollection.yml`) in bruno-docs-viewer, by URL — on any git host, and for **monorepos** that hold several collections, matching the desktop: discover all collections in the repo and let the user pick which to open.

**Architecture:** A serverless function `git-import`, mirroring the existing Postman import (`api/lib/import-core.js` + host adapters). It **clones the repo server-side with `isomorphic-git`** (shallow, single-branch) into a temp directory — host-agnostic, so GitHub, GitLab, Bitbucket, and self-hosted git all work over git smart-HTTP. It then discovers every collection in the clone (each directory with a `bruno.json` **or** `opencollection.yml` root marker) using the ported `@usebruno/cli` loader. If a specific collection is targeted (or the repo has exactly one), it loads that collection with `createCollectionJsonFromPathname`, converts it with `@usebruno/converters`' `brunoToOpenCollection`, and returns OpenCollection YAML. If the repo has **several** collections and none is targeted, it returns the **list** (`{ name, path }[]`) and the viewer shows a picker; picking one navigates to `?git_url=…&path=<dir>` (a shareable per-collection URL) which imports just that collection. The viewer's existing fast GitHub `opencollection.yml` fetch stays as an optimization and falls back to the function for everything else (a native `.bru`/`.yml` repo, a monorepo, or any non-GitHub host). Results are cached in IndexedDB like Postman imports.

**Why server-side + clone:** server-side needs no CORS proxy (CORS is a browser constraint), so one `isomorphic-git` clone works for **any** git host in a single operation — no per-host API adapters, no GitHub-only Trees API, no rate-limit fan-out. It's consistent with the project's stance that public data may be proxied (see the resolve-stage plan's guiding-constraint note) and mirrors the Postman function's shape. The repo is public, so nothing private is routed through the server.

**Reuse, don't reinvent:** the desktop app + `@usebruno/cli` already implement directory→collection loading. `@usebruno/cli`'s `createCollectionJsonFromPathname` (in `packages/bruno-cli/src/utils/collection.js`) walks a collection directory into the canonical Bruno collection JSON, handling **both formats** via its `FORMAT_CONFIG` — `bru` (`bruno.json` / `collection.bru` / `folder.bru` / `.bru`) and `yml` (`opencollection.yml` / folder.yml / `.yml`) — plus folder/request markers, environments, and seq/name ordering. It's a deep internal (not a public package export) and pulls in CLI-only deps (chalk, `process.exit`), so we **port** it (verbatim logic, CLI-isms stripped) and keep it in sync. This clones to a **real temp dir** (`os.tmpdir()`, writable + ephemeral in serverless) so the fs-based loader runs unchanged.

**Tech Stack:** Node serverless function (Vercel + Netlify adapters), `isomorphic-git` + `isomorphic-git/http/node` (clone into a temp dir on node `fs`), `@usebruno/filestore` (the per-file parsers the loader uses), `@usebruno/converters`, `js-yaml`, Node 18+. Frontend: TypeScript, React, Vitest.

**Scope:** public git repos on the `git_url` source (GitHub / GitLab / Bitbucket / self-hosted), including **monorepos with multiple collections** (discover + pick), plus the `path` subdir to target one directly. **URL contract:** a `.git` clone URL (any host) or a known-host web URL (github/gitlab/bitbucket); other self-hosted **web** URLs are best-effort — pass the `.git` URL for those. Out of scope, noted for later: private/authenticated repos, and a rebuild-free client-side path (a browser clone needs a CORS proxy, which we're not adding here). "Open in Bruno" for repos already works and is unchanged.

**Security (SSRF):** the function clones a user-supplied URL, a classic SSRF vector. The clone URL (and every request the git client makes, including redirects) MUST pass a guard: `https:` only, and a **private/loopback/link-local/cloud-metadata denylist** (block `localhost`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, IP literals, and `*.internal`). A default host allowlist (`github.com`, `gitlab.com`, `bitbucket.org`) is applied, **extendable via `GIT_IMPORT_ALLOWED_HOSTS`** for self-hosted instances. This is called out as its own task (Task 1) and is a blocking review item.

---

## File Structure

**New (serverless):**
- `api/lib/git-clone.js` — host-agnostic git access: `normalizeGitSource(gitUrl, path)` → `{ cloneUrl, ref, subdir }` (understands GitHub `/tree/`, GitLab `/-/tree/`, Bitbucket `/src/`, GitLab subgroups, and bare `.git` clone URLs); `assertCloneAllowed(url)` (SSRF guard — https-only + private-range denylist + host allowlist); and `cloneToTempDir({ cloneUrl, ref })` which shallow-clones with `isomorphic-git` into a fresh `os.tmpdir()` directory (node `fs`) and returns its path. No Bruno knowledge.
- `api/lib/collection-loader.js` — **ported from `@usebruno/cli`** (`createCollectionJsonFromPathname`, `getCollectionFormat`, `getCollectionConfig`, `getFolderRoot`, `FORMAT_CONFIG`, `sortByNameThenSequence`), CLI-isms removed (no chalk/`process.exit`; invalid files skipped quietly). Plus `findCollections(rootDir)`: walk for directories where `getCollectionFormat` is non-null. Uses `@usebruno/filestore` + node `fs`.
- `api/lib/git-core.js` — `importGitRepo({ gitUrl, path })`: pipeline (normalize → clone to temp → discover → `createCollectionJsonFromPathname` → `brunoToOpenCollection` → YAML → **rm temp dir**). Mirrors `import-core.js`.

**Dependencies added to the function** (`package.json`): `isomorphic-git` (clones onto node `fs`; no memfs needed).
- `api/git-import.js` — Vercel handler (`export default (req, res)`), mirrors `api/postman-import.js`.
- `netlify/functions/git-import.mjs` — Netlify v2 adapter over `git-core.js`, mirrors `netlify/functions/postman-import.mjs`.

**New (frontend):**
- `src/git/gitImport.ts` — `runGitImport({ gitUrl, path })` POSTs to `/api/git-import`; mirrors `postman/postmanImport.ts`'s `runPostmanImport`.

**Modified:**
- `src/ui/SourceView.tsx` — when a repo source's `opencollection.yml` fetch fails with `not-found`, fall back to `runGitImport`; cache-first via `importCache`.
- `src/storage/importCache.ts` — allow a `git` cache key alongside `postman` (or add a sibling helper).
- `netlify.toml` — redirect `/api/git-import` to the function.
- `README.md`, `ARCHITECTURE.md` — document the new function.

**Dependency direction:** `git-clone.js` and `collection-loader.js` depend on nothing project-internal; `git-core.js` composes them. The Vercel/Netlify entrypoints are thin adapters. The frontend `git/` layer is plain TS (no React), unit-tested without a DOM.

**Highest-risk task:** Task 3's end-to-end shape — that `brunoToOpenCollection` accepts the collection JSON produced by the ported `createCollectionJsonFromPathname`. Porting the CLI's proven loader (rather than hand-assembling) removes most of this risk; the real-repo integration test in Task 3 is the guard. Keep `collection-loader.js` in sync with `@usebruno/cli` (note the source commit in a header comment).

---

### Task 1: Host-agnostic git access — URL normalize, SSRF guard, shallow clone

**Files:**
- Create: `api/lib/git-clone.js`
- Test: `api/lib/git-clone.spec.js`
- Modify: `package.json` (add `isomorphic-git`)

- [ ] **Step 1: Add the dependency**

Run: `npm i isomorphic-git`
Expected: added to `dependencies` (it clones onto node `fs`; no memfs needed).

- [ ] **Step 2: Write the failing test (pure functions: normalize + SSRF guard)**

```js
// api/lib/git-clone.spec.js
import { describe, it, expect } from 'vitest';
import { normalizeGitSource, assertCloneAllowed } from './git-clone.js';

describe('normalizeGitSource', () => {
  it('github web URL with /tree/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://github.com/org/repo/tree/main/apis/users', '')).toEqual({
      cloneUrl: 'https://github.com/org/repo.git', ref: 'main', subdir: 'apis/users'
    });
  });

  it('github .git clone URL (+ path param)', () => {
    expect(normalizeGitSource('https://github.com/usebruno/bruno-testbench.git', 'apis')).toEqual({
      cloneUrl: 'https://github.com/usebruno/bruno-testbench.git', ref: undefined, subdir: 'apis'
    });
  });

  it('gitlab web URL with /-/tree/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://gitlab.com/org/repo/-/tree/dev/sub', '')).toEqual({
      cloneUrl: 'https://gitlab.com/org/repo.git', ref: 'dev', subdir: 'sub'
    });
  });

  it('bitbucket web URL with /src/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://bitbucket.org/org/repo/src/main/sub', '')).toEqual({
      cloneUrl: 'https://bitbucket.org/org/repo.git', ref: 'main', subdir: 'sub'
    });
  });

  it('gitlab subgroups with /-/tree/', () => {
    expect(normalizeGitSource('https://gitlab.com/grp/sub/repo/-/tree/main/apis', '')).toEqual({
      cloneUrl: 'https://gitlab.com/grp/sub/repo.git', ref: 'main', subdir: 'apis'
    });
  });

  it('self-hosted .git URL at any depth (host-agnostic)', () => {
    expect(normalizeGitSource('https://git.acme.io/team/group/project.git', 'collections/orders')).toEqual({
      cloneUrl: 'https://git.acme.io/team/group/project.git', ref: undefined, subdir: 'collections/orders'
    });
  });
});

describe('assertCloneAllowed (SSRF guard)', () => {
  it('allows the default public hosts over https', () => {
    expect(() => assertCloneAllowed('https://github.com/o/r.git')).not.toThrow();
    expect(() => assertCloneAllowed('https://gitlab.com/o/r.git')).not.toThrow();
    expect(() => assertCloneAllowed('https://bitbucket.org/o/r.git')).not.toThrow();
  });

  it('blocks non-https', () => {
    expect(() => assertCloneAllowed('http://github.com/o/r.git')).toThrow(/https/i);
  });

  it('blocks private / loopback / metadata / unknown hosts', () => {
    expect(() => assertCloneAllowed('https://localhost/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://127.0.0.1/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://169.254.169.254/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://10.0.0.5/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://git.internal.corp/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://evil.example.com/o/r.git')).toThrow(/allowed/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run api/lib/git-clone.spec.js`
Expected: FAIL — cannot find module `./git-clone.js`.

- [ ] **Step 4: Write minimal implementation**

```js
// api/lib/git-clone.js
import http from 'isomorphic-git/http/node/index.js';
import * as git from 'isomorphic-git';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Default public git hosts. Extend for self-hosted via GIT_IMPORT_ALLOWED_HOSTS
// (comma-separated hostnames).
const DEFAULT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];
const allowedHosts = () => {
  const extra = (process.env.GIT_IMPORT_ALLOWED_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set([...DEFAULT_HOSTS, ...extra]);
};

const fail = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const isBlockedHost = (host) => {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.internal') || h.endsWith('.local')) return true;
  // IPv6 loopback / unique-local.
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  // IPv4 literals in private / loopback / link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;          // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;          // 192.168/16
  }
  return false;
};

/** SSRF guard: https only, no private/loopback/metadata hosts, allowlisted host. */
export function assertCloneAllowed(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    fail('Invalid repository URL.');
  }
  if (u.protocol !== 'https:') fail('Only https git URLs are supported.');
  const host = u.hostname.toLowerCase();
  if (isBlockedHost(host)) fail('That host is not allowed.', 400);
  if (!allowedHosts().has(host)) {
    fail('That git host is not on the allowed list. Set GIT_IMPORT_ALLOWED_HOSTS to add it.', 400);
  }
}

/**
 * Normalize a repo web/clone URL (+ optional path) into { cloneUrl, ref, subdir }.
 * Handles, in order: an explicit `.git` anywhere in the path (any host, any depth
 * incl. GitLab subgroups); the three big hosts' subtree web URLs; and a
 * best-effort fallback for unknown hosts (clone the whole path). The `path`
 * param always appends to the subdir — the reliable way to target a monorepo
 * collection on any host.
 */
export function normalizeGitSource(gitUrl, path = '') {
  const u = new URL(gitUrl);
  const host = u.hostname.toLowerCase();
  const full = u.pathname.replace(/^\/+/, '');
  let repoPath;
  let ref;
  let subdir = '';

  const dotGit = full.match(/^(.+?\.git)(?:\/.*)?$/i);
  if (dotGit) {
    // Explicit clone URL — host/depth agnostic. In-repo ref/subdir isn't
    // reliably encoded here; use the `path` param for a subdir.
    repoPath = dotGit[1].replace(/\.git$/i, '');
  } else if (host === 'github.com') {
    const seg = full.split('/');
    repoPath = seg.slice(0, 2).join('/');
    if (seg[2] === 'tree' && seg[3]) { ref = seg[3]; subdir = seg.slice(4).join('/'); }
  } else if (host === 'gitlab.com') {
    const idx = full.indexOf('/-/'); // subgroups: owner/grp/.../repo then /-/tree/<ref>/<sub>
    repoPath = idx === -1 ? full : full.slice(0, idx);
    if (idx !== -1) {
      const rest = full.slice(idx + 3).split('/');
      if (rest[0] === 'tree' && rest[1]) { ref = rest[1]; subdir = rest.slice(2).join('/'); }
    }
  } else if (host === 'bitbucket.org') {
    const seg = full.split('/');
    repoPath = seg.slice(0, 2).join('/');
    if (seg[2] === 'src' && seg[3]) { ref = seg[3]; subdir = seg.slice(4).join('/'); }
  } else {
    repoPath = full; // best-effort for unknown self-hosted web URLs
  }

  repoPath = repoPath.replace(/\/+$/, '');
  if (!repoPath) fail('Not a repository URL.');

  const extra = (path || '').replace(/^\/+|\/+$/g, '');
  subdir = [subdir, extra].filter(Boolean).join('/');

  return { cloneUrl: `https://${host}/${repoPath}.git`, ref, subdir };
}

/**
 * Shallow-clone the repo into a fresh temp directory on the real fs and return
 * its path. The caller is responsible for removing it (git-core does, in a
 * `finally`). Cloning onto real fs lets the ported CLI loader (fs-based) run
 * unchanged.
 */
export async function cloneToTempDir({ cloneUrl, ref }) {
  assertCloneAllowed(cloneUrl);
  const dir = path.join(os.tmpdir(), `bdv-git-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await git.clone({
      fs, http, dir, url: cloneUrl,
      ...(ref ? { ref } : {}),
      singleBranch: true, depth: 1, noTags: true
    });
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    fail(`Could not clone the repository: ${err.message}`, 502);
  }
  return dir;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run api/lib/git-clone.spec.js`
Expected: PASS. (`cloneToTempDir` runs a real clone; it's exercised by the Task 3 integration test, not here.)

- [ ] **Step 6: Commit**

```bash
git add api/lib/git-clone.js api/lib/git-clone.spec.js package.json package-lock.json
git commit -m "feat(git-import): host-agnostic clone to temp dir via isomorphic-git + SSRF guard"
```

---

### Task 2: Port the collection loader from @usebruno/cli + collection discovery

**Files:**
- Create: `api/lib/collection-loader.js`
- Test: `api/lib/collection-loader.spec.js`

- [ ] **Step 1: Write the failing test (real fs fixtures under a temp dir)**

```js
// api/lib/collection-loader.spec.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCollectionJsonFromPathname, findCollections, getCollectionFormat } from './collection-loader.js';

const PING_BRU = 'meta {\n  name: Ping\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://api.example.com/ping\n}\n';
let repo;

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bdv-loader-'));
  fs.mkdirSync(path.join(repo, 'apis/orders/list'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apis/orders/bruno.json'), JSON.stringify({ name: 'Orders API', version: '1' }));
  fs.writeFileSync(path.join(repo, 'apis/orders/Ping.bru'), PING_BRU);
  fs.writeFileSync(path.join(repo, 'apis/orders/list/Get.bru'), PING_BRU);
  fs.mkdirSync(path.join(repo, 'apis/users'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apis/users/bruno.json'), JSON.stringify({ name: 'Users API', version: '1' }));
});
afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('getCollectionFormat', () => {
  it('detects bru via bruno.json; null when not a collection root', () => {
    expect(getCollectionFormat(path.join(repo, 'apis/orders'))).toBe('bru');
    expect(getCollectionFormat(repo)).toBeNull();
  });
});

describe('findCollections', () => {
  it('finds each collection dir (name + relative path + format), does not nest', () => {
    expect(findCollections(repo)).toEqual([
      { name: 'Orders API', path: 'apis/orders', format: 'bru' },
      { name: 'Users API', path: 'apis/users', format: 'bru' }
    ]);
  });
});

describe('createCollectionJsonFromPathname', () => {
  it('builds the canonical collection JSON (folders first, then requests)', () => {
    const c = createCollectionJsonFromPathname(path.join(repo, 'apis/orders'));
    expect(c.format).toBe('bru');
    expect(c.brunoConfig.name).toBe('Orders API');
    expect(c.items[0]).toMatchObject({ type: 'folder', name: 'list' });
    expect(c.items.some((i) => i.name === 'Ping.bru')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/lib/collection-loader.spec.js`
Expected: FAIL — cannot find module `./collection-loader.js`.

- [ ] **Step 3: Port the loader (verbatim logic from @usebruno/cli, CLI-isms removed)**

Copy `FORMAT_CONFIG`, `getCollectionFormat`, `getCollectionConfig`, `getFolderRoot`, `sortByNameThenSequence`, and `createCollectionJsonFromPathname` from `bruno/packages/bruno-cli/src/utils/collection.js`, changing only: `@usebruno/filestore` imports; replace `console.error(...) + process.exit(...)` with `throw` (status 404); drop `chalk` and `global.brunoSkippedFiles` (skip invalid files silently). Then add `findCollections`.

```js
// api/lib/collection-loader.js
// Ported from @usebruno/cli packages/bruno-cli/src/utils/collection.js
// (createCollectionJsonFromPathname + helpers). Keep in sync with upstream;
// record the source commit here when porting.
import fs from 'node:fs';
import path from 'node:path';
import { parseRequest, parseCollection, parseFolder } from '@usebruno/filestore';

export const FORMAT_CONFIG = {
  yml: { ext: '.yml', collectionFile: 'opencollection.yml', folderFile: 'folder.yml' },
  bru: { ext: '.bru', collectionFile: 'collection.bru', folderFile: 'folder.bru' }
};

export const getCollectionFormat = (collectionPath) => {
  if (fs.existsSync(path.join(collectionPath, 'opencollection.yml'))) return 'yml';
  if (fs.existsSync(path.join(collectionPath, 'bruno.json'))) return 'bru';
  return null;
};

const getCollectionConfig = (collectionPath, format) => {
  if (format === 'yml') {
    const parsed = parseCollection(fs.readFileSync(path.join(collectionPath, 'opencollection.yml'), 'utf8'), { format: 'yml' });
    return { brunoConfig: parsed.brunoConfig, collectionRoot: parsed.collectionRoot || {} };
  }
  const brunoConfig = JSON.parse(fs.readFileSync(path.join(collectionPath, 'bruno.json'), 'utf8'));
  const collectionBruPath = path.join(collectionPath, 'collection.bru');
  const collectionRoot = fs.existsSync(collectionBruPath)
    ? parseCollection(fs.readFileSync(collectionBruPath, 'utf8'), { format: 'bru' })
    : {};
  return { brunoConfig, collectionRoot };
};

const getFolderRoot = (dir, format) => {
  const folderPath = path.join(dir, FORMAT_CONFIG[format].folderFile);
  if (!fs.existsSync(folderPath)) return null;
  return parseFolder(fs.readFileSync(folderPath, 'utf8'), { format });
};

// Port verbatim from @usebruno/cli (folders sorted alphabetically, then entries
// with a valid seq inserted at their positions).
const sortByNameThenSequence = (items) => {
  const isSeqValid = (seq) => Number.isFinite(seq) && Number.isInteger(seq) && seq > 0;
  const alpha = [...items].sort((a, b) => (a.name && b.name ? a.name.localeCompare(b.name) : 0));
  const withoutSeq = alpha.filter((f) => !isSeqValid(f.seq));
  const withSeq = alpha.filter((f) => isSeqValid(f.seq)).sort((a, b) => a.seq - b.seq);
  const sorted = [...withoutSeq];
  withSeq.forEach((item) => sorted.splice(Math.min(Math.max(item.seq - 1, 0), sorted.length), 0, item));
  return sorted;
};

export const createCollectionJsonFromPathname = (collectionPath) => {
  const format = getCollectionFormat(collectionPath);
  if (!format) { const e = new Error('Not a Bruno collection.'); e.status = 404; throw e; }

  const { brunoConfig, collectionRoot } = getCollectionConfig(collectionPath, format);
  const { ext, collectionFile, folderFile } = FORMAT_CONFIG[format];
  const environmentsPath = path.join(collectionPath, 'environments');

  const traverse = (currentPath) => {
    if (currentPath.includes('node_modules')) return [];
    const dirItems = [];
    for (const file of fs.readdirSync(currentPath)) {
      const filePath = path.join(currentPath, file);
      const stats = fs.lstatSync(filePath);
      if (stats.isDirectory()) {
        if (filePath === environmentsPath || file === '.git' || file === 'node_modules') continue;
        const folderItem = { name: file, pathname: filePath, type: 'folder', items: traverse(filePath) };
        const folderRoot = getFolderRoot(filePath, format);
        if (folderRoot) { folderItem.root = folderRoot; folderItem.seq = folderRoot.meta?.seq; }
        dirItems.push(folderItem);
      } else {
        if (file === collectionFile || file === folderFile || path.extname(filePath) !== ext) continue;
        try {
          const requestItem = parseRequest(fs.readFileSync(filePath, 'utf8'), { format });
          dirItems.push({ name: file, ...requestItem, pathname: filePath });
        } catch { /* skip invalid file */ }
      }
    }
    const folders = sortByNameThenSequence(dirItems.filter((i) => i.type === 'folder'));
    const requests = dirItems.filter((i) => i.type !== 'folder').sort((a, b) => a.seq - b.seq);
    return folders.concat(requests);
  };

  return { brunoConfig, format, root: collectionRoot, pathname: collectionPath, items: traverse(collectionPath) };
};

/**
 * Discover every collection under `rootDir`: each directory that is a collection
 * root (has `bruno.json` or `opencollection.yml`). Does not descend into a
 * collection. Returns `{ name, path (relative), format }[]` sorted by path.
 */
export const findCollections = (rootDir) => {
  const found = [];
  const walk = (dir, rel) => {
    const format = getCollectionFormat(dir);
    if (format) {
      let name = rel ? path.basename(rel) : path.basename(dir);
      try {
        const cfg = getCollectionConfig(dir, format);
        name = cfg.brunoConfig?.name || cfg.collectionRoot?.meta?.name || cfg.collectionRoot?.info?.name || name;
      } catch { /* keep dir name */ }
      found.push({ name, path: rel, format });
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
    }
  };
  walk(rootDir, '');
  return found.sort((a, b) => a.path.localeCompare(b.path));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/lib/collection-loader.spec.js`
Expected: PASS. Uses the real `@usebruno/filestore` parsers against real fixture files, validating the port faithfully.

- [ ] **Step 5: Commit**

```bash
git add api/lib/collection-loader.js api/lib/collection-loader.spec.js
git commit -m "feat(git-import): port @usebruno/cli collection loader + discovery"
```

---

### Task 3: git-core pipeline + integration check against a real repo

**Files:**
- Create: `api/lib/git-core.js`
- Test: `api/lib/git-core.spec.js`

- [ ] **Step 1: Write the failing test (real public Bruno repo, network)**

```js
// api/lib/git-core.spec.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

const PING = 'meta {\n  name: Ping\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://x/o\n}\n';
const makeMonorepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdv-core-'));
  fs.mkdirSync(path.join(dir, 'apis/orders'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apis/orders/bruno.json'), JSON.stringify({ name: 'Orders API' }));
  fs.writeFileSync(path.join(dir, 'apis/orders/Ping.bru'), PING);
  fs.mkdirSync(path.join(dir, 'apis/users'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apis/users/bruno.json'), JSON.stringify({ name: 'Users API' }));
  return dir;
};

describe('importGitRepo — monorepo (clone mocked to real fs fixtures)', () => {
  afterEach(() => { vi.doUnmock('./git-clone.js'); vi.resetModules(); });

  it('returns the collection list when several exist and none is targeted', async () => {
    const dir = makeMonorepo();
    vi.resetModules();
    vi.doMock('./git-clone.js', () => ({
      normalizeGitSource: () => ({ cloneUrl: 'https://github.com/o/m.git', ref: undefined, subdir: '' }),
      cloneToTempDir: async () => dir // git-core removes it in its finally
    }));
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/o/m.git', path: '' });
    expect(out.collections).toEqual([
      { name: 'Orders API', path: 'apis/orders' },
      { name: 'Users API', path: 'apis/users' }
    ]);
  });

  it('converts the targeted collection when path is given', async () => {
    const dir = makeMonorepo();
    vi.resetModules();
    vi.doMock('./git-clone.js', () => ({
      normalizeGitSource: (g, p) => ({ cloneUrl: 'https://github.com/o/m.git', ref: undefined, subdir: p }),
      cloneToTempDir: async () => dir
    }));
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/o/m.git', path: 'apis/orders' });
    expect(out.name).toBe('Orders API');
    expect(yaml.load(out.opencollection)).toBeTruthy();
  });
});

describe('importGitRepo (integration, real clone, network)', () => {
  it('imports a real public repo to OpenCollection YAML or a collection list', async () => {
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/usebruno/bruno-testbench.git', path: '' });
    if (out.opencollection) {
      expect(yaml.load(out.opencollection)).toBeTruthy();
      expect(out.name).toBeTruthy();
    } else {
      expect(Array.isArray(out.collections)).toBe(true);
    }
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/lib/git-core.spec.js`
Expected: FAIL — cannot find module `./git-core.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// api/lib/git-core.js
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { brunoToOpenCollection } from '@usebruno/converters';
import { normalizeGitSource, cloneToTempDir } from './git-clone.js';
import { createCollectionJsonFromPathname, findCollections } from './collection-loader.js';

const convert = (collectionDir) => {
  const bruno = createCollectionJsonFromPathname(collectionDir);
  const oc = brunoToOpenCollection(bruno);
  return {
    name: (oc.info && oc.info.name) || bruno.brunoConfig?.name || 'Bruno Collection',
    opencollection: yaml.dump(oc, { lineWidth: -1, noRefs: true })
  };
};

/**
 * Returns either a single converted collection `{ name, opencollection }` (when
 * a collection is targeted via `path`, or the repo has exactly one) or the list
 * `{ collections: { name, path }[] }` for a monorepo with several. Always
 * removes the temp clone afterward.
 */
export async function importGitRepo({ gitUrl, path: subPath = '' } = {}) {
  if (!gitUrl) { const e = new Error('gitUrl is required.'); e.status = 400; throw e; }

  const source = normalizeGitSource(gitUrl, subPath);
  const dir = await cloneToTempDir(source);
  try {
    const collections = findCollections(dir);
    if (!collections.length) { const e = new Error('No Bruno collection found in this repository.'); e.status = 404; throw e; }

    if (source.subdir) {
      const match = collections.find((c) => c.path === source.subdir);
      if (!match) { const e = new Error('No Bruno collection at that path.'); e.status = 404; throw e; }
      return convert(path.join(dir, match.path));
    }
    if (collections.length === 1) {
      return convert(path.join(dir, collections[0].path));
    }
    return { collections: collections.map(({ name, path }) => ({ name, path })) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/lib/git-core.spec.js`
Expected: PASS. The mocked tests validate discovery + scoping; the integration test does a real clone and exercises the ported loader + `brunoToOpenCollection` end to end. If `brunoToOpenCollection` rejects the loader's collection JSON, that's the one shape to reconcile — the loader output matches `@usebruno/cli`'s `createCollectionJsonFromPathname`, so align the converter call (or a thin adapter) to it rather than editing the ported loader.

- [ ] **Step 5: Commit**

```bash
git add api/lib/git-core.js api/lib/git-core.spec.js
git commit -m "feat(git-import): git-core pipeline (repo -> OpenCollection YAML)"
```

---

### Task 4: Host adapters (Vercel + Netlify) + redirect

**Files:**
- Create: `api/git-import.js`
- Create: `netlify/functions/git-import.mjs`
- Modify: `netlify.toml`

- [ ] **Step 1: Vercel handler (mirror `api/postman-import.js`)**

```js
// api/git-import.js
import { importGitRepo } from './lib/git-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }
  try {
    const { gitUrl, path } = req.body || {};
    const result = await importGitRepo({ gitUrl, path });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Import failed.' });
  }
}
```

- [ ] **Step 2: Netlify adapter (mirror `netlify/functions/postman-import.mjs`)**

```js
// netlify/functions/git-import.mjs
import { importGitRepo } from '../../api/lib/git-core.js';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }
  try {
    const { gitUrl, path } = await req.json();
    const result = await importGitRepo({ gitUrl, path });
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Import failed.' }), { status: err.status || 500, headers: { 'content-type': 'application/json' } });
  }
};
```

- [ ] **Step 3: Add the redirect in `netlify.toml`**

After the existing `/api/postman-import` redirect block, add:

```toml
[[redirects]]
  from = "/api/git-import"
  to = "/.netlify/functions/git-import"
  status = 200
  force = true
```

- [ ] **Step 4: Verify the build still succeeds**

Run: `npm run build`
Expected: PASS (frontend build unaffected; functions are not part of the Vite build).

- [ ] **Step 5: Commit**

```bash
git add api/git-import.js netlify/functions/git-import.mjs netlify.toml
git commit -m "feat(git-import): Vercel + Netlify adapters and route"
```

---

### Task 5: Client git-import module

**Files:**
- Create: `src/git/gitImport.ts`
- Test: `src/git/gitImport.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/git/gitImport.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runGitImport } from './gitImport';

afterEach(() => vi.restoreAllMocks());

describe('runGitImport', () => {
  it('POSTs gitUrl/path and returns a converted collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, name: 'Demo', opencollection: 'name: Demo\n' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runGitImport({ gitUrl: 'https://github.com/o/r.git', path: '' });
    expect(out).toEqual({ kind: 'collection', name: 'Demo', opencollection: 'name: Demo\n' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/git-import');
    expect(JSON.parse(init.body)).toEqual({ gitUrl: 'https://github.com/o/r.git', path: '' });
  });

  it('returns the collection list for a monorepo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, collections: [{ name: 'Orders API', path: 'apis/orders' }] })
    }));
    const out = await runGitImport({ gitUrl: 'https://github.com/o/mono.git', path: '' });
    expect(out).toEqual({ kind: 'list', collections: [{ name: 'Orders API', path: 'apis/orders' }] });
  });

  it('throws with the server error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false, error: 'No Bruno collection found in this repository.' }) }));
    await expect(runGitImport({ gitUrl: 'https://github.com/o/r.git', path: '' })).rejects.toThrow(/No Bruno collection/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/git/gitImport.spec.ts`
Expected: FAIL — cannot find module `./gitImport`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/git/gitImport.ts
const ENDPOINT = '/api/git-import';

export interface GitCollectionRef { name: string; path: string; }
export type GitImportResult =
  | { kind: 'collection'; name: string; opencollection: string }
  | { kind: 'list'; collections: GitCollectionRef[] };

export const runGitImport = async (
  { gitUrl, path }: { gitUrl: string; path: string }
): Promise<GitImportResult> => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gitUrl, path })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status}).`);
  if (Array.isArray(data.collections)) return { kind: 'list', collections: data.collections };
  return { kind: 'collection', name: data.name, opencollection: data.opencollection };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/git/gitImport.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/git/gitImport.ts src/git/gitImport.spec.ts
git commit -m "feat(git-import): client runGitImport POST helper"
```

---

### Task 6: Wire the fallback into SourceView (repo without opencollection.yml)

**Files:**
- Modify: `src/ui/SourceView.tsx:17-31`

- [ ] **Step 1: Add imports + a `picker` state**

Add to the top of `src/ui/SourceView.tsx`:

```ts
import { runGitImport, type GitCollectionRef } from '../git/gitImport';
import { decideSource, buildShareViewerUrl } from '../sources/sourceParams';
import { CollectionPicker } from './CollectionPicker';
```

(`decideSource` may already be imported for the CORS message; if so, don't duplicate.)

Extend the `State` union:

```ts
type State =
  | { status: 'loading' }
  | { status: 'error'; kind: ErrorKind }
  | { status: 'ready'; text: string }
  | { status: 'picker'; collections: GitCollectionRef[] };
```

- [ ] **Step 2: Fall back to git-import when a repo's opencollection.yml is missing**

Replace the effect body's `try` block (`src/ui/SourceView.tsx:18-25`):

```ts
      try {
        const raw = await loadCollectionText(source);
        const text = await resolveToOpenCollection(raw);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        const kind: ErrorKind = err instanceof CollectionFetchError ? (err.kind as ErrorKind) : 'unknown';
        if (active) setState({ status: 'error', kind });
      }
```

with:

```ts
      try {
        const raw = await loadCollectionText(source);
        const text = await resolveToOpenCollection(raw);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        // A repo whose fast opencollection.yml path yields nothing is either a
        // native .bru collection (GitHub: 'not-found') or a non-GitHub repo with
        // no fast raw candidate at all (GitHub-only buildRepoRawUrl -> 'unknown').
        // Both fall back to the server-side git-import (clone + convert). Don't
        // fall back on 'cors' (a private/unreachable repo — nothing to clone).
        const fetchKind = err instanceof CollectionFetchError ? err.kind : 'unknown';
        const shouldGitImport =
          decideSource(source) === 'repo' && (fetchKind === 'not-found' || fetchKind === 'unknown');
        if (shouldGitImport) {
          try {
            const result = await runGitImport({ gitUrl: source.gitUrl, path: source.path });
            if (!active) return;
            if (result.kind === 'list') {
              // Monorepo: show the picker (each entry links to ?git_url=…&path=…).
              setState({ status: 'picker', collections: result.collections });
            } else {
              void recordRecentLink(source, result.name);
              setState({ status: 'ready', text: result.opencollection });
            }
            return;
          } catch (gitErr) {
            const kind: ErrorKind =
              gitErr instanceof Error && /not found|no bruno collection/i.test(gitErr.message) ? 'not-found' : 'unknown';
            if (active) setState({ status: 'error', kind });
            return;
          }
        }
        if (active) setState({ status: 'error', kind: fetchKind as ErrorKind });
      }
```

- [ ] **Step 2b: Render the picker**

Before the `error`-state rendering, add:

```tsx
  if (state.status === 'picker') {
    return (
      <CollectionPicker
        collections={state.collections}
        hrefFor={(c) =>
          buildShareViewerUrl({ gitUrl: source.gitUrl, rawUrl: '', openapiUrl: '', gist: '', path: c.path })
        }
      />
    );
  }
```

- [ ] **Step 2c: Create the CollectionPicker component**

```tsx
// src/ui/CollectionPicker.tsx
import { LOGO_URL } from '../config';
import type { GitCollectionRef } from '../git/gitImport';

/** Monorepo collection chooser: lists collections, each a shareable link. */
export function CollectionPicker({
  collections,
  hrefFor
}: {
  collections: GitCollectionRef[];
  hrefFor: (c: GitCollectionRef) => string;
}) {
  return (
    <div className="home">
      <div className="home-columns">
        <div className="home-shell">
          <header className="home-hero">
            <img className="state-logo" src={LOGO_URL} alt="Bruno" />
            <h1>Choose a collection</h1>
            <p className="home-lead">This repository contains several Bruno collections.</p>
          </header>
          <section className="home-history">
            <ul className="home-recent-list">
              {collections.map((c) => (
                <li key={c.path || '.'} className="home-recent-item" role="link" tabIndex={0}
                    onClick={() => window.location.assign(hrefFor(c))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.assign(hrefFor(c)); } }}>
                  <div className="home-recent-meta">
                    <span className="home-recent-title">{c.name}</span>
                    <span className="home-recent-subtitle">{c.path || '(repository root)'}</span>
                  </div>
                  <span className="home-sample-arrow" aria-hidden="true">→</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
```

(Reuses the home page's existing list styles, so no new CSS.)

- [ ] **Step 3: Verify the build type-checks**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manually verify end-to-end (single, monorepo, fast-path)**

Run the app with the function served: `netlify dev` (or `vercel dev`).
- Single native repo: `?git_url=https%3A%2F%2Fgithub.com%2Fusebruno%2Fbruno-testbench.git` → the collection renders.
- Monorepo (a repo with several `bruno.json`/`opencollection.yml` dirs): `?git_url=<repo>` → the **picker** lists the collections; clicking one navigates to `?git_url=<repo>&path=<dir>` and renders it.
- Non-GitHub: a public GitLab/Bitbucket collection repo `?git_url=<url>` → renders via clone.
- Fast path intact: a repo with a single root `opencollection.yml` → renders without an `/api/git-import` call in the network tab.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SourceView.tsx src/ui/CollectionPicker.tsx
git commit -m "feat(source): git-import fallback + monorepo collection picker"
```

---

### Task 7: Cache converted git imports (skip re-fetch on re-open)

**Files:**
- Modify: `src/storage/importCache.ts`
- Modify: `src/ui/SourceView.tsx` (use the cache around `runGitImport`)

- [ ] **Step 1: Add a git cache key/helper (mirror the Postman cache)**

In `src/storage/importCache.ts`, add a git-keyed variant alongside the Postman one. Key on the git URL + path:

```ts
export const gitCacheKey = (gitUrl: string, path: string): string => `git:${gitUrl}|${path || ''}`;
```

Reuse the existing read/write/touch helpers, passing `kind: 'git'` (extend the `kind` union in `collectionStore.ts` to include `'git'`).

- [ ] **Step 2: Cache-first in SourceView's git fallback**

In the `repoMissing` branch (Task 6 Step 2), check the cache before calling `runGitImport`, and write the result after — mirroring how `PostmanView` uses `importCache` (read → on miss, import → cache → render; bump recency on hit).

- [ ] **Step 3: Verify**

Run: `npm test` then `npm run build`
Expected: all tests pass; build clean. Manually: open the native repo twice; the second open renders without an `/api/git-import` request.

- [ ] **Step 4: Commit**

```bash
git add src/storage/importCache.ts src/storage/collectionStore.ts src/ui/SourceView.tsx
git commit -m "feat(git-import): cache converted git imports in IndexedDB"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`

- [ ] **Step 1: README** — under Features, add: viewing a **native Bruno collection** from a public GitHub repo (a `.bru`/`.yml` tree, converted server-side to OpenCollection); note it falls back only when the repo has no `opencollection.yml`. Under "Serverless function", document `/api/git-import` next to the Postman one.

- [ ] **Step 2: ARCHITECTURE** — add `api/lib/git-clone.js`, `api/lib/collection-loader.js`, `api/lib/git-core.js`, `api/git-import.js`, `netlify/functions/git-import.mjs`, `src/git/gitImport.ts`, and `src/ui/CollectionPicker.tsx` to the folder layout, and a short "Git repo import flow" section (clone → discover → load → convert) mirroring the Postman one. Note the monorepo picker + the `collection-loader.js` port from `@usebruno/cli`.

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md
git commit -m "docs: describe the git-repo import function"
```

---

## Self-Review

**Spec coverage:**
- Import a native Bruno git repo by URL → Tasks 1-4 (function) + Task 6 (viewer fallback on the existing `git_url` source).
- View the docs → the function returns OpenCollection YAML, which flows through the existing render path unchanged.
- Monorepo subdir → `path` is threaded into `importGitRepo` (Task 3) and the tree filter (Task 1).
- Don't regress repos that ship `opencollection.yml` → Task 6 only falls back on a `not-found` for a `repo` source; Task 6 Step 4 verifies the fast path still runs.
- Re-open is cheap → Task 7 caches.
- **Any git host** (GitHub / GitLab / Bitbucket / self-hosted via `GIT_IMPORT_ALLOWED_HOSTS`) → Task 1 clones host-agnostically; `normalizeGitSource` handles each host's subtree-URL shape; Task 6 routes non-GitHub repos (no fast raw path) to the function.
- Public-only, server-side → matches the guiding-constraint note; scope stated up front.
- SSRF safety → Task 1's `assertCloneAllowed` (https-only + private-range denylist + host allowlist), a blocking review item.

**Placeholder scan:** no TBD/"handle edge cases"/"similar to". Each code step is complete. The one deliberate soft spot — the exact `@usebruno/filestore` return shape feeding the assembled items — is called out with a concrete fallback (adjust mapping; Task 3's real-repo integration test is the guard) rather than hand-waved.

**Type/name consistency:** `importGitRepo({ gitUrl, path })` returns a union — `{ name, opencollection }` or `{ collections: { name, path }[] }` — which `runGitImport` maps to `{ kind: 'collection' | 'list', … }` and `SourceView` branches on (render vs picker). `normalizeGitSource` → `{ cloneUrl, ref, subdir }` is consumed by `cloneToTempDir`. `createCollectionJsonFromPathname(dir)` → `{ brunoConfig, format, root, items }` is the input to `brunoToOpenCollection`. `findCollections(dir)` → `{ name, path, format }[]`.

**Testing note:** pure/logic layers (`git-clone.js`, `collection-loader.js`, `git-core.js`, `gitImport.ts`) are unit/integration tested; `collection-loader.spec.js` runs the real `@usebruno/filestore` parsers against fs fixtures and `git-core.spec.js` does a real clone (the definitive end-to-end shape check). View wiring (SourceView + CollectionPicker) is verified by build + a manual `netlify dev` smoke, consistent with the repo's existing test boundaries.

**Known risks / follow-ups:**
- **Assembler shape** (Task 2) is the main correctness risk — mitigated by the real-repo integration test (Task 3) and the `collection-watcher.js` reference.
- **SSRF** (Task 1) is the main security risk — the guard is https-only + private-range denylist + host allowlist. Redirect-following and DNS-rebinding are residual: `isomorphic-git`'s clone can follow smart-HTTP redirects, so hardening should re-validate each request URL (wrap the `http` client) and/or pin resolved IPs. Flag for the security review before deploy.
- **Serverless limits**: a shallow clone downloads the full tree at HEAD; fine for collection-sized repos, but a huge monorepo could hit the function's time/memory limit. `depth:1 + singleBranch + noTags` and the `MAX_FILES` guardrail bound it; a very large repo surfaces a clean error.
- **Deferred**: private/authenticated repos, and a client-side (no-server) path (a browser clone needs a CORS proxy).
