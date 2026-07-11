import { appendSourceParams, hasAnySource, type SourcePointers } from '../sources/sourceParams';
import { putCollection } from './collectionStore';

export const sourceHistoryKey = (source: SourcePointers): string =>
  appendSourceParams(new URLSearchParams(), source, { preferShort: true }).toString();

/** The actual source URL, shown under the title in history. */
export const describeSourceSubtitle = (source: SourcePointers): string => {
  if (source.gitUrl) return source.gitUrl;
  if (source.gistUrl) return source.gistUrl;
  if (source.gist) return `https://gist.github.com/${source.gist}`;
  return 'Remote collection';
};

export const buildRecentLinkHref = (
  source: SourcePointers,
  { pathname = '/' }: { pathname?: string } = {}
): string => {
  const query = sourceHistoryKey(source);
  return `${pathname}${query ? `?${query}` : ''}`;
};

export const recordRecentLink = async (source: SourcePointers, title: string): Promise<void> => {
  if (!hasAnySource(source)) return;

  const subtitle = describeSourceSubtitle(source);
  const now = Date.now();
  await putCollection({
    key: `link:${sourceHistoryKey(source)}`,
    kind: 'link',
    title: title.trim() || subtitle,
    subtitle,
    href: buildRecentLinkHref(source),
    savedAt: now,
    lastOpenedAt: now
  });
};
