import './style.css';
import {
  parseSource,
  decideSource,
  hasAnySource,
  buildFetchDeeplinkUrl,
  buildShareViewerUrl,
  getRequestIdFromHash,
  renderSourceCandidates,
  type SourcePointers
} from './sourceParams';
import { renderHomePage } from './homePage';
import {
  parseLocalUploadSlot,
  parseCollectionTitle,
  readLocalUpload
} from './localUpload';
import { recordRecentLink } from './recentLinks';

const CDN_BASE = 'https://staging.cdn.usebruno.com';

type FetchErrorKind = 'not-found' | 'cors' | 'network' | 'unknown';

class CollectionFetchError extends Error {
  kind: FetchErrorKind;
  constructor(kind: FetchErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const app = document.getElementById('app') as HTMLElement;

const openInBrunoButton = (source: SourcePointers, variant: 'floating' | 'block'): string => {
  const href = buildFetchDeeplinkUrl(source);
  const cls = variant === 'floating' ? 'btn btn-primary floating' : 'btn btn-primary';
  return `<a class="${cls}" href="${href}">Open in Bruno</a>`;
};

const goToHomeButton = (): string => {
  const href = window.location.pathname || '/';
  return `<a class="btn btn-primary" href="${href}">Go to Home</a>`;
};

type MessageAction =
  | { type: 'open-in-bruno'; source: SourcePointers }
  | { type: 'go-home' }
  | { type: 'none' };

const renderActionButton = (action: MessageAction): string => {
  if (action.type === 'open-in-bruno') return openInBrunoButton(action.source, 'block');
  if (action.type === 'go-home') return goToHomeButton();
  return '';
};

const renderMessage = (title: string, body: string, action: MessageAction = { type: 'none' }) => {
  app.innerHTML = `
    <div class="state">
      <img class="state-logo" src="https://raw.githubusercontent.com/usebruno/mintlify-docs/main/logo/light.png" alt="Bruno" />
      <h1>${title}</h1>
      <p>${body}</p>
      ${renderActionButton(action)}
    </div>
  `;
};

const renderLoading = () => {
  app.innerHTML = `<div class="state"><p>Loading collection…</p></div>`;
};

const fetchText = async (url: string): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    // A thrown fetch is almost always CORS or an unreachable host. For a repo
    // file this typically means a private repository.
    throw new CollectionFetchError('cors', err instanceof Error ? err.message : 'Failed to fetch');
  }
  if (response.status === 404) {
    throw new CollectionFetchError('not-found', 'Not found');
  }
  if (!response.ok) {
    throw new CollectionFetchError('unknown', `Request failed (${response.status})`);
  }
  return response.text();
};

const fetchGistApi = async (url: string): Promise<string> => {
  const text = await fetchText(url);
  const data = JSON.parse(text);
  const files = Object.values((data?.files || {}) as Record<string, any>);
  const target =
    files.find((f: any) => /\.ya?ml$/i.test(f.filename || '')) ||
    files.find((f: any) => /opencollection/i.test(f.filename || '')) ||
    files[0];
  if (!target) {
    throw new CollectionFetchError('not-found', 'This gist contains no files.');
  }
  // Large gists are truncated by the API — fall back to the raw URL.
  if (target.truncated && target.raw_url) {
    return fetchText(target.raw_url);
  }
  return target.content as string;
};

/** Try each candidate (gist-first) until one succeeds. */
const loadCollectionText = async (
  source: SourcePointers
): Promise<{ text: string; lastError: CollectionFetchError | null }> => {
  const candidates = renderSourceCandidates(source);
  let lastError: CollectionFetchError | null = null;

  for (const candidate of candidates) {
    try {
      const text = candidate.kind === 'gist-api' ? await fetchGistApi(candidate.url) : await fetchText(candidate.url);
      return { text, lastError: null };
    } catch (err) {
      lastError = err instanceof CollectionFetchError ? err : new CollectionFetchError('unknown', String(err));
    }
  }

  throw lastError || new CollectionFetchError('unknown', 'No source could be loaded.');
};

