import yaml from 'js-yaml';
import { apiUrl } from '../config';

const parsePostmanUrl = (value: string): URL | null => {
  try {
    const u = new URL(String(value).trim());
    return /(^|\.)postman\.com$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
};

export const isPostmanUrl = (value: string): boolean => parsePostmanUrl(value) !== null;

export const isPostmanCollectionUrl = (value: string): boolean => {
  const u = parsePostmanUrl(value);
  return !!u && /\/collection\//i.test(u.pathname);
};

export const isPostmanEnvironmentUrl = (value: string): boolean => {
  const u = parsePostmanUrl(value);
  return !!u && /\/environment\//i.test(u.pathname);
};

/** A workspace URL: a postman.com URL with handle+slug that isn't a specific entity. */
export const isPostmanWorkspaceUrl = (value: string): boolean => {
  const u = parsePostmanUrl(value);
  if (!u || /\/(collection|environment)\//i.test(u.pathname)) return false;
  return u.pathname.split('/').filter(Boolean).length >= 2;
};

const POSTMAN_ORIGIN = 'https://www.postman.com';
// pm/pe store just the postman.com path and expand back, keeping the query compact.
const toPostmanPath = (url: string): string => {
  try { return new URL(url).pathname; } catch { return url; }
};
const fromPostmanPath = (ref: string): string =>
  /^https?:/i.test(ref) ? ref : `${POSTMAN_ORIGIN}${ref.startsWith('/') ? '' : '/'}${ref}`;

export const buildPostmanShareUrl = (pathname: string, collectionUrl: string, environmentUrls: string[]): string => {
  const params = new URLSearchParams();
  params.set('pm', toPostmanPath(collectionUrl));
  environmentUrls.forEach((u) => params.append('pe', toPostmanPath(u)));
  return `${pathname}?${params.toString()}`;
};

export const parsePostmanShareParams = (search: URLSearchParams): { collectionUrl: string; environmentUrls: string[] } | null => {
  const pm = search.get('pm');
  if (!pm) return null;
  return { collectionUrl: fromPostmanPath(pm), environmentUrls: search.getAll('pe').map(fromPostmanPath) };
};

/** Endpoint that returns the collection as OpenCollection YAML (GET); also the deeplink `raw_url`. `origin` is injectable for tests. */
export const buildPostmanImportUrl = (
  collectionUrl: string,
  environmentUrls: string[],
  origin: string = typeof window !== 'undefined' ? window.location.origin : ''
): string => {
  const params = new URLSearchParams();
  if (collectionUrl) params.set('pm', collectionUrl);
  (environmentUrls || []).forEach((u) => { if (u) params.append('pe', u); });
  const rel = `${apiUrl('/api/postman-import')}?${params.toString()}`;
  return /^https?:/i.test(rel) ? rel : new URL(rel, origin).toString();
};

export interface PostmanWorkspaceCollection {
  name: string;
  url: string;
}

/** List a Postman workspace's public collections (for the picker). */
export const fetchPostmanWorkspace = async (
  workspaceUrl: string
): Promise<{ name: string; collections: PostmanWorkspaceCollection[] }> => {
  const res = await fetch(`${apiUrl('/api/postman-workspace')}?url=${encodeURIComponent(workspaceUrl)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Failed to list the workspace (${res.status}).`);
  return { name: data.name, collections: data.collections || [] };
};

export const runPostmanImport = async (
  { collectionUrl, environmentUrls }: { collectionUrl: string; environmentUrls: string[] }
): Promise<{ name: string; opencollection: string }> => {
  const res = await fetch(buildPostmanImportUrl(collectionUrl, environmentUrls));
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Import failed (${res.status}).`);
  let name = 'Postman Collection';
  try {
    const doc = yaml.load(text) as { info?: { name?: string } } | undefined;
    if (doc?.info?.name) name = doc.info.name;
  } catch {
    /* keep the default name */
  }
  return { name, opencollection: text };
};
