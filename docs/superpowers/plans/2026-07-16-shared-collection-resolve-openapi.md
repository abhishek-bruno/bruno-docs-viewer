# Shared Collection Resolve Stage + OpenAPI Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one shared "sniff format → convert → OpenCollection YAML" stage that every client-fetched source flows through, and wire OpenAPI (3.x + Swagger 2.0) through it as the first non-OpenCollection format.

**Architecture:** Today the renderer only eats OpenCollection YAML, and every client source (gist/repo/raw URL, local upload) blindly assumes its bytes already are OpenCollection; only Postman converts, on a separate server path. This plan adds a pure, DOM-free stage `resolveToOpenCollection(text)` = `sniffFormat(text)` then convert. It is applied at the two client render entry points (`SourceView`, `LocalUploadView`) just before the text reaches `<DocsRenderer>`. The `@usebruno/converters` bundle is loaded lazily (dynamic `import()`) so the common OpenCollection path pays no bundle cost. Adding Insomnia/WSDL/Postman-file later becomes one sniff branch + one converter branch.

**Tech Stack:** TypeScript, React 19, Vite, Vitest (node env, no DOM), `js-yaml`, `@usebruno/converters` (already a dependency).

**Out of scope (separate follow-up plans):** the `brunodo.cx/<url>` prefix route (URL routing only, feeds URLs into this stage); Insomnia/WSDL/Postman-file client conversion (one branch each once this lands); a dedicated "conversion failed" error message (this plan surfaces convert failures through the existing generic error path).

**Guiding constraint (keep in mind, do not implement here):** the viewer keeps as much processing client-side as possible, but the privacy line is about the user's **private/sensitive data, not public bytes**. Private data (local uploads, private/authenticated repos) must never touch our servers. Public data is already public, so proxying it leaks nothing confidential (only repo+IP metadata), and a proxy is acceptable.

For eventual native-Bruno-repo support (folders of `.bru` + `.yml`), including large collections (200+ files):
- **Public repos (preferred default):** `isomorphic-git` shallow clone (`depth: 1, singleBranch: true`) through a thin, content-agnostic CORS proxy, then parse `.bru` with `@usebruno/lang` and convert in the browser. Host-agnostic, one packfile regardless of collection size, no 60/hr API cap; the proxy relays only git bytes, so the server never sees the assembled collection.
- **Client-only alternative (GitHub-only, if we want a "we never see what you view" claim):** one recursive Git Trees API call (CORS-open, 1 against the 60/hr limit) for the full tree + blob SHAs, then per-file fetches from `raw.githubusercontent.com` (CORS-open CDN, **not** counted against the 60/hr API cap) with a concurrency cap, SHA-diff IndexedDB caching for incremental re-opens, and Web Worker parsing. Caveat: `isomorphic-git` cloning `github.com` over git smart-HTTP is **not** CORS-open, so it always needs the proxy.
- **Ideal end-state:** render structure from the tree and lazily fetch each request's `.bru` on demand (pairs with `#/req/<id>`), turning 200 fetches into a few. Requires renderer support for incremental population (current renderer takes a full OpenCollection document up front).
- **Hard client-side-only:** local uploads and private/authenticated sources are never proxied.

---

## File Structure

**New:**
- `src/collection/format.ts` — `CollectionFormat` type + `sniffFormat(text)`. Pure, no I/O, no React. One responsibility: classify bytes.
- `src/collection/format.spec.ts` — unit tests for the sniffer.
- `src/collection/resolve.ts` — `resolveToOpenCollection(text)`: sniff, and for non-OpenCollection lazily import converters and return OpenCollection YAML. Pure orchestration, no fetch, no React.
- `src/collection/resolve.spec.ts` — unit tests (OpenCollection pass-through + real OpenAPI conversion).

**Modified:**
- `src/ui/SourceView.tsx:18-21` — resolve the fetched text before rendering; title from the resolved text.
- `src/ui/LocalUploadView.tsx:8,13-25,27-38` — resolve the uploaded text before rendering; add an `error` state for convert failures.
- `README.md` — document the resolve stage + OpenAPI support.
- `ARCHITECTURE.md` — add the `collection/` layer and the resolve stage to the data flow.

