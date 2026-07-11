const ENDPOINT = '/api/postman-import';

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

const POSTMAN_ORIGIN = 'https://www.postman.com';
// Short refs (pm/pe) store just the postman.com path and expand back, keeping
// the query string compact, like the g/r gist/repo refs.
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

export const runPostmanImport = async (
  { collectionUrl, environmentUrls }: { collectionUrl: string; environmentUrls: string[] }
): Promise<{ name: string; opencollection: string }> => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionUrl, environmentUrls })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status}).`);
  return { name: data.name, opencollection: data.opencollection };
};
