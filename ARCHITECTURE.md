# Architecture

A React + Vite static SPA plus one serverless function. The frontend is organized
into feature/layer folders; the backend is a host-agnostic core with thin per-host
adapters.

## Folder layout

```
src/
  config.ts              renderer JS/CSS URLs (CDN default, VITE_RENDERER_* override) + LOGO_URL
  main.tsx               React entry: mounts <App> + hashchange reload
  App.tsx                router: prefix path OR query params -> a view component
  samples.ts             sample collections for the empty home page
  style.css              all styles (single sheet)

  sources/               "where does the collection come from"
    sourceParams.ts      param vocabulary (git_url/raw_url/openapi_url/gist/path): parse, build, deeplink
    classifySource.ts    a full URL -> routing intent; parsePrefixPath() for the prefix route
    loader.ts            fetch a source's text (doc-first), typed CollectionFetchError

  collection/            "what format is this, and make it OpenCollection"
    format.ts            sniffFormat() + isUnbundledOpenCollection() (bundled:false -> git-import)
    resolve.ts           resolveToOpenCollection(text): sniff + convert (lazy converters import)

  git/                   git-repo import (framework-agnostic)
    gitImport.ts         runGitImport(): POST /api/git-import -> collection | list

  postman/               Postman import feature (framework-agnostic)
    postmanImport.ts     URL detection, share params, runPostmanImport()

  storage/               browser-local persistence (IndexedDB via idb)
    collectionStore.ts   the single IndexedDB store + CRUD + 50-entry LRU cap
    localUpload.ts       file uploads (?local=<key>)
    recentLinks.ts       gist/repo history entries
    importCache.ts       converted Postman + git import cache

  ui/                    React components
    HomePage.tsx         input, upload, recents/history, samples
    LocalUploadView.tsx  ?local= view (loads from IndexedDB)
    PostmanView.tsx      ?pm= view (cache-first import)
    SourceView.tsx       gist/repo/raw view: fetch, resolve, or git-import fallback
    CollectionPicker.tsx monorepo chooser (git repo with several collections)
    DocsRenderer.tsx     mounts the renderer (openInBrunoHref/backToHomeHref) + prod-only floating back-to-home fallback
    States.tsx           <Loading> and <Message> states
    RecentList.tsx       shared clickable list of stored collections
    HistoryPanel.tsx     full history as a second column: remove one / clear all
    PostmanEnvModal.tsx  optional environment links before import
    rendererAssets.ts    lazy renderer asset loader + waitForRenderer

  test/setup.ts          fake-indexeddb for the test env

api/                     serverless (host-agnostic core + Vercel adapter)
  lib/
    import-core.js       Postman: fetch + map + convert pipeline
    postman.js           keyless Postman fetch + SSRF guard (assertPostmanHost)
    mapper.js            internal Postman model -> v2.1 export shape
    git-core.js          Git: clone -> discover -> load -> convert pipeline
    git-clone.js         URL normalize + SSRF guard + isomorphic-git clone to temp dir
    collection-loader.js dir -> collection JSON (ported from @usebruno/cli) + findCollections
  postman-import.js      Vercel handler (Postman)
  git-import.js          Vercel handler (Git)

netlify/functions/
  postman-import.mjs     Netlify v2 adapter (wraps api/lib/import-core.js)
  git-import.mjs         Netlify v2 adapter (wraps api/lib/git-core.js)
```

Frontend `src/git/gitImport.ts` POSTs to `/api/git-import`; `src/ui/CollectionPicker.tsx`
renders the monorepo chooser.

Dependency direction: `ui` and `App` depend on `sources`, `postman`, `storage`,
`config`, `samples`. `storage` modules depend only on `collectionStore` (and
`sources` for key building). `sources`, `postman`, and `config` depend on nothing
internal. No cycles. The `sources`, `git`, `storage`, `postman`, and `collection`
layers are plain TypeScript (no React), so they are unit-tested without a DOM.

Every client-fetched document flows through `collection/resolve.ts` before it
reaches `<DocsRenderer>`: `SourceView` (after `loadCollectionText`) and
`LocalUploadView` (after `readLocalUpload`) both call `resolveToOpenCollection`,
which sniffs the format and converts non-OpenCollection specs (currently OpenAPI)
to OpenCollection YAML, lazily importing `@usebruno/converters` only when a
conversion is actually needed. Postman remains on its own server path because
Postman's host blocks CORS; the format is known there, so it needs no sniffer.

## Routing (`App.tsx`)

`<App>` inspects the URL once and renders exactly one view:

0. **Prefix route** — `pathname !== '/'` (e.g. `/github.com/org/repo`): the path
   *is* the source URL. `parsePrefixPath` reconstructs it (`https://` + path +
   its own query) and `classifySourceUrl` maps it to `<PostmanView>` or
   `<SourceView>`, keeping the pretty URL (no redirect). A Netlify SPA rewrite
   (`/* -> /index.html`) serves the app for these paths.
