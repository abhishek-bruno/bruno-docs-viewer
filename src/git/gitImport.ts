import { apiUrl } from '../config';

const ENDPOINT = apiUrl('/api/git-import');

export interface GitCollectionRef {
  name: string;
  path: string;
}

export type GitImportResult =
  | { kind: 'collection'; name: string; opencollection: string }
  | { kind: 'list'; collections: GitCollectionRef[] };

export const runGitImport = async (
  { gitUrl, path }: { gitUrl: string; path: string }
): Promise<GitImportResult> => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gitUrl, path })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status}).`);
  if (Array.isArray(data.collections)) return { kind: 'list', collections: data.collections };
  return { kind: 'collection', name: data.name, opencollection: data.opencollection };
};
