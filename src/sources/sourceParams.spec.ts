import { describe, it, expect } from 'vitest';
import {
  parseSource,
  normalizeYamlDocumentUrl,
  normalizeGitRepoUrl,
  buildShareViewerUrl
} from './sourceParams';

const rawGistUrl = 'https://gist.githubusercontent.com/octocat/abc123/raw/MyCollection.yml';
const gitUrl = 'https://github.com/org/repo.git';

describe('normalizeYamlDocumentUrl', () => {
  it('accepts gist raw URLs', () => {
    expect(normalizeYamlDocumentUrl(rawGistUrl)).toBe(rawGistUrl);
  });

  it('accepts raw.githubusercontent.com URLs', () => {
    const url = 'https://raw.githubusercontent.com/org/repo/main/opencollection.yml';
    expect(normalizeYamlDocumentUrl(url)).toBe(url);
  });

  it('rejects empty and non-https URLs', () => {
    expect(normalizeYamlDocumentUrl('')).toBeNull();
    expect(normalizeYamlDocumentUrl('http://example.com/file.yml')).toBeNull();
    expect(normalizeYamlDocumentUrl('not-a-url')).toBeNull();
  });
});

describe('normalizeGitRepoUrl', () => {
  it('normalizes github.com URLs', () => {
    expect(normalizeGitRepoUrl('https://github.com/org/repo')).toBe(gitUrl);
    expect(normalizeGitRepoUrl('https://github.com/org/repo.git')).toBe(gitUrl);
    expect(normalizeGitRepoUrl('https://github.com/org/repo/tree/main')).toBe(gitUrl);
  });

  it('rejects non-github URLs', () => {
    expect(normalizeGitRepoUrl('https://gitlab.com/org/repo')).toBeNull();
    expect(normalizeGitRepoUrl('')).toBeNull();
  });
});

describe('parseSource', () => {
  it('reads raw_url, openapi_url, git_url, gist, path', () => {
    const s = parseSource(
      new URLSearchParams('raw_url=https://x/y.yml&openapi_url=https://x/o.json&git_url=https://github.com/o/r.git&gist=abc&path=apis')
    );
    expect(s.rawUrl).toBe('https://x/y.yml');
    expect(s.openapiUrl).toBe('https://x/o.json');
    expect(s.gitUrl).toBe('https://github.com/o/r.git');
    expect(s.gist).toBe('abc');
    expect(s.path).toBe('apis');
  });

});

describe('buildShareViewerUrl', () => {
  it('emits raw_url for a raw document URL', () => {
    const url = buildShareViewerUrl(
      { rawUrl: rawGistUrl, gitUrl: '', openapiUrl: '', gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com' }
    );
    expect(url).toContain('raw_url=');
  });

  it('emits openapi_url for an OpenAPI spec', () => {
    const spec = 'https://petstore3.swagger.io/api/v3/openapi.json';
    const url = buildShareViewerUrl(
      { rawUrl: '', gitUrl: '', openapiUrl: spec, gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com' }
    );
    expect(url).toContain('openapi_url=');
    expect(url).not.toContain('raw_url=');
  });

  it('emits git_url for a repo source', () => {
    const url = buildShareViewerUrl(
      { rawUrl: '', gitUrl, openapiUrl: '', gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com' }
    );
    expect(url).toContain('git_url=');
  });

  it('carries a bare gist id', () => {
    const url = buildShareViewerUrl(
      { rawUrl: '', gitUrl: '', openapiUrl: '', gist: 'abc123', path: '' },
      { baseUrl: 'https://share.usebruno.com' }
    );
    expect(url).toContain('gist=abc123');
  });

  it('appends a readable per-segment deep-link hash', () => {
    const url = buildShareViewerUrl(
      { rawUrl: rawGistUrl, gitUrl, openapiUrl: '', gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com', requestId: 'auth/login' }
    );
    expect(url).toContain('#/req/auth/login');
    const hash = url.slice(url.indexOf('#'));
    expect(hash).not.toContain('%2F');
  });
});