1. `?local=<key>` -> `<LocalUploadView>` (IndexedDB read)
2. `?pm=…` -> `<PostmanView>` (cache-first import)
3. a git/raw/gist source -> `<SourceView>` (fetch, resolve, or git-import)
4. nothing -> `<HomePage>`

`pathname === '/'` uses steps 1-4 (the query form + home); any other path is the
prefix route (step 0). Each view manages its own async load in an effect and
renders `<Loading>`, `<Message>`, `<CollectionPicker>`, or `<DocsRenderer>`.
Navigation is full-page (`window.location.assign`), so a view mounts once per
page load and the app needs no client-side router.

`<DocsRenderer>` mounts the imperative CDN renderer into a ref'd node exactly once
(guarded, and StrictMode is intentionally omitted so dev doesn't double-mount it).

A `hashchange` that carries a `#/req/<id>` reloads so the renderer can select the
requested item on mount.

## Storage model (IndexedDB)

One database `bruno-docs-viewer`, one object store `collections` (keyPath `key`),
opened once through a memoized promise in `collectionStore.ts`. On first open it
calls `navigator.storage.persist()` (best-effort) so the data survives storage
pressure.

Every stored row is a `StoredCollection`:

```ts
{
  key: string;            // "upload:<uuid>" | "link:<sourceParams>" | "postman:<url>|<envs>"
  kind: 'upload' | 'link' | 'postman';
  title: string;
  subtitle: string;
  href: string;           // where the home page navigates on click
  savedAt: number;
  lastOpenedAt: number;   // sort + eviction key
  yaml?: string;          // present for uploads and postman (the cache payload)
}
```

The three storage modules are thin wrappers over this one store:

- `localUpload.ts` writes `kind: 'upload'` rows with the YAML inline; the `?local`
  key is the row key.
- `recentLinks.ts` writes `kind: 'link'` rows keyed by the source's short params,
  so re-viewing the same source updates one row instead of duplicating it. No YAML
  is stored (the source is refetched, which is cheap and always current).
- `importCache.ts` writes `kind: 'postman'` rows keyed by the collection URL plus
  its sorted environment URLs, with the converted YAML inline. This is both the
  history entry and the conversion cache.

Because uploads and Postman imports store their YAML, re-opening them never hits
the network; links re-fetch. Every write goes through `putCollection`, which then
evicts everything past the newest 50 by `lastOpenedAt`. `touchCollection` bumps
`lastOpenedAt` when a row is opened.

This is why history is unified: recents, uploads, and Postman imports are all rows
in the same store, listed together by recency, and the "View all history" panel
(a second column on the home page) operates on the whole store (remove one =
`deleteCollection`, clear all = `clearCollections`). `HomePage` owns the entries
state so the recents list and the panel stay in sync.

## Postman import flow

Client: `postman/postmanImport.ts` provides URL detection, share-param build/parse,
and `runPostmanImport()`. `HomePage` detects a collection URL and opens
`<PostmanEnvModal>` to collect optional environment links, then navigates to
`?pm=…&pe=…`. On load `<PostmanView>` builds the cache key, checks `importCache`,
and on a miss POSTs `{collectionUrl, environmentUrls}` to `/api/postman-import`.

Server (`api/lib/import-core.js`): resolve uid -> keyless fetch (guarded by
`assertPostmanHost`) -> map to v2.1 -> `@usebruno/converters` -> OpenCollection
YAML. The Vercel and Netlify entrypoints are thin adapters over this one function.

## Git repo import flow

For a `git_url` repo source, `<SourceView>` first tries the fast GitHub
`opencollection.yml` fetch (`loader.ts`). When that yields nothing — a native
`.bru`/`.yml` repo (404) or a non-GitHub host (no raw candidate) — it falls back
to `src/git/gitImport.ts`'s `runGitImport`, cache-first via `importCache`
(`git:<url>|<path>`).

Server (`api/lib/git-core.js`): `normalizeGitSource` -> `cloneToTempDir`
(isomorphic-git, shallow, SSRF-guarded) -> `findCollections` walks for
`bruno.json` / `opencollection.yml` roots. With a targeted `path` (or a single
collection) it loads that dir via the ported `createCollectionJsonFromPathname`
and `brunoToOpenCollection` -> OpenCollection YAML; a monorepo with several
returns `{ name, path }[]`, which `<CollectionPicker>` renders as shareable
`?git_url=…&path=<dir>` links. The temp clone is always removed afterward.

## Testing

`vitest` with `fake-indexeddb/auto` (wired in `src/test/setup.ts`) gives the
storage layer a real IndexedDB. Specs cover the store CRUD + eviction cap, upload
save/read + title parsing, the Postman cache-key contract, and recent-link keying.
Pure param logic is covered by `sources/sourceParams.spec.ts`.
