import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LOCAL_UPLOAD_PARAM,
  MAX_LOCAL_SLOTS,
  buildLocalUploadUrl,
  listLocalUploads,
  parseCollectionTitle,
  parseLocalUploadSlot,
  readLocalUpload,
  removeLocalUpload,
  saveLocalUpload
} from './localUpload';

describe('localUpload', () => {
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
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(`session:${key}`) ?? null,
      setItem: (key: string, value: string) => {
        store.set(`session:${key}`, value);
      },
      removeItem: (key: string) => {
        store.delete(`session:${key}`);
      }
    });
  });

  it('parses collection title from yaml', () => {
    expect(parseCollectionTitle('opencollection: "1.0.0"\ninfo:\n  name: Hotel API\n', 'x.yml')).toBe(
      'Hotel API'
    );
    expect(parseCollectionTitle('yaml', 'MyCollection.yml')).toBe('MyCollection');
  });

  it('saves to stable slots and reads back', () => {
    const first = saveLocalUpload('info:\n  name: One\n', 'one.yml');
    expect(first.slot).toBe(1);
    expect(first.evicted).toBe(false);
    expect(readLocalUpload(1)).toContain('name: One');

    const second = saveLocalUpload('info:\n  name: Two\n', 'two.yml');
    expect(second.slot).toBe(2);
    expect(listLocalUploads()).toHaveLength(2);
  });

  it('evicts the oldest slot when full', () => {
    for (let i = 1; i <= MAX_LOCAL_SLOTS; i += 1) {
      saveLocalUpload(`info:\n  name: Item ${i}\n`, `item-${i}.yml`);
    }
    expect(listLocalUploads()).toHaveLength(MAX_LOCAL_SLOTS);

    const sixth = saveLocalUpload('info:\n  name: Newest\n', 'newest.yml');
    expect(sixth.evicted).toBe(true);
    expect(sixth.slot).toBe(1);
    expect(readLocalUpload(1)).toContain('name: Newest');
    expect(readLocalUpload(2)).toContain('name: Item 2');
    expect(listLocalUploads()).toHaveLength(MAX_LOCAL_SLOTS);
  });

  it('parses local slot query params', () => {
    expect(parseLocalUploadSlot(new URLSearchParams(`${LOCAL_UPLOAD_PARAM}=3`))).toBe(3);
    expect(parseLocalUploadSlot(new URLSearchParams(`${LOCAL_UPLOAD_PARAM}=9`))).toBeNull();
    expect(parseLocalUploadSlot(new URLSearchParams(`${LOCAL_UPLOAD_PARAM}=abc`))).toBeNull();
  });

  it('builds viewer URLs with numeric slots', () => {
    expect(buildLocalUploadUrl(2, { pathname: '/' })).toBe('/?local=2');
    expect(buildLocalUploadUrl(4, { pathname: '/', hash: '#/req/foo' })).toBe('/?local=4#/req/foo');
  });

  it('removes a slot', () => {
    saveLocalUpload('yaml-one', 'one.yml');
    saveLocalUpload('yaml-two', 'two.yml');
    removeLocalUpload(1);
    expect(readLocalUpload(1)).toBeNull();
    expect(readLocalUpload(2)).toBe('yaml-two');
  });
});
