import { describe, it, expect, vi, afterEach } from 'vitest';
import { listWorkspaceEnvironments } from './postman.js';

afterEach(() => vi.restoreAllMocks());

describe('listWorkspaceEnvironments', () => {
  it('returns [{id,name}] from the list endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: '111-aaa', name: 'Prod', color: null },
          { id: '111-bbb', name: 'Staging' },
          { id: '', name: 'skip-me' }
        ]
      })
    }));
    const out = await listWorkspaceEnvironments('ws-1');
    expect(out).toEqual([{ id: '111-aaa', name: 'Prod' }, { id: '111-bbb', name: 'Staging' }]);
  });

  it('throws with status on a non-ok response (e.g. 429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(listWorkspaceEnvironments('ws-1')).rejects.toMatchObject({ status: 429 });
  });
});
