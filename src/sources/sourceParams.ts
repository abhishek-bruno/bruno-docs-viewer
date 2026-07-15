/**
 * Collection-sharing source vocabulary — viewer copy of the shared contract.
 *
 * Mirrored across fetch.usebruno.com, the Bruno desktop deeplink parser, and
 * the Bruno renderer. Param keys (all URL-encoded), one long form each:
 *   git_url     - full GitHub repo URL (syncable source)
 *   raw_url     - full raw OpenCollection document URL (snapshot source)
 *   openapi_url - full raw OpenAPI / Swagger spec URL (snapshot, converted)
 *   gist        - bare gist id (resolved via the gist API)
 *   path        - optional collection location within a repo (monorepo subdir)
 */

export const SHARE_HOST = 'https://share.usebruno.com';
export const FETCH_HOST = 'https://fetch.usebruno.com';

export interface SourcePointers {
  gitUrl: string;
  rawUrl: string;
  openapiUrl: string;
  gist: string;
  path: string;
}

/** A source with no pointers, used for uploads and imported (sourceless) YAML. */
export const EMPTY_SOURCE: SourcePointers = { gitUrl: '', rawUrl: '', openapiUrl: '', gist: '', path: '' };

const trim = (v: string | null): string => (v ? String(v).trim() : '');

/** Validate and normalize a raw document URL (OpenCollection or OpenAPI). */
export const normalizeYamlDocumentUrl = (input: string): string | null => {
  const value = trim(input);
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
};

/** Normalize a GitHub repository URL to https://github.com/{owner}/{repo}.git */
export const normalizeGitRepoUrl = (input: string): string | null => {
  const value = trim(input);
  if (!value) return null;

  try {
    const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (!/github\.com$/i.test(parsed.hostname)) return null;

    const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const owner = segments[0];
    let repo = segments[1];
    if (!owner || !repo) return null;
    repo = repo.replace(/\.git$/i, '');

    return `https://github.com/${owner}/${repo}.git`;
  } catch {
    return null;
  }
};

export const parseSource = (search: URLSearchParams): SourcePointers => {
  const gitUrl = trim(search.get('git_url'));
  const rawUrl = trim(search.get('raw_url'));
  const openapiUrl = trim(search.get('openapi_url'));
  const gist = trim(search.get('gist'));
  const path = trim(search.get('path'));

  return { gitUrl, rawUrl, openapiUrl, gist, path };
};

export type SourceKind = 'repo' | 'openapi' | 'snapshot' | 'none';

/** git-first, then openapi, then snapshot — used for the "Open in Bruno" decision. */
export const decideSource = (source: SourcePointers): SourceKind => {
  if (source.gitUrl) return 'repo';
  if (source.openapiUrl) return 'openapi';
  if (source.rawUrl || source.gist) return 'snapshot';
  return 'none';
};

export const hasAnySource = (source: SourcePointers): boolean =>
  Boolean(source.gitUrl || source.rawUrl || source.openapiUrl || source.gist);

export const appendSourceParams = (params: URLSearchParams, source: SourcePointers): URLSearchParams => {
  if (source.gitUrl) params.set('git_url', source.gitUrl);
  if (source.rawUrl) params.set('raw_url', source.rawUrl);
  if (source.openapiUrl) params.set('openapi_url', source.openapiUrl);
  if (source.gist) params.set('gist', source.gist);
  if (source.path) params.set('path', source.path);
  return params;
};

/** Build a share viewer URL on this host (or an explicit base). */
export const buildShareViewerUrl = (
  source: Pick<SourcePointers, 'gitUrl' | 'rawUrl' | 'openapiUrl' | 'gist' | 'path'>,
  {
    baseUrl = typeof window !== 'undefined' ? window.location.origin : SHARE_HOST,
    requestId
  }: { baseUrl?: string; requestId?: string } = {}
): string => {
  const params = appendSourceParams(new URLSearchParams(), {
    gitUrl: source.gitUrl || '',
    rawUrl: source.rawUrl || '',
    openapiUrl: source.openapiUrl || '',
    gist: source.gist || '',
    path: source.path || ''
  });
  const query = params.toString();
  const hash = requestId
    ? `#/req/${requestId.split('/').map(encodeURIComponent).join('/')}`
    : '';
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/${query ? `?${query}` : ''}${hash}`;
};

/** Build the "Open in Bruno" target — passes through ALL present pointers. */
export const buildFetchDeeplinkUrl = (source: SourcePointers): string => {
  const params = appendSourceParams(new URLSearchParams(), source);
  const query = params.toString();
  return `${FETCH_HOST}/${query ? `?${query}` : ''}`;
};

/** Read `#/req/<id>` from the URL hash. */
export const getRequestIdFromHash = (): string | undefined => {
  const match = (window.location.hash || '').match(/^#\/req\/(.+)$/);
  return match ? match[1] : undefined;
};

interface RenderSource {
  kind: 'doc' | 'gist-api' | 'repo';
  url: string;
}

/**
 * Convert a GitHub repo URL (+ optional subdir) into a raw, CORS-open URL for
 * the collection's opencollection.yml. Honors `/tree/<branch>/<subdir>` URLs
 * and the explicit `path` param. Defaults the ref to HEAD.
 */
export const buildRepoRawUrl = (gitUrl: string, subPath: string): string | null => {
  try {
    const parsed = new URL(gitUrl);
    if (!/github\.com$/i.test(parsed.hostname)) {
      return null;
    }
    const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const owner = segments[0];
    let repo = segments[1];
    if (!owner || !repo) return null;
    repo = repo.replace(/\.git$/i, '');

    let ref = 'HEAD';
    let inRepoPath: string[] = [];
    if (segments[2] === 'tree' && segments[3]) {
      ref = segments[3];
      inRepoPath = segments.slice(4);
    }

    const subPathSegments = (subPath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const dir = [...inRepoPath, ...subPathSegments].filter(Boolean).join('/');
    const file = `${dir ? `${dir}/` : ''}opencollection.yml`;

    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}`;
  } catch {
    return null;
  }
};

/**
 * Ordered list of candidate render sources (document-first). The viewer tries
 * each until one succeeds, which also gives us repo<->doc resilience. Every
 * non-repo candidate is fetched as plain text; the resolve stage then sniffs
 * and converts (OpenAPI) as needed.
 */
export const renderSourceCandidates = (source: SourcePointers): RenderSource[] => {
  const candidates: RenderSource[] = [];
  if (source.rawUrl) candidates.push({ kind: 'doc', url: source.rawUrl });
  if (source.openapiUrl) candidates.push({ kind: 'doc', url: source.openapiUrl });
  if (source.gist) candidates.push({ kind: 'gist-api', url: `https://api.github.com/gists/${encodeURIComponent(source.gist)}` });
  if (source.gitUrl) {
    const raw = buildRepoRawUrl(source.gitUrl, source.path);
    if (raw) candidates.push({ kind: 'repo', url: raw });
  }
  return candidates;
};
