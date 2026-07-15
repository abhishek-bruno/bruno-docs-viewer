import { describe, it, expect } from 'vitest';
import { classifySourceUrl, parsePrefixPath } from './classifySource';

describe('classifySourceUrl', () => {
  it('classifies a Postman collection URL', () => {
    const r = classifySourceUrl('https://www.postman.com/acme/ws/collection/ab12/orders');
    expect(r).toEqual({
      kind: 'postman',
      collectionUrl: 'https://www.postman.com/acme/ws/collection/ab12/orders',
      environmentUrls: []
    });
  });

  it('classifies a git repo URL (incl. /tree/ subdir)', () => {
    const r = classifySourceUrl('https://github.com/org/repo/tree/main/collection');
    expect(r).toEqual({
      kind: 'source',
      source: { gitUrl: 'https://github.com/org/repo/tree/main/collection', rawUrl: '', openapiUrl: '', gist: '', path: '' }
    });
  });

  it('classifies a gist page URL to the bare gist id', () => {
    const r = classifySourceUrl('https://gist.github.com/jane/6037ec28edf197eeb11b09606fda7371');
    expect(r).toEqual({
      kind: 'source',
      source: { gitUrl: '', rawUrl: '', openapiUrl: '', gist: '6037ec28edf197eeb11b09606fda7371', path: '' }
    });
  });

  it('classifies any other https URL as a raw document', () => {
    const r = classifySourceUrl('https://petstore3.swagger.io/api/v3/openapi.json');
    expect(r).toEqual({
      kind: 'source',
      source: { gitUrl: '', rawUrl: 'https://petstore3.swagger.io/api/v3/openapi.json', openapiUrl: '', gist: '', path: '' }
    });
  });

  it('returns null for junk', () => {
    expect(classifySourceUrl('not-a-url')).toBeNull();
    expect(classifySourceUrl('')).toBeNull();
  });
});

describe('parsePrefixPath', () => {
  it('returns null for the home path', () => {
    expect(parsePrefixPath('/', '')).toBeNull();
    expect(parsePrefixPath('', '')).toBeNull();
  });

  it('reconstructs a git repo URL from the path', () => {
    const r = parsePrefixPath('/github.com/org/repo', '');
    expect(r).toEqual({
      kind: 'source',
      source: { gitUrl: 'https://github.com/org/repo', rawUrl: '', openapiUrl: '', gist: '', path: '' }
    });
  });

  it("carries the source URL's own query string", () => {
    const r = parsePrefixPath('/www.postman.com/acme/ws/collection/ab12/orders', '?ctx=documentation');
    expect(r).toEqual({
      kind: 'postman',
      collectionUrl: 'https://www.postman.com/acme/ws/collection/ab12/orders?ctx=documentation',
      environmentUrls: []
    });
  });
});
