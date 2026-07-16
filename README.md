# bruno-docs-viewer

Public docs viewer for OpenCollection collections. Powers `share.usebruno.com`.

It reads a collection from a URL (a GitHub gist or repo), a browser-local upload,
or a public Postman collection, and renders it with the Bruno docs renderer. It
also builds an "Open in Bruno" deeplink so a reader can open the same collection
in the desktop app.

The frontend is a Vite + React (TypeScript) static app. It loads the renderer
bundle from the CDN at runtime and, for the Postman path, calls one serverless
function.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the folder layout, storage model, and
data flow.

## How it works

On load, `src/App.tsx` routes on the query string, in order:

1. **Local upload?** If `?local=<key>` is present, read the YAML from IndexedDB
   and render it (`LocalUploadView`).
2. **Postman share?** If `?pm=…` is present, resolve it cache-first (`PostmanView`).
3. **A gist/repo source?** Fetch the first candidate that succeeds (gist first),
   record it in history, and mount the renderer (`SourceView`).
4. **No source?** Render the home page (`HomePage`). The URL input accepts gist /
   GitHub repo / OpenCollection YAML URLs and a **Postman collection URL** (see
   below); there is also a local file upload. With no history yet, it shows a few
   clickable **samples**.

Each view renders `<DocsRenderer>`, which lazily loads the CDN bundle and mounts the
renderer into a container node. The renderer's header carries the home button
(`backToHomeHref`) and, for a shareable source, **Open in Bruno**. A floating
**Back to home** fallback also shows in production until the CDN renderer honors
`backToHomeHref`. Navigation between views is full-page (`window.location.assign`),
which keeps every view shareable by URL.

The renderer is loaded lazily from the CDN (`<CDN_BASE>/docs/index.{js,css}`) only
when a collection renders, and the raw YAML is handed to it as a string.

## URL and params

Source vocabulary (shared with `fetch.usebruno.com` and the Bruno desktop deeplink
parser), all URL-encoded. One canonical long form per source:

| Param | Meaning | Example |
|---|---|---|
| `git_url` | a git repo (GitHub/GitLab/Bitbucket/self-hosted), incl. `/tree/<branch>/<subdir>` | `?git_url=https://github.com/org/repo/tree/main/collection` |
| `raw_url` | a raw OpenCollection document URL (snapshot) | `?raw_url=https://raw.githubusercontent.com/org/repo/main/opencollection.yml` |
| `openapi_url` | a raw OpenAPI / Swagger spec URL (converted to OpenCollection) | `?openapi_url=https://petstore3.swagger.io/api/v3/openapi.json` |
| `gist` | bare gist id (resolved via the gist API) | `?gist=6037ec28edf197eeb11b09606fda7371` |
| `path` | optional subdirectory within a repo (monorepo) | `?git_url=…&path=apis/users` |
| `local` | browser-local upload key (`upload:<uuid>`) | `?local=upload%3A…` |
| `pm` | short Postman collection ref (the postman.com path), expands to the full URL | `?pm=/acme/ws/collection/ab12cd/orders` |
| `pe` | short Postman environment ref, repeatable | `?pe=/acme/ws/environment/123-abcd` |

A `git_url` repo is opened by cloning it (server-side, via the git-import
function) and converting the native `.bru`/`.yml` collection — unless it has a
single bundled `opencollection.yml`, which is fetched directly as a fast path.
A monorepo with several collections shows a picker; `path` (or a `/tree/…`
subdir) targets one. `raw_url`/`openapi_url` are fetched and rendered/converted
in the browser. Request deep-linking: `#/req/<id>` selects a specific request.

## Prepend the domain

Any source can also be opened by putting the viewer host **in front of** its
URL (the vscode.dev trick), so nothing about the source URL has to change:

```
share.usebruno.com/www.postman.com/<workspace>/collection/<id>/<name>
share.usebruno.com/github.com/org/repo/tree/main/collection
share.usebruno.com/gist.github.com/<user>/<gistId>
share.usebruno.com/petstore3.swagger.io/api/v3/openapi.json
```

