import { getCollection, putCollection, touchCollection } from './collectionStore';

export const postmanCacheKey = (collectionUrl: string, environmentUrls: string[]): string =>
  `postman:${collectionUrl.trim()}|${environmentUrls.map((u) => u.trim()).sort().join(',')}`;

export const getCachedImport = async (key: string): Promise<string | null> =>
  (await getCollection(key))?.yaml ?? null;

export const touchCachedImport = (key: string): Promise<void> => touchCollection(key);

export const cachePostmanImport = async (
  key: string,
  { title, subtitle = 'Postman collection', href, yaml }: { title: string; subtitle?: string; href: string; yaml: string }
): Promise<void> => {
  const now = Date.now();
  await putCollection({
    key,
    kind: 'postman',
    title,
    subtitle,
    href,
    savedAt: now,
    lastOpenedAt: now,
    yaml
  });
};
