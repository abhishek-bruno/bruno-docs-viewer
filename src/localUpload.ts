/** Query param for browser-local uploads (YAML stored in localStorage). */
export const LOCAL_UPLOAD_PARAM = 'local';

export const MAX_LOCAL_SLOTS = 5;

const STORAGE_KEY = 'share-app:local-slots';
const FLASH_KEY = 'share-app:upload-flash';

export interface LocalUploadEntry {
  slot: number;
  yaml: string;
  fileName: string;
  title: string;
  savedAt: number;
}

export interface SaveLocalUploadResult {
  slot: number;
  evicted: boolean;
}

export type UploadFlash = 'evicted';

type SlotStore = Partial<Record<number, Omit<LocalUploadEntry, 'slot'>>>;

const trim = (v: string | null): string => (v ? String(v).trim() : '');

export const isValidLocalSlot = (slot: number): boolean =>
  Number.isInteger(slot) && slot >= 1 && slot <= MAX_LOCAL_SLOTS;

export const parseLocalUploadSlot = (search: URLSearchParams): number | null => {
  const raw = trim(search.get(LOCAL_UPLOAD_PARAM));
  if (!raw) return null;
  const slot = Number.parseInt(raw, 10);
  return isValidLocalSlot(slot) ? slot : null;
};

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

const readStore = (): SlotStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SlotStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store: SlotStore): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const pickSlot = (store: SlotStore): { slot: number; evicted: boolean } => {
  for (let slot = 1; slot <= MAX_LOCAL_SLOTS; slot += 1) {
    if (!store[slot]) return { slot, evicted: false };
  }

  let oldestSlot = 1;
  let oldestAt = store[1]?.savedAt ?? Infinity;
  for (let slot = 2; slot <= MAX_LOCAL_SLOTS; slot += 1) {
    const savedAt = store[slot]?.savedAt ?? Infinity;
    if (savedAt < oldestAt) {
      oldestAt = savedAt;
      oldestSlot = slot;
    }
  }
  return { slot: oldestSlot, evicted: true };
};

export const saveLocalUpload = (yaml: string, fileName: string): SaveLocalUploadResult => {
  const store = readStore();
  const { slot, evicted } = pickSlot(store);
  store[slot] = {
    yaml,
    fileName: fileName || 'opencollection.yml',
    title: parseCollectionTitle(yaml, fileName),
    savedAt: Date.now()
  };
  try {
    writeStore(store);
  } catch {
    throw new Error('Could not save the file in this browser. It may be too large.');
  }
  return { slot, evicted };
};

export const readLocalUpload = (slot: number): string | null => {
  if (!isValidLocalSlot(slot)) return null;
  try {
    return readStore()[slot]?.yaml ?? null;
  } catch {
    return null;
  }
};

export const getLocalUploadEntry = (slot: number): LocalUploadEntry | null => {
  if (!isValidLocalSlot(slot)) return null;
  const entry = readStore()[slot];
  if (!entry) return null;
  return { slot, ...entry };
};

export const listLocalUploads = (): LocalUploadEntry[] =>
  Object.entries(readStore())
    .map(([key, entry]) => {
      const slot = Number.parseInt(key, 10);
      if (!isValidLocalSlot(slot) || !entry) return null;
      return { slot, ...entry };
    })
    .filter((entry): entry is LocalUploadEntry => entry !== null)
    .sort((a, b) => b.savedAt - a.savedAt);

export const removeLocalUpload = (slot: number): void => {
  if (!isValidLocalSlot(slot)) return;
  const store = readStore();
  delete store[slot];
  writeStore(store);
};

export const clearLocalUploads = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const buildLocalUploadUrl = (
  slot: number,
  { pathname = '/', hash = '' }: { pathname?: string; hash?: string } = {}
): string => {
  const params = new URLSearchParams();
  params.set(LOCAL_UPLOAD_PARAM, String(slot));
  const safeHash = hash.startsWith('#') ? hash : hash ? `#${hash}` : '';
  return `${pathname}?${params.toString()}${safeHash}`;
};

export const setUploadFlash = (flash: UploadFlash): void => {
  try {
    sessionStorage.setItem(FLASH_KEY, flash);
  } catch {
    // ignore
  }
};

export const consumeUploadFlash = (): UploadFlash | null => {
  try {
    const value = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return value === 'evicted' ? 'evicted' : null;
  } catch {
    return null;
  }
};

export const formatRelativeTime = (savedAt: number): string => {
  const diffMs = Date.now() - savedAt;
  if (diffMs < 60_000) return 'Just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