**Why these boundaries:** `format.ts` is trivially testable with many fixtures and has zero dependencies. `resolve.ts` owns the converter table and the lazy import in one place, so a new format is a one-line branch here and nowhere else. Views stay thin: they fetch/read, then call one function. This matches the repo's existing rule (from `ARCHITECTURE.md`) that `sources`/`storage` are plain TS unit-tested without a DOM; view components are not unit-tested here (the vitest env is `node`, no jsdom), so view wiring is checked by build + manual smoke.

---

### Task 1: Format sniffer

**Files:**
- Create: `src/collection/format.ts`
- Test: `src/collection/format.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/collection/format.spec.ts
import { describe, it, expect } from 'vitest';
import { sniffFormat } from './format';

describe('sniffFormat', () => {
  it('classifies an OpenAPI 3.x document by the openapi key', () => {
    const text = 'openapi: 3.0.0\ninfo:\n  title: Sample API\n  version: 1.0.0\npaths: {}\n';
    expect(sniffFormat(text)).toBe('openapi');
  });

  it('classifies a Swagger 2.0 document by the swagger key', () => {
    const text = "swagger: '2.0'\ninfo:\n  title: Old API\n  version: 1.0.0\npaths: {}\n";
    expect(sniffFormat(text)).toBe('openapi');
  });

  it('treats a plain collection document as opencollection', () => {
    const text = 'name: My Collection\nitems: []\n';
    expect(sniffFormat(text)).toBe('opencollection');
  });

  it('falls back to opencollection for unparseable input', () => {
    expect(sniffFormat(': : : not yaml : :')).toBe('opencollection');
  });

  it('falls back to opencollection for a non-object scalar', () => {
    expect(sniffFormat('just a string')).toBe('opencollection');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/collection/format.spec.ts`
Expected: FAIL — `Failed to resolve import "./format"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/collection/format.ts
import yaml from 'js-yaml';

/**
 * Formats the viewer can turn into OpenCollection for the renderer. Only
 * formats with an implemented converter branch are classified; anything else
 * (including real OpenCollection) is left as 'opencollection' and passed
 * through unchanged.
 */
export type CollectionFormat = 'opencollection' | 'openapi';

/** Classify a fetched/uploaded document by inspecting its top-level shape. */
export function sniffFormat(text: string): CollectionFormat {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch {
    return 'opencollection';
  }
  if (doc && typeof doc === 'object') {
    const d = doc as Record<string, unknown>;
    // OpenAPI 3.x uses `openapi`, Swagger 2.0 uses `swagger`. openApiToBruno
    // handles both, so both map to the same branch.
    if (d.openapi || d.swagger) return 'openapi';
  }
  return 'opencollection';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/collection/format.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/collection/format.ts src/collection/format.spec.ts
git commit -m "feat(collection): add format sniffer (opencollection vs openapi)"
```

---

### Task 2: Resolve stage (sniff + OpenAPI conversion)

**Files:**
- Create: `src/collection/resolve.ts`
- Test: `src/collection/resolve.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/collection/resolve.spec.ts
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { resolveToOpenCollection } from './resolve';

describe('resolveToOpenCollection', () => {
  it('returns OpenCollection input unchanged (identity, no conversion)', async () => {
    const oc = 'name: My Collection\nitems: []\n';
    expect(await resolveToOpenCollection(oc)).toBe(oc);
  });

  it('converts an OpenAPI 3.x spec to OpenCollection YAML', async () => {
    const spec = [
      'openapi: 3.0.0',
      'info:',
      '  title: Sample API',
      '  version: 1.0.0',
      'paths:',
      '  /ping:',
      '    get:',
      '      summary: Ping',
      '      responses:',
      "        '200':",
      '          description: OK',
      ''
    ].join('\n');

    const out = await resolveToOpenCollection(spec);

    // Output must be a different document than the input spec...
    expect(out).not.toBe(spec);
    // ...that parses as YAML into an object...
    const parsed = yaml.load(out);
    expect(parsed && typeof parsed).toBe('object');
    // ...carries the API name through the conversion...
    expect(out).toContain('Sample API');
    // ...and is itself OpenCollection (no longer sniffs as openapi).
    const { sniffFormat } = await import('./format');
    expect(sniffFormat(out)).toBe('opencollection');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/collection/resolve.spec.ts`
