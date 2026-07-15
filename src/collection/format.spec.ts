import { describe, it, expect } from 'vitest';
import { sniffFormat } from './format';

describe('sniffFormat', () => {
  it('classifies an OpenAPI 3.x document by the openapi key', () => {
    const text = 'openapi: 3.0.0\ninfo:\n  title: Sample API\n  version: 1.0.0\npaths: {}\n';
    expect(sniffFormat(text)).toBe('openapi');
  });

  it('classifies a Swagger 2.0 document by the swagger key', () => {
    const text = "swagger: '2.0'\ninfo:\n  title: Old API\n  version: 1.0.0\npaths: {}\n";
    expect(sniffFormat(text)).toBe('openapi');
  });

  it('treats a plain collection document as opencollection', () => {
    const text = 'name: My Collection\nitems: []\n';
    expect(sniffFormat(text)).toBe('opencollection');
  });

  it('falls back to opencollection for unparseable input', () => {
    expect(sniffFormat(': : : not yaml : :')).toBe('opencollection');
  });

  it('falls back to opencollection for a non-object scalar', () => {
    expect(sniffFormat('just a string')).toBe('opencollection');
  });
});
