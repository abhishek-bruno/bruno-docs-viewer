const STORAGE_KEY = 'share-app:import-cache';
const MAX_ENTRIES = 10;

interface CacheEntry {
  key: string;
  opencollection: string;
  savedAt: number;
}

const read = (): CacheEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (entries: CacheEntry[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded: cache is best-effort, so drop silently.
  }
};

export const postmanCacheKey = (collectionUrl: string, environmentUrls: string[]): string =>
  `postman:${collectionUrl.trim()}|${environmentUrls.map((u) => u.trim()).sort().join(',')}`;

export const getCachedImport = (key: string): string | null =>
  read().find((e) => e.key === key)?.opencollection ?? null;

export const setCachedImport = (key: string, opencollection: string): void => {
  const entries = read().filter((e) => e.key !== key);
  entries.unshift({ key, opencollection, savedAt: Date.now() });
  write(entries.slice(0, MAX_ENTRIES));
};
