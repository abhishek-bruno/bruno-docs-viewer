import { getCollection, putCollection, type StoredCollection } from './collectionStore';

export const LOCAL_UPLOAD_PARAM = 'local';

const trim = (v: string | null): string => (v ? String(v).trim() : '');

export const parseLocalUploadKey = (search: URLSearchParams): string | null =>
  trim(search.get(LOCAL_UPLOAD_PARAM)) || null;

/** Best-effort title from OpenCollection YAML. */
export const parseCollectionTitle = (yaml: string, fileName = ''): string => {
  const infoName = yaml.match(/^info:\s*\n(?:[ \t].*\n)*?[ \t]+name:\s*(?:['"]([^'"]+)['"]|(\S.+))\s*$/m);
  const rootName = yaml.match(/^name:\s*(?:['"]([^'"]+)['"]|(\S.+))\s*$/m);
  const matched = infoName || rootName;
  const title = (matched?.[1] || matched?.[2] || '').trim();
  if (title) return title;
  const fromFile = fileName.replace(/\.ya?ml$/i, '').trim();
  return fromFile || 'Untitled collection';
};

export const buildLocalUploadUrl = (
  key: string,
  { pathname = '/', hash = '' }: { pathname?: string; hash?: string } = {}
): string => {
  const params = new URLSearchParams();
  params.set(LOCAL_UPLOAD_PARAM, key);
  const safeHash = hash.startsWith('#') ? hash : hash ? `#${hash}` : '';
  return `${pathname}?${params.toString()}${safeHash}`;
};

export const saveLocalUpload = async (yaml: string, fileName: string): Promise<{ key: string }> => {
  const key = `upload:${crypto.randomUUID()}`;
  const now = Date.now();
  const entry: StoredCollection = {
    key,
    kind: 'upload',
    title: parseCollectionTitle(yaml, fileName),
    subtitle: fileName || 'opencollection.yml',
    href: buildLocalUploadUrl(key),
    savedAt: now,
    lastOpenedAt: now,
    yaml
  };
  await putCollection(entry);
  return { key };
};

export const readLocalUpload = async (key: string): Promise<string | null> =>
  (await getCollection(key))?.yaml ?? null;

export const formatRelativeTime = (savedAt: number): string => {
  const diffMs = Date.now() - savedAt;
  if (diffMs < 60_000) return 'Just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