const waitForRenderer = (timeoutMs = 10000): Promise<any> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if ((window as any).OpenCollection) return resolve((window as any).OpenCollection);
      if (Date.now() - started > timeoutMs) return reject(new Error('Renderer failed to load'));
      setTimeout(poll, 50);
    };
    poll();
  });

let rendererAssetsPromise: Promise<void> | null = null;

/** Load the renderer CSS + JS only when rendering a collection (avoids global link styles on error/home). */
const loadRendererAssets = (): Promise<void> => {
  if (!rendererAssetsPromise) {
    rendererAssetsPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${CDN_BASE}/docs/index.css`;
      link.onload = () => {
        const script = document.createElement('script');
        script.src = `${CDN_BASE}/docs/index.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Renderer failed to load'));
        document.head.appendChild(script);
      };
      link.onerror = () => reject(new Error('Renderer styles failed to load'));
      document.head.appendChild(link);
    });
  }
  return rendererAssetsPromise;
};

const mountDocs = async (text: string, source: SourcePointers) => {
  await loadRendererAssets();
  const showOpenInBruno = hasAnySource(source);
  app.innerHTML = `
    <div id="opencollection-container"></div>
    ${showOpenInBruno ? openInBrunoButton(source, 'floating') : ''}
  `;

  const Renderer = await waitForRenderer();
  new Renderer({
    target: document.getElementById('opencollection-container'),
    opencollection: text,
    gitCollectionUrl: source.gitUrl || undefined,
    initialRequestId: getRequestIdFromHash()
  });
};

const viewLocalUpload = async (yaml: string) => {
  renderLoading();
  try {
    await mountDocs(yaml, { gistUrl: '', gitUrl: '', gist: '', path: '' });
  } catch {
    renderMessage(
      'Couldn\'t load this collection',
      'The YAML file could not be rendered. Check that it is a valid OpenCollection file.',
      { type: 'go-home' }
    );
  }
};

const main = async () => {
  const search = new URLSearchParams(window.location.search);
  const localSlot = parseLocalUploadSlot(search);

  if (localSlot) {
    renderLoading();
    const yaml = readLocalUpload(localSlot);
    if (!yaml) {
      renderMessage(
        'Collection not found',
        'This local preview is no longer available in your browser. Upload it again from the home page.',
        { type: 'go-home' }
      );
      return;
    }
    await viewLocalUpload(yaml);
    return;
  }

  const source = parseSource(search);

  // Missing params — show the landing form so users can paste a YAML source.
  if (!hasAnySource(source)) {
    renderHomePage(app, {
      onUrlSubmit: (normalized) => {
        window.location.assign(
          buildShareViewerUrl(
            { gistUrl: normalized.gistUrl, gitUrl: normalized.gitUrl, gist: '', path: '' },
            { preferShort: true }
          )
        );
      }
    });
    return;
  }

  renderLoading();

  try {
    const { text } = await loadCollectionText(source);
    recordRecentLink(source, parseCollectionTitle(text));
    await mountDocs(text, source);
  } catch (err) {
    const kind = err instanceof CollectionFetchError ? err.kind : 'unknown';
    const isRepoOnly = decideSource(source) === 'repo' && !source.gistUrl && !source.gist;

    if (kind === 'not-found') {
      renderMessage('Collection not found', 'This shared collection no longer exists.', { type: 'go-home' });
      return;
    }

    if (kind === 'cors') {
      if (isRepoOnly) {
        renderMessage(
          'Private collection',
          'This collection is private and can\'t be viewed in the browser. Open it in Bruno to view and sync it.',
          { type: 'open-in-bruno', source }
        );
        return;
      }
      renderMessage(
        'Couldn\'t load this collection',
        'The collection source could not be reached in the browser. You can still open it in Bruno.',
        { type: 'open-in-bruno', source }
      );
      return;
    }

    renderMessage(
      'Couldn\'t load this collection',
      'Something went wrong loading this collection.',
      { type: 'go-home' }
    );
  }
};

void main();

// Apply a deep link selected after load when the hash changes in-session.
window.addEventListener('hashchange', () => {
  // The renderer reads `#/req/<id>` on mount; a full reload guarantees the
  // requested item is selected for an externally-changed hash.
  if (getRequestIdFromHash()) {
    window.location.reload();
  }
});
