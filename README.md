# bruno-docs-viewer

Public docs viewer for OpenCollection collections. Powers `share.usebruno.com`.

It reads a collection from a URL (a GitHub gist or repo), a browser-local upload,
or a public Postman collection, and renders it with the Bruno docs renderer. It
also builds an "Open in Bruno" deeplink so a reader can open the same collection
in the desktop app.

The frontend is a zero-dependency Vite/TS static app. It loads the renderer bundle
from the CDN at runtime and, for the Postman path, calls one serverless function.

## How it works

On load, `src/main.ts` runs:

1. **Local upload?** If `?local=<slot>` is present, read the YAML from
   `localStorage` and render it.
2. **Parse the source** from the query string (`parseSource`).
3. **No source?** Render the home page. The URL input accepts gist / GitHub repo /
   OpenCollection YAML URLs, and a **Postman collection URL** (see below). There is
   also a local file upload.
4. **Otherwise** build candidate fetch URLs (gist first), fetch the first that
   succeeds, record it in recent links, and mount the renderer.

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
| `local` | browser-local upload slot, `1..5` | `?local=1` |

Long forms (`git_url`, `gist_url`) win over short (`r`, `g`). A repo is a syncable
source, a gist is a snapshot. Repo sources resolve to a raw `opencollection.yml`
on `raw.githubusercontent.com`, honoring `/tree/<branch>/<subdir>` and `path`.
Request deep-linking: `#/req/<id>` selects a specific request.

## Import from Postman

Paste a public Postman collection URL (`https://www.postman.com/<workspace>/collection/<id>/<name>`)
into the same home-page input. `isPostmanCollectionUrl` detects it and opens a
modal that:

- shows the detected collection URL,
- lets you add optional environment links,
- discloses that this path uses Bruno's server (unlike file uploads),
- on submit, posts to the serverless function and renders the result.

Pipeline (server-side, in the function):

1. Resolve the collection uid. A short-id workspace URL carries no uid, so the
   function fetches the public page as a crawler and extracts the uid; a URL that
   already carries a uid is used directly. Environment URLs carry the uid inline.
2. Fetch the collection and environments keyless from Postman's internal
   `_api/collection/{uid}?populate=true` and `_api/environment/{uid}` endpoints.
3. Map Postman's internal model to the v2.1 export shape (`api/lib/mapper.js`).
4. Convert with `@usebruno/converters`: `postmanToBruno` + `postmanToBrunoEnvironment`,
   then `brunoToOpenCollection`.
5. Return the OpenCollection document as YAML; the client stores it in a local slot
   and renders it.

The fetch runs server-side because Postman's keyless `_api/*` endpoints send no
CORS headers. The official `api.getpostman.com` requires a key and is not used, so
no user key is needed. These are internal Postman endpoints, so treat them as
undocumented and subject to change and to Postman's terms.

## Features

- View OpenCollection collections from a GitHub gist or repo, client-side.
- Import and view public Postman collections (plus optional environments), no key.
- Browser-local upload: paste or drop a YAML file, kept in `localStorage` across up
  to 5 slots (LRU eviction), viewable via `?local=<slot>`. Never sent to a server.
- Recent links: the last 10 viewed sources, listed on the home page.
- Open in Bruno deeplink; request-level deep-linking via `#/req/<id>`.
- Friendly error states, including a private-collection / CORS path.

## Serverless function

One function backs the Postman import, with the logic shared across hosts:

- `api/lib/import-core.js`: the fetch + map + convert pipeline (host-agnostic).
- `api/postman-import.js`: Vercel handler (`export default (req, res)`).
- `netlify/functions/postman-import.mjs`: Netlify function (v2), served at
  `/api/postman-import` via `config.path` (with a redirect fallback in `netlify.toml`).

Both run on the Node runtime (required by `@usebruno/converters`), not Edge.

## Runtime dependencies

- **Docs renderer** from the CDN at `<CDN_BASE>/docs/index.{js,css}`. Loaded at
  runtime, not bundled. Set `CDN_BASE` in `src/main.ts`.
- **GitHub / GitLab-style raw endpoints** for gist and repo collection data
  (CORS-open, read in the browser).
- **fetch.usebruno.com** for the Open in Bruno deeplink target.
- The Postman import function calls Postman's internal `_api/*` endpoints
  server-side.

Frontend has no production npm dependencies. The function depends on
`@usebruno/converters` and `js-yaml`.

## Local development

```bash
npm install
npm run dev      # Vite dev server, frontend only (no /api function)
npm test         # vitest
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
`netlify/functions`. The client calls `/api/postman-import`; the Netlify function's
`config.path` (and a redirect fallback) map that path to it. Connect the repo in
Netlify or run `netlify deploy --build --prod`. The function needs the Node runtime
(default on Netlify Functions).

## Notes

- CORS applies only to Try-It execution inside the renderer and to the Postman
  `_api` fetch (handled server-side), not to viewing gist/repo collections.
- `localStorage` keys use the legacy `share-app:` prefix.