Expected: FAIL — `Failed to resolve import "./resolve"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/collection/resolve.ts
import yaml from 'js-yaml';
import { sniffFormat } from './format';

/**
 * The single stage every client-fetched document flows through before it
 * reaches the renderer: detect the format and, when it is not OpenCollection,
 * convert it. Returns OpenCollection YAML.
 *
 * `@usebruno/converters` is imported lazily so the common OpenCollection path
 * never pulls the converter bundle into the main chunk.
 */
export async function resolveToOpenCollection(text: string): Promise<string> {
  const format = sniffFormat(text);
  if (format === 'opencollection') return text;

  // format === 'openapi'. openApiToBruno accepts the raw string, handles both
  // OpenAPI 3.x and Swagger 2.0, and returns the Bruno collection directly.
  const { openApiToBruno, brunoToOpenCollection } = await import('@usebruno/converters');
  const bruno = openApiToBruno(text);
  const oc = brunoToOpenCollection(bruno);
  return yaml.dump(oc, { lineWidth: -1, noRefs: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/collection/resolve.spec.ts`
Expected: PASS (2 tests). This exercises the real `@usebruno/converters`.

- [ ] **Step 5: Commit**

```bash
git add src/collection/resolve.ts src/collection/resolve.spec.ts
git commit -m "feat(collection): add resolveToOpenCollection with OpenAPI conversion"
```

---

### Task 3: Route SourceView through the resolve stage

**Files:**
- Modify: `src/ui/SourceView.tsx:1-31`

- [ ] **Step 1: Add the import**

Change the import block at the top of `src/ui/SourceView.tsx` (after line 3) to add:

```ts
import { resolveToOpenCollection } from '../collection/resolve';
```

- [ ] **Step 2: Resolve the fetched text before rendering**

Replace the effect body (`src/ui/SourceView.tsx:17-26`):

```ts
    (async () => {
      try {
        const text = await loadCollectionText(source);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        const kind: ErrorKind = err instanceof CollectionFetchError ? (err.kind as ErrorKind) : 'unknown';
        if (active) setState({ status: 'error', kind });
      }
    })();
```

with:

```ts
    (async () => {
      try {
        const raw = await loadCollectionText(source);
        const text = await resolveToOpenCollection(raw);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        // A convert failure is not a CollectionFetchError, so it surfaces as
        // the generic 'unknown' error state, same as before for bad bytes.
        const kind: ErrorKind = err instanceof CollectionFetchError ? (err.kind as ErrorKind) : 'unknown';
        if (active) setState({ status: 'error', kind });
      }
    })();
```

- [ ] **Step 3: Verify the build type-checks**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed, no type errors).

- [ ] **Step 4: Manually verify OpenAPI renders via a repo/URL source**

Run: `npm run dev`
Open: `http://localhost:5173/?gist_url=https%3A%2F%2Fraw.githubusercontent.com%2FOAI%2FOpenAPI-Specification%2Fmain%2Fexamples%2Fv3.0%2Fpetstore.yaml`
Expected: the Swagger Petstore renders in the docs viewer (its operations appear), proving a non-OpenCollection source is now sniffed and converted client-side. Then open any existing OpenCollection gist/repo URL and confirm it still renders unchanged (identity path).

- [ ] **Step 5: Commit**

```bash
git add src/ui/SourceView.tsx
git commit -m "feat(source): resolve fetched sources to OpenCollection before render"
```

---

### Task 4: Route LocalUploadView through the resolve stage

**Files:**
- Modify: `src/ui/LocalUploadView.tsx:1-39`

- [ ] **Step 1: Add the import and an error state**

Add after `src/ui/LocalUploadView.tsx:1` (the existing React import):

```ts
import { resolveToOpenCollection } from '../collection/resolve';
```

Replace the `State` type (`src/ui/LocalUploadView.tsx:8`):

```ts
type State = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; yaml: string };
```

with:

```ts
type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; yaml: string };
```

- [ ] **Step 2: Resolve the uploaded text and handle convert failure**

Replace the effect body (`src/ui/LocalUploadView.tsx:15-21`):

```ts
    (async () => {
      const yaml = await readLocalUpload(uploadKey);
      if (!active) return;
      if (!yaml) return setState({ status: 'missing' });
      void touchCollection(uploadKey);
      setState({ status: 'ready', yaml });
    })();
```

with:

```ts
    (async () => {
      const raw = await readLocalUpload(uploadKey);
      if (!active) return;
      if (!raw) return setState({ status: 'missing' });
      try {
        const yaml = await resolveToOpenCollection(raw);
        if (!active) return;
        void touchCollection(uploadKey);
        setState({ status: 'ready', yaml });
      } catch {
        if (active) setState({ status: 'error' });
      }
    })();
```

