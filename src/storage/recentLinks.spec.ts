import { beforeEach, describe, expect, it } from 'vitest';
import { clearCollections, getCollection } from './collectionStore';
import { buildRecentLinkHref, describeSourceSubtitle, recordRecentLink, sourceHistoryKey } from './recentLinks';
import type { SourcePointers } from '../sources/sourceParams';

const EMPTY: SourcePointers = { rawUrl: '', gitUrl: '', openapiUrl: '', gist: '', path: '' };
const gistSource: SourcePointers = {
  ...EMPTY,
  rawUrl: 'https://gist.githubusercontent.com/user/abc/raw/petstore.yml'
};

describe('describeSourceSubtitle', () => {
  it('shows the document URL', () => {
    expect(describeSourceSubtitle(gistSource)).toBe(gistSource.rawUrl);
  });

  it('shows a plain remote YAML url as-is', () => {
    expect(describeSourceSubtitle({ ...EMPTY, rawUrl: 'https://example.com/a/b.yml' })).toBe('https://example.com/a/b.yml');
  });

  it('shows the OpenAPI spec URL', () => {
    expect(describeSourceSubtitle({ ...EMPTY, openapiUrl: 'https://x/openapi.json' })).toBe('https://x/openapi.json');
  });

  it('shows the repo URL', () => {
    expect(describeSourceSubtitle({ ...EMPTY, gitUrl: 'https://github.com/org/repo.git' })).toBe('https://github.com/org/repo.git');
  });

  it('builds a gist page URL from a bare gist id', () => {
    expect(describeSourceSubtitle({ ...EMPTY, gist: 'abc123' })).toBe('https://gist.github.com/abc123');
  });
});

describe('buildRecentLinkHref', () => {
  it('builds a query string that re-encodes the source', () => {
    const href = buildRecentLinkHref(gistSource);
    expect(href.startsWith('/?')).toBe(true);
    expect(href).toContain(sourceHistoryKey(gistSource));
  });
});

describe('recordRecentLink', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('persists a link entry keyed by its source', async () => {
    await recordRecentLink(gistSource, 'Petstore');
    const stored = await getCollection(`link:${sourceHistoryKey(gistSource)}`);
    expect(stored).toMatchObject({ kind: 'link', title: 'Petstore', subtitle: gistSource.rawUrl });
  });

  it('ignores an empty source', async () => {
    await recordRecentLink(EMPTY, 'Nothing');
    expect(await getCollection(`link:${sourceHistoryKey(EMPTY)}`)).toBeNull();
  });
});
