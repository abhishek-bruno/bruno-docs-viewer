# bruno-docs-viewer

Public docs viewer for OpenCollection collections. Powers `share.usebruno.com`.

It reads a collection from a URL (a GitHub gist or repo) or a browser-local
upload and renders it with the Bruno docs renderer, entirely client-side. It also
builds an "Open in Bruno" deeplink so a reader can open the same collection in the
desktop app.

Zero production dependencies. It is a static frontend: it fetches collection data
from a URL and loads the renderer bundle from the CDN at runtime. It does not
bundle the renderer or link to any other repo's source.

## How it works

On load, `src/main.ts` runs:

1. **Local upload?** If `?local=<slot>` is present, read the YAML from
   `localStorage` and render it. Nothing is uploaded to a server.
2. **Parse the source** from the query string (`parseSource`).
3. **No source?** Render the home page so the user can paste a URL or upload a
   file.
4. **Otherwise** build an ordered list of candidate fetch URLs (gist first),
   fetch the first that succeeds, record it in recent links, and mount the
   renderer.
5. **Errors** map to friendly states: not-found, private/CORS (offers Open in
   Bruno), or a generic failure.

The renderer is loaded lazily from the CDN (a `<link>` + `<script>`) only when a
collection actually renders, and the raw YAML is handed to it as a string:

```
new Renderer({ target, opencollection: text, gitCollectionUrl, initialRequestId })
```

## URL and params

The source vocabulary is a shared contract, also used by `fetch.usebruno.com` and
the Bruno desktop deeplink parser. All values are URL-encoded.

| Param | Meaning | Example |
|---|---|---|
| `g` | short gist ref `owner/gistId/fileName`, expands to a raw gist URL (no API) | `?g=jane/abc123/api.yml` |
| `gist_url` | full raw gist URL (snapshot source) | |
| `gist` | bare gist id, uses the gist API (parse only, not generated) | |
| `r` | short repo ref `org/repo`, expands to a GitHub repo URL | `?r=usebruno/collection` |
| `git_url` | full GitHub repo URL (syncable source) | |
| `path` | optional subdirectory within a repo (monorepo) | `?r=org/repo&path=apis/users` |
| `local` | browser-local upload slot, `1..5` | `?local=1` |

**Precedence:** long forms (`git_url`, `gist_url`) win over short forms (`r`, `g`)
when both are present.

**Source kinds** (`decideSource`, git-first): a repo is a *syncable* source, a
gist is a *snapshot*. This decides the Open-in-Bruno behavior.

**Candidate resolution** (`renderSourceCandidates`, gist-first): the viewer tries
each until one succeeds, which gives repo/gist resilience:
1. `gist_url` fetched as raw text.
2. `gist` fetched via the gist API (`api.github.com/gists/<id>`); large gists that
   the API marks truncated fall back to their `raw_url`.
3. `git_url` converted to a raw `opencollection.yml` on
   `raw.githubusercontent.com`, honoring `/tree/<branch>/<subdir>` URLs and the
   `path` param, with the ref defaulting to `HEAD`.

**Deep-linking:** `#/req/<id>` selects a specific request. The renderer reads it on
mount (`getRequestIdFromHash`); an in-session hash change triggers a reload so the
requested item is selected.

**Share URL builder** (`buildShareViewerUrl`): produces short-form URLs by default
(`r=`, `g=`), placing the repo ref before the gist ref so a deep-link hash sits
after the `.yml`.

**Open in Bruno** (`buildFetchDeeplinkUrl`): passes all present pointers through to
`fetch.usebruno.com`.

## Features

- View OpenCollection collections from a GitHub gist or repo, fully client-side.
- Browser-local upload: paste or drop a YAML file, kept in `localStorage` across up
  to 5 slots (LRU eviction), viewable via `?local=<slot>`. Never sent to a server.
- Recent links: the last 10 viewed sources are kept in `localStorage` and listed on
  the home page.
- Open in Bruno deeplink for any shared source.
- Request-level deep-linking via `#/req/<id>`.
- Friendly error states, including a private-collection / CORS path that offers
  Open in Bruno instead of a dead end.

## Runtime dependencies

These are hosts the app talks to, not code dependencies:

- **Docs renderer** from the CDN at `<CDN_BASE>/docs/index.{js,css}`, currently
  `https://staging.cdn.usebruno.com`. Loaded at runtime, not bundled. Set
  `CDN_BASE` in `src/main.ts`.
- **GitHub** (gist API and raw content, `raw.githubusercontent.com`) for collection
  data. CORS-enabled by GitHub, so reads work in the browser.
- **fetch.usebruno.com** for the Open in Bruno deeplink target.

No production npm dependencies. Dev tooling only: TypeScript, Vite, Vitest.

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc + vite build
npm run preview  # preview the production build
npm test         # vitest
```

## Notes

- `CORS` applies only to Try-It style execution inside the renderer, not to viewing.
  Reading the collection from GitHub works because GitHub sends permissive CORS
  headers.
- `localStorage` keys use the legacy `share-app:` prefix (`share-app:local-slots`,
  `share-app:recent-links`).