- [ ] **Step 3: Render the error state**

Add this branch after the `missing` branch (`src/ui/LocalUploadView.tsx:36`, before the final `return <DocsRenderer …>`):

```ts
  if (state.status === 'error') {
    return (
      <Message
        title="Couldn't read this file"
        body="This file could not be understood as a collection or a supported spec."
        action={{ type: 'go-home' }}
      />
    );
  }
```

- [ ] **Step 4: Verify the build type-checks**

Run: `npm run build`
Expected: PASS (no type errors; the `error` state is handled before the final return).

- [ ] **Step 5: Manually verify an uploaded OpenAPI spec renders**

Run: `npm run dev`
On the home page, upload a local OpenAPI YAML/JSON file (e.g. save the Petstore spec from Task 3 to disk and upload it).
Expected: it renders via `?local=<key>`. Then upload a normal OpenCollection YAML and confirm it still renders unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ui/LocalUploadView.tsx
git commit -m "feat(upload): resolve uploaded files to OpenCollection, add error state"
```

---

### Task 5: Document the resolve stage

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Add a Features/how-it-works note in README**

In `README.md`, under the `## Features` list, add a bullet:

```markdown
- Renders more than OpenCollection: any client-fetched source (gist, repo, raw
  URL, local upload) is sniffed and, if it is an OpenAPI 3.x or Swagger 2.0
  spec, converted to OpenCollection in the browser before rendering. Postman
  collections still convert server-side (their host blocks CORS).
```

- [ ] **Step 2: Add the collection/ layer to ARCHITECTURE**

In `ARCHITECTURE.md`, in the `src/` folder-layout block, add after the `sources/` entry:

```
  collection/            "what format is this, and make it OpenCollection"
    format.ts            sniffFormat(text): opencollection | openapi
    resolve.ts           resolveToOpenCollection(text): sniff + convert (lazy converters import)
```

Then add a paragraph after the "Dependency direction" paragraph:

```markdown
Every client-fetched document flows through `collection/resolve.ts` before it
reaches `<DocsRenderer>`: `SourceView` (after `loadCollectionText`) and
`LocalUploadView` (after `readLocalUpload`) both call `resolveToOpenCollection`,
which sniffs the format and converts non-OpenCollection specs (currently OpenAPI)
to OpenCollection YAML, lazily importing `@usebruno/converters` only when a
conversion is actually needed. Postman remains on its own server path because
Postman's host blocks CORS; the format is known there, so it needs no sniffer.
```

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md
git commit -m "docs: describe the shared collection resolve stage and OpenAPI support"
```

---

## Self-Review

**Spec coverage:**
- Shared sniff → convert → OpenCollection stage → Tasks 1 (sniff) + 2 (resolve/convert).
- Applied to all client sources → Task 3 (SourceView: gist/repo/raw URL) + Task 4 (LocalUploadView: uploads). Postman is explicitly left server-side (documented, Task 5).
- OpenAPI as the first branch, proving extensibility → Task 2 converter branch + Task 3/4 manual verification with a real spec.
- Lazy converter import (no main-bundle cost on the OpenCollection path) → Task 2 dynamic `import()`, checked by `npm run build` in Tasks 3/4 (Vite code-splits the dynamic import into its own chunk).

**Placeholder scan:** no TBD/"handle edge cases"/"similar to". Every code step shows complete code; every command shows expected output.

**Type consistency:** `CollectionFormat` = `'opencollection' | 'openapi'` (format.ts) is the exact union `resolveToOpenCollection` branches on (resolve.ts). `sniffFormat(text: string): CollectionFormat` and `resolveToOpenCollection(text: string): Promise<string>` signatures match every call site (SourceView, LocalUploadView, specs). Converter shapes match verified reality: `openApiToBruno(text)` returns the bruno collection directly (sync), `brunoToOpenCollection(bruno)` sync, both destructured from the lazy import. `yaml.dump(oc, { lineWidth: -1, noRefs: true })` matches the server pipeline's dump options.

**Note on tests:** view components (`SourceView`, `LocalUploadView`) are not unit-tested — the repo's vitest env is `node` with no jsdom, and only the pure `sources`/`storage`/`collection` layers carry specs (consistent with `ARCHITECTURE.md`). View wiring is verified by `npm run build` + a manual smoke in Tasks 3 and 4.
