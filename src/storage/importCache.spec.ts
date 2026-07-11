import { beforeEach, describe, expect, it } from 'vitest';
import { clearCollections } from './collectionStore';
import { cachePostmanImport, getCachedImport, postmanCacheKey } from './importCache';

describe('postmanCacheKey', () => {
  it('is stable regardless of environment URL order', () => {
    const a = postmanCacheKey('https://c', ['https://e2', 'https://e1']);
    const b = postmanCacheKey('https://c', ['https://e1', 'https://e2']);
    expect(a).toBe(b);
  });

  it('trims whitespace in inputs', () => {
    expect(postmanCacheKey('  https://c  ', [' https://e '])).toBe(postmanCacheKey('https://c', ['https://e']));
  });

  it('differs when the collection URL differs', () => {
    expect(postmanCacheKey('https://c1', [])).not.toBe(postmanCacheKey('https://c2', []));
  });
});

describe('import cache', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('stores and returns converted yaml', async () => {
    const key = postmanCacheKey('https://c', []);
    expect(await getCachedImport(key)).toBeNull();
    await cachePostmanImport(key, { title: 'C', href: '/?pm=/x', yaml: 'info:\n  name: C\n' });
    expect(await getCachedImport(key)).toBe('info:\n  name: C\n');
  });
});
