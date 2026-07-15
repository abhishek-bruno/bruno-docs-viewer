import { EMPTY_SOURCE, isGitRepoUrl, normalizeYamlDocumentUrl, type SourcePointers } from './sourceParams';
import { isPostmanCollectionUrl } from '../postman/postmanImport';

export type SourceIntent =
  | { kind: 'postman'; collectionUrl: string; environmentUrls: string[] }
  | { kind: 'source'; source: SourcePointers };

/** A full source URL -> a routing intent, or null if unrecognized. */
export function classifySourceUrl(input: string): SourceIntent | null {
  const url = (input || '').trim();
  if (!url) return null;

  if (isPostmanCollectionUrl(url)) {
    return { kind: 'postman', collectionUrl: url, environmentUrls: [] };
  }
  if (isGitRepoUrl(url)) {
    return { kind: 'source', source: { ...EMPTY_SOURCE, gitUrl: url } };
  }

  let host = '';
  let segments: string[] = [];
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    segments = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  } catch {
    return null;
  }

  // A gist *page* URL -> its bare id (resolved via the gist API by SourceView).
  if (host === 'gist.github.com' && segments.length) {
    return { kind: 'source', source: { ...EMPTY_SOURCE, gist: segments[segments.length - 1] } };
  }

  // Anything else that's a valid https URL -> a raw document (the resolve stage
  // sniffs OpenCollection vs OpenAPI at render).
  const raw = normalizeYamlDocumentUrl(url);
  if (raw) return { kind: 'source', source: { ...EMPTY_SOURCE, rawUrl: raw } };

  return null;
}

/**
 * Parse a prefix-route path into a source intent. Everything from the first `/`
 * to `#` (including the source URL's own query) is the scheme-stripped source
 * URL. Returns null for the home path (`/`).
 */
export function parsePrefixPath(pathname: string, search: string): SourceIntent | null {
  if (!pathname || pathname === '/') return null;
  const rest = pathname.replace(/^\/+/, '') + (search || '');
  if (!rest) return null;
  const url = /^https?:\/\//i.test(rest) ? rest : `https://${rest}`;
  return classifySourceUrl(url);
}
