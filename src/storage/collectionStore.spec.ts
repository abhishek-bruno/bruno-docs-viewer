import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCollections,
  deleteCollection,
  getCollection,
  listCollections,
  putCollection,
  touchCollection,
  type StoredCollection
} from './collectionStore';

const entry = (key: string, lastOpenedAt: number): StoredCollection => ({
  key,
  kind: 'link',
  title: key,
  subtitle: 'test',
  href: `/?k=${key}`,
  savedAt: lastOpenedAt,
  lastOpenedAt
});

describe('collectionStore', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('puts and gets an entry', async () => {
    await putCollection(entry('a', 1000));
    expect(await getCollection('a')).toMatchObject({ key: 'a', title: 'a' });
  });

  it('returns null for a missing key', async () => {
    expect(await getCollection('missing')).toBeNull();
  });

  it('lists entries newest-opened first', async () => {
    await putCollection(entry('old', 1000));
    await putCollection(entry('new', 3000));
    await putCollection(entry('mid', 2000));
    expect((await listCollections()).map((e) => e.key)).toEqual(['new', 'mid', 'old']);
  });

  it('deletes a single entry', async () => {
    await putCollection(entry('a', 1000));
    await deleteCollection('a');
    expect(await getCollection('a')).toBeNull();
  });

  it('clears all entries', async () => {
    await putCollection(entry('a', 1000));
    await putCollection(entry('b', 2000));
    await clearCollections();
    expect(await listCollections()).toEqual([]);
  });

  it('touch bumps lastOpenedAt to the front', async () => {
    await putCollection(entry('a', 1000));
    await putCollection(entry('b', 2000));
    await touchCollection('a');
    expect((await listCollections())[0].key).toBe('a');
  });

  it('caps history at 50 entries, evicting least-recently-opened', async () => {
    for (let i = 0; i < 55; i += 1) {
      await putCollection(entry(`k${i}`, i));
    }
    const all = await listCollections();
    expect(all).toHaveLength(50);
    // The 5 oldest (k0..k4) should have been evicted.
    expect(all.some((e) => e.key === 'k0')).toBe(false);
    expect(all.some((e) => e.key === 'k54')).toBe(true);
  });
});
