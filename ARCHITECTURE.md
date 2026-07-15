# Architecture

A React + Vite static SPA plus one serverless function. The frontend is organized
into feature/layer folders; the backend is a host-agnostic core with thin per-host
adapters.

## Folder layout

```
src/
  config.ts              CDN_BASE + LOGO_URL constants
  main.tsx               React entry: mounts <App> + hashchange reload
  App.tsx                router: reads the URL and picks a view component
  samples.ts             sample collections for the empty home page
  style.css              all styles (single sheet)

  sources/               "where does the collection come from" (gist/repo)
    sourceParams.ts      param vocabulary: parse, build, candidate URLs, deeplink
    loader.ts            fetch a source's YAML (gist-first), typed CollectionFetchError

  collection/            "what format is this, and make it OpenCollection"
    format.ts            sniffFormat(text): opencollection | openapi
    resolve.ts           resolveToOpenCollection(text): sniff + convert (lazy converters import)

  postman/               Postman import feature (framework-agnostic)
    postmanImport.ts     URL detection, share params, runPostmanImport()

  storage/               browser-local persistence (IndexedDB via idb)
    collectionStore.ts   the single IndexedDB store + CRUD + 50-entry LRU cap
    localUpload.ts       file uploads (?local=<key>)
    recentLinks.ts       gist/repo history entries
    importCache.ts       converted-Postman cache

  ui/                    React components
    HomePage.tsx         input, upload, recents/history, samples
    LocalUploadView.tsx  ?local= view (loads from IndexedDB)
    PostmanView.tsx      ?pm= view (cache-first import)
    SourceView.tsx       gist/repo view (fetch + record history)
    DocsRenderer.tsx     mounts the CDN renderer + a back-to-home button
    States.tsx           <Loading> and <Message> states
    RecentList.tsx       shared clickable list of stored collections
    HistoryPanel.tsx     full history as a second column: remove one / clear all
    PostmanEnvModal.tsx  optional environment links before import
    rendererAssets.ts    lazy CDN asset loader + waitForRenderer

  test/setup.ts          fake-indexeddb for the test env

api/                     serverless (host-agnostic core + Vercel adapter)
  lib/
    import-core.js       fetch + map + convert pipeline
    postman.js           keyless Postman fetch + SSRF guard (assertPostmanHost)
    mapper.js            internal Postman model -> v2.1 export shape
  postman-import.js      Vercel handler

netlify/functions/
  postman-import.mjs     Netlify v2 adapter (wraps api/lib/import-core.js)
```

Dependency direction: `ui` and `App` depend on `sources`, `postman`, `storage`,
`config`, `samples`. `storage` modules depend only on `collectionStore` (and
`sources` for key building). `sources`, `postman`, and `config` depend on nothing
internal. No cycles. The `sources`, `storage`, `postman`, and `collection`
layers are plain TypeScript (no React), so they are unit-tested without a DOM.

Every client-fetched document flows through `collection/resolve.ts` before it
reaches `<DocsRenderer>`: `SourceView` (after `loadCollectionText`) and
`LocalUploadView` (after `readLocalUpload`) both call `resolveToOpenCollection`,
which sniffs the format and converts non-OpenCollection specs (currently OpenAPI)
to OpenCollection YAML, lazily importing `@usebruno/converters` only when a
conversion is actually needed. Postman remains on its own server path because
Postman's host blocks CORS; the format is known there, so it needs no sniffer.

## Routing (`App.tsx`)

`<App>` inspects `window.location.search` once and renders exactly one view:

1. `?local=<key>` -> `<LocalUploadView>` (IndexedDB read)
2. `?pm=…` -> `<PostmanView>` (cache-first import)
3. a gist/repo source -> `<SourceView>` (fetch + record history)
4. nothing -> `<HomePage>`

Each view manages its own async load in an effect and renders `<Loading>`,
`<Message>`, or `<DocsRenderer>`. Navigation is full-page (`window.location.assign`),
so a view mounts once per page load and the app needs no client-side router.

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

## Testing

`vitest` with `fake-indexeddb/auto` (wired in `src/test/setup.ts`) gives the
storage layer a real IndexedDB. Specs cover the store CRUD + eviction cap, upload
save/read + title parsing, the Postman cache-key contract, and recent-link keying.
Pure param logic is covered by `sources/sourceParams.spec.ts`.
