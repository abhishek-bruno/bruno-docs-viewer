import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'bruno-docs-viewer';
const STORE = 'collections';
// History cap. When exceeded, the least-recently-opened entries are evicted.
const MAX_ENTRIES = 50;

export type CollectionKind = 'upload' | 'link' | 'postman';

export interface StoredCollection {
  key: string;
  kind: CollectionKind;
  title: string;
  subtitle: string;
  href: string;
  savedAt: number;
  lastOpenedAt: number;
  yaml?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const db = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    // Ask the browser to keep this data through storage pressure (best-effort).
    navigator.storage?.persist?.().catch(() => {});
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore(STORE, { keyPath: 'key' });
      }
    });
  }
  return dbPromise;
};

export const listCollections = async (): Promise<StoredCollection[]> => {
  try {
    const all = (await (await db()).getAll(STORE)) as StoredCollection[];
    return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
};

export const getCollection = async (key: string): Promise<StoredCollection | null> => {
  try {
    return (await (await db()).get(STORE, key)) ?? null;
  } catch {
    return null;
  }
};

export const deleteCollection = async (key: string): Promise<void> => {
  try {
    await (await db()).delete(STORE, key);
  } catch {
    // ignore
  }
};

export const clearCollections = async (): Promise<void> => {
  try {
    await (await db()).clear(STORE);
  } catch {
    // ignore
  }
};

const evictOverCap = async (): Promise<void> => {
  const excess = (await listCollections()).slice(MAX_ENTRIES);
  await Promise.all(excess.map((e) => deleteCollection(e.key)));
};

export const putCollection = async (entry: StoredCollection): Promise<void> => {
  try {
    await (await db()).put(STORE, entry);
    await evictOverCap();
  } catch {
    // Best-effort persistence; a failed write should not break viewing.
  }
};

export const touchCollection = async (key: string): Promise<void> => {
  const entry = await getCollection(key);
  if (entry) {
    entry.lastOpenedAt = Date.now();
    await putCollection(entry);
  }
};
