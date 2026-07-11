import {
  appendSourceParams,
  buildRepoRef,
  hasAnySource,
  parseGistRawUrl,
  type SourcePointers
} from './sourceParams';

export const MAX_RECENT_LINKS = 10;

const STORAGE_KEY = 'share-app:recent-links';

export interface RecentLinkEntry {
  id: string;
  source: SourcePointers;
  title: string;
  subtitle: string;
  lastOpenedAt: number;
}

const readLinks = (): RecentLinkEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLinkEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLinks = (entries: RecentLinkEntry[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const sourceHistoryKey = (source: SourcePointers): string =>
  appendSourceParams(new URLSearchParams(), source, { preferShort: true }).toString();

export const describeSourceSubtitle = (source: SourcePointers): string => {
  const gistParts = parseGistRawUrl(source.gistUrl);
  if (gistParts?.fileName) return gistParts.fileName;

  const repoRef = buildRepoRef(source.gitUrl);
  if (repoRef) return repoRef;

  if (source.gistUrl) {
    try {
      return new URL(source.gistUrl).hostname;
    } catch {
      return 'Remote YAML';
    }
  }

  if (source.gist) return `gist:${source.gist}`;
  return 'Remote collection';
};

export const buildRecentLinkHref = (
  source: SourcePointers,
  { pathname = '/' }: { pathname?: string } = {}
): string => {
  const query = sourceHistoryKey(source);
  return `${pathname}${query ? `?${query}` : ''}`;
};

export const recordRecentLink = (source: SourcePointers, title: string): void => {
  if (!hasAnySource(source)) return;

  const id = sourceHistoryKey(source);
  const subtitle = describeSourceSubtitle(source);
  const normalizedTitle = title.trim() || subtitle;

  const entries = readLinks().filter((entry) => entry.id !== id);
  entries.unshift({
    id,
    source: {
      gitUrl: source.gitUrl || '',
      gistUrl: source.gistUrl || '',
      gist: source.gist || '',
      path: source.path || ''
    },
    title: normalizedTitle,
    subtitle,
    lastOpenedAt: Date.now()
  });

  try {
    writeLinks(entries.slice(0, MAX_RECENT_LINKS));
  } catch {
    // ignore quota errors for history metadata
  }
};

export const listRecentLinks = (): RecentLinkEntry[] =>
  readLinks().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

export const removeRecentLink = (id: string): void => {
  writeLinks(readLinks().filter((entry) => entry.id !== id));
};

export const clearRecentLinks = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
