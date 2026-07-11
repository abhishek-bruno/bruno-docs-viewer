/**
 * Collection-sharing source vocabulary — viewer copy of the shared contract.
 *
 * Mirrored across fetch.usebruno.com, the Bruno desktop deeplink parser, and
 * the Bruno renderer. Param keys (all URL-encoded):
 *   g         - short gist ref: owner/gistId/fileName → raw gist URL (no API)
 *   r         - short repo ref: org/repo → https://github.com/org/repo.git
 *   git_url   - full GitHub repo URL (syncable source)
 *   gist_url  - full raw gist URL (snapshot source)
 *   gist      - bare gist id (gist API — parse only, do not generate)
 *   path      - optional collection location within a repo (monorepo subdir)
 *
 * Parse precedence: long forms win over short when both are present.
 */

export const SHARE_HOST = 'https://share.usebruno.com';
export const FETCH_HOST = 'https://fetch.usebruno.com';

export interface SourcePointers {
  gitUrl: string;
  gistUrl: string;
  gist: string;
  path: string;
}

export interface GistComponents {
  owner: string;
  gistId: string;
  fileName: string;
}

const trim = (v: string | null): string => (v ? String(v).trim() : '');

/** Expand g=owner/gistId/fileName to a raw gist URL (no gist API). */
export const expandGistRef = (gistRef: string | null): string => {
  const ref = trim(gistRef);
  if (!ref) return '';

  const parts = ref.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  if (parts.length < 3) return '';

  const owner = parts[0];
  const gistId = parts[1];
  const fileName = parts.slice(2).join('/');
  if (!owner || !gistId || !fileName) return '';

  return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${fileName}`;
};

/** Expand r=org/repo to a github.com git URL. */
export const expandRepoRef = (repoRef: string | null): string => {
  const ref = trim(repoRef);
  if (!ref) return '';

  const parts = ref.split('/').filter(Boolean);
  if (parts.length < 2) return '';

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) return '';

  return `https://github.com/${owner}/${repo}.git`;
};

/** Parse a gist.githubusercontent.com raw URL into owner / gistId / fileName. */
export const parseGistRawUrl = (url: string): GistComponents | null => {
  try {
    const parsed = new URL(trim(url));
    if (!/gist\.githubusercontent\.com$/i.test(parsed.hostname)) return null;

    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/raw\/(.+)$/);
    if (!match) return null;

    const owner = match[1];
    const gistId = match[2];
    const fileName = decodeURIComponent(match[3]);
    if (!owner || !gistId || !fileName) return null;

    return { owner, gistId, fileName };
  } catch {
    return null;
  }
};

/** Validate and normalize a raw OpenCollection YAML document URL. */
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

/** Build g=owner/gistId/fileName from gist components. */
export const buildGistRef = ({ owner, gistId, fileName }: GistComponents): string => {
  if (!owner || !gistId || !fileName) return '';
  return `${owner}/${gistId}/${fileName}`;
};

/** Build r=org/repo from a canonical git remote URL (github.com only). */
export const buildRepoRef = (gitUrl: string): string => {
  const url = trim(gitUrl);
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (!/github\.com$/i.test(parsed.hostname)) return '';

    const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const owner = segments[0];
    let repo = segments[1];
    if (!owner || !repo) return '';
    repo = repo.replace(/\.git$/i, '');

    return `${owner}/${repo}`;
  } catch {
    return '';
  }
};

export const parseSource = (search: URLSearchParams): SourcePointers => {
  let gitUrl = trim(search.get('git_url'));
  let gistUrl = trim(search.get('gist_url'));
  const gist = trim(search.get('gist'));
  const path = trim(search.get('path'));

  if (!gistUrl) {
    gistUrl = expandGistRef(search.get('g'));
  }
  if (!gitUrl) {
    gitUrl = expandRepoRef(search.get('r'));
  }

  return { gitUrl, gistUrl, gist, path };
};

export type SourceKind = 'repo' | 'snapshot' | 'none';

/** git-first, gist-fallback — used for the "Open in Bruno" decision. */
export const decideSource = (source: SourcePointers): SourceKind => {
  if (source.gitUrl) return 'repo';
  if (source.gistUrl || source.gist) return 'snapshot';
  return 'none';
};

export const hasAnySource = (source: SourcePointers): boolean =>
  Boolean(source.gitUrl || source.gistUrl || source.gist);

export const appendSourceParams = (
  params: URLSearchParams,
  source: SourcePointers,
  { preferShort = false }: { preferShort?: boolean } = {}
): URLSearchParams => {
  if (preferShort) {
    const gistParts = parseGistRawUrl(source.gistUrl);
    const gistRef = gistParts ? buildGistRef(gistParts) : '';
    const repoRef = buildRepoRef(source.gitUrl);

    // Repo before gist so deep-link hashes sit after the .yml in g=, not after r=.
    if (repoRef) {
      params.set('r', repoRef);
    } else if (source.gitUrl) {
      params.set('git_url', source.gitUrl);
    }

    if (gistRef) {
      params.set('g', gistRef);
    } else if (source.gistUrl) {
      params.set('gist_url', source.gistUrl);
    }
  } else {
    if (source.gitUrl) params.set('git_url', source.gitUrl);
    if (source.gistUrl) params.set('gist_url', source.gistUrl);
    if (source.gist) params.set('gist', source.gist);
  }

  if (source.path) params.set('path', source.path);
  return params;
};

/** Build a share viewer URL on this host (or an explicit base). */
export const buildShareViewerUrl = (
  source: Pick<SourcePointers, 'gitUrl' | 'gistUrl' | 'gist' | 'path'>,
  {
    baseUrl = typeof window !== 'undefined' ? window.location.origin : SHARE_HOST,
    requestId,
    preferShort = true
  }: { baseUrl?: string; requestId?: string; preferShort?: boolean } = {}
): string => {
  const params = appendSourceParams(
    new URLSearchParams(),
    {
      gitUrl: source.gitUrl || '',
      gistUrl: source.gistUrl || '',
      gist: source.gist || '',
      path: source.path || ''
    },
    { preferShort }
  );
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
  kind: 'gist' | 'gist-api' | 'repo';
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
 * Ordered list of candidate render sources (gist-first). The viewer tries each
 * until one succeeds, which also gives us repo<->gist resilience.
 */
export const renderSourceCandidates = (source: SourcePointers): RenderSource[] => {
  const candidates: RenderSource[] = [];
  if (source.gistUrl) candidates.push({ kind: 'gist', url: source.gistUrl });
  if (source.gist) candidates.push({ kind: 'gist-api', url: `https://api.github.com/gists/${encodeURIComponent(source.gist)}` });
  if (source.gitUrl) {
    const raw = buildRepoRawUrl(source.gitUrl, source.path);
    if (raw) candidates.push({ kind: 'repo', url: raw });
  }
  return candidates;
};