Everything from the first `/` to `#` is the source URL (scheme assumed `https`);
`#/req/<id>` still deep-links a request. It's classified into the same source
model as the paste box — Postman collections, git repos (GitHub / GitLab /
Bitbucket, incl. `/tree/<branch>/<subdir>`), gists, and raw OpenCollection /
OpenAPI URLs. Postman via the prefix carries the collection only; environments
use the `?pm=&pe=` form. A Netlify SPA rewrite serves the app for these paths.

## Import from Postman

Paste a public Postman collection URL (`https://www.postman.com/<workspace>/collection/<id>/<name>`)
into the same home-page input. `isPostmanCollectionUrl` detects it and opens a
modal to add optional Postman environment links. On submit the viewer navigates
to a shareable short URL, `?pm=<collection>&pe=<env>…`, so the link reproduces
the import when opened or shared. A non-collection Postman URL (e.g. an
`…/environment/…` link) is rejected in the input, and environment fields must be
`…/environment/…` URLs.

On load, `parsePostmanShareParams` reads `pm`/`pe`, then:

1. Check the IndexedDB import cache (`storage/importCache.ts`), keyed by the
   collection URL plus its environment URLs. On a hit, render immediately with no
   server call (and bump its recency).
2. On a miss, call the serverless function, cache the result, and render.

The serverless pipeline:

1. Resolve the collection uid. A short-id workspace URL carries no uid, so the
   function fetches the public page as a crawler and extracts the uid; a URL that
   already carries a uid is used directly. Environment URLs carry the uid inline.
2. Fetch the collection and environments keyless from Postman's internal
   `_api/collection/{uid}?populate=true` and `_api/environment/{uid}` endpoints.
3. Map Postman's internal model to the v2.1 export shape (`api/lib/mapper.js`).
4. Convert with `@usebruno/converters`: `postmanToBruno` + `postmanToBrunoEnvironment`,
   then `brunoToOpenCollection`.
5. Return the OpenCollection document as YAML.

The endpoint is a `GET /api/postman-import?pm=<collection>&pe=<env>…` that
returns the OpenCollection as `text/yaml`. This same URL backs **Open in Bruno**
on the Postman view: the deeplink sets `raw_url` to it, so the desktop app
imports the converted collection through its normal snapshot path and the
postman.com fetch/convert stays server-side (nothing Postman-specific in the
desktop app).

The page URL itself is the shareable link (`?pm=…&pe=…` for Postman, the source
params for gist/repo); local uploads keep their `?local=<key>` URL, which is
browser-local only.

The fetch runs server-side because Postman's keyless `_api/*` endpoints send no
CORS headers. The official `api.getpostman.com` requires a key and is not used, so
no user key is needed. These are internal Postman endpoints, so treat them as
undocumented and subject to change and to Postman's terms. A server-side SSRF guard
(`assertPostmanHost`) allows only `postman.com` hosts before any user URL is fetched.

## Features

- View OpenCollection collections from a GitHub gist or repo, client-side.
- Renders more than OpenCollection: any client-fetched source (gist, repo, raw
  URL, local upload) is sniffed and, if it is an OpenAPI 3.x or Swagger 2.0
  spec, converted to OpenCollection in the browser before rendering. Postman
  collections still convert server-side (their host blocks CORS).
