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

Each view renders `<DocsRenderer>`, which lazily loads the CDN bundle, mounts the
renderer into a container node, and shows a floating **Back to home** button.
Navigation between views is full-page
(`window.location.assign`), which keeps every view shareable by URL.

The renderer is loaded lazily from the CDN (`<CDN_BASE>/docs/index.{js,css}`) only
when a collection renders, and the raw YAML is handed to it as a string.

## URL and params

Source vocabulary (shared with `fetch.usebruno.com` and the Bruno desktop deeplink
parser), all URL-encoded:

| Param | Meaning | Example |
|---|---|---|
| `g` | short gist ref `owner/gistId/fileName`, expands to a raw gist URL | `?g=jane/abc123/api.yml` |
| `gist_url` | full raw gist URL (snapshot) | |
| `gist` | bare gist id, uses the gist API (parse only, not generated) | |
| `r` | short repo ref `org/repo`, expands to a GitHub repo URL | `?r=usebruno/collection` |
| `git_url` | full GitHub repo URL (syncable) | |
| `path` | optional subdirectory within a repo (monorepo) | `?r=org/repo&path=apis/users` |
| `local` | browser-local upload key (`upload:<uuid>`) | `?local=upload%3A…` |
| `pm` | short Postman collection ref (the postman.com path), expands to the full URL | `?pm=/acme/ws/collection/ab12cd/orders` |
| `pe` | short Postman environment ref, repeatable | `?pe=/acme/ws/environment/123-abcd` |

Long forms (`git_url`, `gist_url`) win over short (`r`, `g`). A repo is a syncable
source, a gist is a snapshot. Repo sources resolve to a raw `opencollection.yml`
on `raw.githubusercontent.com`, honoring `/tree/<branch>/<subdir>` and `path`.
Request deep-linking: `#/req/<id>` selects a specific request.

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

The rendered page shows a floating **Back to home** button. The page URL itself is
the shareable link (`?pm=…&pe=…` for Postman, the source params for gist/repo);
local uploads keep their `?local=<key>` URL, which is browser-local only.

The fetch runs server-side because Postman's keyless `_api/*` endpoints send no
CORS headers. The official `api.getpostman.com` requires a key and is not used, so
no user key is needed. These are internal Postman endpoints, so treat them as
undocumented and subject to change and to Postman's terms. A server-side SSRF guard
(`assertPostmanHost`) allows only `postman.com` hosts before any user URL is fetched.

## Features

- View OpenCollection collections from a GitHub gist or repo, client-side.
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

## Serverless function

One function backs the Postman import, with the logic shared across hosts:

- `api/lib/import-core.js`: the fetch + map + convert pipeline (host-agnostic).
- `api/postman-import.js`: Vercel handler (`export default (req, res)`).
- `netlify/functions/postman-import.mjs`: Netlify function (v2). `netlify.toml`
  redirects `/api/postman-import` to it.

Both run on the Node runtime (required by `@usebruno/converters`), not Edge.

## Runtime dependencies

- **Docs renderer** from the CDN at `<CDN_BASE>/docs/index.{js,css}`. Loaded at
  runtime, not bundled. Set `CDN_BASE` in `src/config.ts`.
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
