import { renderSourceCandidates, type SourcePointers } from './sourceParams';

export type FetchErrorKind = 'not-found' | 'cors' | 'network' | 'unknown';

export class CollectionFetchError extends Error {
  kind: FetchErrorKind;
  constructor(kind: FetchErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const fetchText = async (url: string): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    // A thrown fetch is almost always CORS or an unreachable host; for a repo
    // file this typically means a private repository.
    throw new CollectionFetchError('cors', err instanceof Error ? err.message : 'Failed to fetch');
  }
  if (response.status === 404) throw new CollectionFetchError('not-found', 'Not found');
  if (!response.ok) throw new CollectionFetchError('unknown', `Request failed (${response.status})`);
  return response.text();
};

const fetchGistApi = async (url: string): Promise<string> => {
  const data = JSON.parse(await fetchText(url));
  const files = Object.values((data?.files || {}) as Record<string, any>);
  const target =
    files.find((f: any) => /\.ya?ml$/i.test(f.filename || '')) ||
    files.find((f: any) => /opencollection/i.test(f.filename || '')) ||
    files[0];
  if (!target) throw new CollectionFetchError('not-found', 'This gist contains no files.');
  if (target.truncated && target.raw_url) return fetchText(target.raw_url);
  return target.content as string;
};

/** Try each candidate (gist-first) until one succeeds. */
export const loadCollectionText = async (source: SourcePointers): Promise<string> => {
  const candidates = renderSourceCandidates(source);
  let lastError: CollectionFetchError | null = null;

  for (const candidate of candidates) {
    try {
      return candidate.kind === 'gist-api' ? await fetchGistApi(candidate.url) : await fetchText(candidate.url);
    } catch (err) {
      lastError = err instanceof CollectionFetchError ? err : new CollectionFetchError('unknown', String(err));
    }
  }

  throw lastError || new CollectionFetchError('unknown', 'No source could be loaded.');
};
