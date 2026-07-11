import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildRecentLinkHref,
  clearRecentLinks,
  listRecentLinks,
  recordRecentLink,
  removeRecentLink,
  sourceHistoryKey
} from './recentLinks';

describe('recentLinks', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      }
    });
  });

  it('records and lists recent links', () => {
    recordRecentLink(
      {
        gitUrl: '',
        gistUrl: 'https://gist.githubusercontent.com/octocat/abc/raw/Demo.yml',
        gist: '',
        path: ''
      },
      'Demo API'
    );

    expect(listRecentLinks()).toHaveLength(1);
    expect(listRecentLinks()[0].title).toBe('Demo API');
  });

  it('dedupes by source key and moves to front', () => {
    const source = {
      gitUrl: '',
      gistUrl: 'https://gist.githubusercontent.com/octocat/abc/raw/Demo.yml',
      gist: '',
      path: ''
    };
    recordRecentLink(source, 'First');
    recordRecentLink(source, 'Updated title');
    expect(listRecentLinks()).toHaveLength(1);
    expect(listRecentLinks()[0].title).toBe('Updated title');
  });

  it('builds viewer hrefs from stored source', () => {
    const source = {
      gitUrl: '',
      gistUrl: 'https://gist.githubusercontent.com/octocat/abc123/raw/MyCollection.yml',
      gist: '',
      path: ''
    };
    recordRecentLink(source, 'My Collection');
    const entry = listRecentLinks()[0];
    expect(buildRecentLinkHref(entry.source, { pathname: '/' })).toBe(`/?${entry.id}`);
    expect(sourceHistoryKey(source)).toBe('g=octocat%2Fabc123%2FMyCollection.yml');
  });

  it('removes one entry and clears all', () => {
    recordRecentLink(
      { gitUrl: '', gistUrl: 'https://gist.githubusercontent.com/a/b/raw/one.yml', gist: '', path: '' },
      'One'
    );
    recordRecentLink(
      { gitUrl: '', gistUrl: 'https://gist.githubusercontent.com/a/b/raw/two.yml', gist: '', path: '' },
      'Two'
    );
    removeRecentLink(listRecentLinks()[1].id);
    expect(listRecentLinks()).toHaveLength(1);
    clearRecentLinks();
    expect(listRecentLinks()).toHaveLength(0);
  });
});
