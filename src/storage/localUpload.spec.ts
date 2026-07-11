import { beforeEach, describe, expect, it } from 'vitest';
import { clearCollections } from './collectionStore';
import {
  buildLocalUploadUrl,
  parseCollectionTitle,
  parseLocalUploadKey,
  readLocalUpload,
  saveLocalUpload
} from './localUpload';

describe('parseCollectionTitle', () => {
  it('reads info.name', () => {
    expect(parseCollectionTitle('info:\n  name: My API\n  version: 1')).toBe('My API');
  });

  it('reads a quoted info.name', () => {
    expect(parseCollectionTitle('info:\n  name: "Quoted API"\n')).toBe('Quoted API');
  });

  it('reads a root-level name', () => {
    expect(parseCollectionTitle('name: Root API\nitems: []')).toBe('Root API');
  });

  it('falls back to the file name', () => {
    expect(parseCollectionTitle('items: []', 'petstore.yaml')).toBe('petstore');
  });

  it('falls back to a default when nothing is available', () => {
    expect(parseCollectionTitle('items: []')).toBe('Untitled collection');
  });
});

describe('buildLocalUploadUrl / parseLocalUploadKey', () => {
  it('round-trips a key through the URL', () => {
    const url = buildLocalUploadUrl('upload:abc', { pathname: '/', hash: '#req1' });
    expect(url).toBe('/?local=upload%3Aabc#req1');
    const key = parseLocalUploadKey(new URLSearchParams('local=upload%3Aabc'));
    expect(key).toBe('upload:abc');
  });

  it('returns null when no local param is present', () => {
    expect(parseLocalUploadKey(new URLSearchParams('g=https://x/y.yml'))).toBeNull();
  });
});

describe('saveLocalUpload / readLocalUpload', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('persists and reads back the yaml', async () => {
    const yaml = 'info:\n  name: Saved\n';
    const { key } = await saveLocalUpload(yaml, 'saved.yml');
    expect(key).toMatch(/^upload:/);
    expect(await readLocalUpload(key)).toBe(yaml);
  });

  it('returns null for an unknown key', async () => {
    expect(await readLocalUpload('upload:nope')).toBeNull();
  });
});
