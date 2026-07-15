import { describe, it, expect, vi, afterEach } from 'vitest';
import { runGitImport } from './gitImport';

afterEach(() => vi.restoreAllMocks());

describe('runGitImport', () => {
  it('POSTs gitUrl/path and returns a converted collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, name: 'Demo', opencollection: 'name: Demo\n' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runGitImport({ gitUrl: 'https://github.com/o/r.git', path: '' });
    expect(out).toEqual({ kind: 'collection', name: 'Demo', opencollection: 'name: Demo\n' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/git-import');
    expect(JSON.parse(init.body)).toEqual({ gitUrl: 'https://github.com/o/r.git', path: '' });
  });

  it('returns the collection list for a monorepo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, collections: [{ name: 'Orders API', path: 'apis/orders' }] })
    }));
    const out = await runGitImport({ gitUrl: 'https://github.com/o/mono.git', path: '' });
    expect(out).toEqual({ kind: 'list', collections: [{ name: 'Orders API', path: 'apis/orders' }] });
  });

  it('throws with the server error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false, error: 'No Bruno collection found in this repository.' }) }));
    await expect(runGitImport({ gitUrl: 'https://github.com/o/r.git', path: '' })).rejects.toThrow(/No Bruno collection/);
  });
});