- View a **native Bruno collection** from a public git repo (GitHub / GitLab /
  Bitbucket / self-hosted) — a `.bru` or `.yml` tree, not a single
  `opencollection.yml`. A serverless function clones the repo, loads the
  collection (reusing `@usebruno/cli`'s loader), and converts it to
  OpenCollection. A monorepo with several collections shows a picker; each
  collection gets a shareable `?git_url=…&path=<dir>` URL.
- Import and view public Postman collections (plus optional environments), no key.
- Browser-local upload: paste or drop a YAML file, kept in IndexedDB and viewable
  via `?local=<key>`. Never sent to a server.
- History: every viewed source (upload, link, Postman) is cached in IndexedDB, up
  to 50 entries (least-recently-opened evicted). The home page lists the most
  recent; "View all history" opens the full list as a second column, where each
  entry can be removed or all cleared.
- Converted collections are cached, so re-opening a link or Postman import skips
  the fetch/convert step.
- Open in Bruno deeplink; request-level deep-linking via `#/req/<id>`.
- Sample collections on the empty home page (a gist YAML and a public Postman
  collection with its environment) to try the viewer with one click.
- Friendly error states, including a private-collection / CORS path.

## Serverless functions

Two functions, each a host-agnostic core with thin Vercel + Netlify adapters:

- **Postman import** — `api/lib/import-core.js` (fetch + map + convert); handlers
  `api/postman-import.js` (Vercel) and `netlify/functions/postman-import.mjs`. A
  `GET` (`?pm=&pe=`) returning `text/yaml`, used by both the viewer's render fetch
  and the Open-in-Bruno `raw_url` deeplink.
- **Git repo import** — `api/lib/git-core.js` clones the repo with `isomorphic-git`
  into a temp dir (`api/lib/git-clone.js`, with an SSRF guard), discovers + loads
  collections via the ported `@usebruno/cli` loader (`api/lib/collection-loader.js`),
  and converts with `brunoToOpenCollection`. Handlers `api/git-import.js` (Vercel)
  and `netlify/functions/git-import.mjs`. Returns a single OpenCollection YAML, or
  a `{ name, path }[]` list for a monorepo. `netlify.toml` redirects `/api/*` to
  each. Self-hosted git hosts are enabled with `GIT_IMPORT_ALLOWED_HOSTS`.

Both run on the Node runtime (required by `@usebruno/converters`), not Edge.

## Runtime dependencies

- **Docs renderer** from the CDN at `<CDN_BASE>/docs/index.{js,css}`. Loaded at
  runtime, not bundled. The URLs default to the CDN (`src/config.ts`) and can be
  overridden per-environment with `VITE_RENDERER_JS_URL` / `VITE_RENDERER_CSS_URL`
  (see **Local renderer** below).
- **GitHub / GitLab-style raw endpoints** for gist and repo collection data
  (CORS-open, read in the browser).
- **fetch.usebruno.com** for the Open in Bruno deeplink target.
- The Postman import function calls Postman's internal `_api/*` endpoints
  server-side.

The frontend's production dependencies are `react`, `react-dom`, and `idb`
(IndexedDB wrapper). The function depends on `@usebruno/converters` and `js-yaml`.

## Local development

```bash
npm install
npm run dev      # Vite dev server, frontend only (no /api function)
npm test         # vitest (uses fake-indexeddb for the storage layer)
npm run build    # tsc + vite build
```

For the full app including the Postman import function, run it through a host CLI
that serves the function with the production runtime:

```bash
netlify dev      # or: vercel dev
```

### Local renderer

By default the docs renderer loads from the CDN. To iterate against a locally
built `oc-docs` renderer instead (in the `opencollection` repo):

```bash
# 1. Build the standalone renderer bundle (window.OpenCollection global)
cd path/to/opencollection/packages/oc-docs
npm run build:standalone                 # -> dist-standalone/api-docs.{js,css}

# 2. Serve that folder on a fixed port
npx serve dist-standalone -l 5555

# 3. In bruno-docs-viewer, copy .env.example to .env.local and set:
#    VITE_RENDERER_JS_URL=http://localhost:5555/api-docs.js
#    VITE_RENDERER_CSS_URL=http://localhost:5555/api-docs.css
npm run dev                              # restart so Vite picks up .env.local
```

`.env.local` is gitignored, so the CDN default stays untouched for everyone else.
For a rebuild-on-change loop, run the standalone build in watch mode
(`vite build --config vite.config.standalone.ts --watch`) alongside the static server.

Plain `npm run dev` does not serve `/api/postman-import`.

## Deployment (Netlify)

`netlify.toml` builds the Vite frontend to `dist` and serves the function from
`netlify/functions`. The client calls `/api/postman-import`; a `netlify.toml`
redirect maps that path to the function. Connect the repo in Netlify or run
`netlify deploy --build --prod`. The function needs the Node runtime (default on
Netlify Functions).

## Notes

- CORS applies only to Try-It execution inside the renderer and to the Postman
  `_api` fetch (handled server-side), not to viewing gist/repo collections.
- All browser-local state lives in one IndexedDB database, `bruno-docs-viewer`.
