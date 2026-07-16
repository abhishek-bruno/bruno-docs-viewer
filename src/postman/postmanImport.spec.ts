import { describe, it, expect, vi, afterEach } from 'vitest';
import yaml from 'js-yaml';
import { runPostmanImport, buildPostmanImportUrl } from './postmanImport';

afterEach(() => vi.restoreAllMocks());

describe('buildPostmanImportUrl', () => {
  it('builds an absolute endpoint URL with pm + repeatable pe', () => {
    const url = buildPostmanImportUrl(
      'https://www.postman.com/acme/collection/ab12/orders',
      ['https://www.postman.com/acme/environment/123', 'https://www.postman.com/acme/environment/456'],
      'https://share.usebruno.com'
    );
    expect(/^https?:\/\//.test(url)).toBe(true);
    expect(url).toContain('/api/postman-import?');
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('pm')).toBe('https://www.postman.com/acme/collection/ab12/orders');
    expect(q.getAll('pe')).toEqual([
      'https://www.postman.com/acme/environment/123',
      'https://www.postman.com/acme/environment/456'
    ]);
  });

  it('omits pe when there are no environments', () => {
    const url = buildPostmanImportUrl('https://www.postman.com/acme/collection/ab12/orders', [], 'https://share.usebruno.com');
    expect(url).not.toContain('pe=');
  });
});

describe('runPostmanImport', () => {
  it('GETs the endpoint, reads YAML, derives name from info.name', async () => {
    const oc = yaml.dump({ opencollection: '1.0.0', info: { name: 'Orders API' } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => oc });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPostmanImport({ collectionUrl: 'https://www.postman.com/x/collection/ab/orders', environmentUrls: [] });

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('/api/postman-import?pm=');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(out.name).toBe('Orders API');
    expect(out.opencollection).toBe(oc);
  });

  it('throws the server text on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Only postman.com URLs are supported.' }));
    await expect(runPostmanImport({ collectionUrl: 'https://evil.com/x', environmentUrls: [] }))
      .rejects.toThrow(/postman\.com/);
  });
});
