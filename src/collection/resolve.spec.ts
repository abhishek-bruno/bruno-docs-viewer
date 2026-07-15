import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { resolveToOpenCollection } from './resolve';

describe('resolveToOpenCollection', () => {
  it('returns OpenCollection input unchanged (identity, no conversion)', async () => {
    const oc = 'name: My Collection\nitems: []\n';
    expect(await resolveToOpenCollection(oc)).toBe(oc);
  });

  it('converts an OpenAPI 3.x spec to OpenCollection YAML', async () => {
    const spec = [
      'openapi: 3.0.0',
      'info:',
      '  title: Sample API',
      '  version: 1.0.0',
      'paths:',
      '  /ping:',
      '    get:',
      '      summary: Ping',
      '      responses:',
      "        '200':",
      '          description: OK',
      ''
    ].join('\n');

    const out = await resolveToOpenCollection(spec);

    // Output must be a different document than the input spec...
    expect(out).not.toBe(spec);
    // ...that parses as YAML into an object...
    const parsed = yaml.load(out);
    expect(parsed && typeof parsed).toBe('object');
    // ...carries the API name through the conversion...
    expect(out).toContain('Sample API');
    // ...and is itself OpenCollection (no longer sniffs as openapi).
    const { sniffFormat } = await import('./format');
    expect(sniffFormat(out)).toBe('opencollection');
  });
});
