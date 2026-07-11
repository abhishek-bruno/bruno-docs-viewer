import { describe, it, expect } from 'vitest';
import {
  parseGistRawUrl,
  normalizeYamlDocumentUrl,
  normalizeGitRepoUrl,
  buildShareViewerUrl
} from './sourceParams';

const rawGistUrl = 'https://gist.githubusercontent.com/octocat/abc123/raw/MyCollection.yml';
const gitUrl = 'https://github.com/org/repo.git';

describe('parseGistRawUrl', () => {
  it('parses gist raw URLs', () => {
    expect(parseGistRawUrl(rawGistUrl)).toEqual({
      owner: 'octocat',
      gistId: 'abc123',
      fileName: 'MyCollection.yml'
    });
  });

  it('returns null for non-gist URLs', () => {
    expect(parseGistRawUrl('https://example.com/file.yml')).toBeNull();
  });
});

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

describe('buildShareViewerUrl', () => {
  it('uses short g= for gist raw URLs', () => {
    const url = buildShareViewerUrl(
      { gistUrl: rawGistUrl, gitUrl: '', gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com', preferShort: true }
    );
    expect(url).toContain('g=octocat');
    expect(url).not.toContain('gist_url=');
  });

  it('uses gist_url for non-gist raw URLs', () => {
    const raw = 'https://raw.githubusercontent.com/org/repo/main/opencollection.yml';
    const url = buildShareViewerUrl(
      { gistUrl: raw, gitUrl: '', gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com', preferShort: true }
    );
    expect(url).toContain('gist_url=');
    expect(url).not.toContain('g=octocat');
  });

  it('emits r before g when both are present', () => {
    const url = buildShareViewerUrl(
      { gistUrl: rawGistUrl, gitUrl, gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com', preferShort: true }
    );
    expect(url.indexOf('r=')).toBeLessThan(url.indexOf('g='));
    expect(url).toContain('.yml');
  });

  it('carries a bare gist id through short-form URLs', () => {
    const url = buildShareViewerUrl(
      { gistUrl: '', gitUrl: '', gist: 'abc123', path: '' },
      { baseUrl: 'https://share.usebruno.com', preferShort: true }
    );
    expect(url).toContain('gist=abc123');
  });

  it('appends a readable per-segment deep-link hash', () => {
    const url = buildShareViewerUrl(
      { gistUrl: rawGistUrl, gitUrl, gist: '', path: '' },
      { baseUrl: 'https://share.usebruno.com', requestId: 'auth/login', preferShort: true }
    );
    expect(url).toContain('#/req/auth/login');
    const hash = url.slice(url.indexOf('#'));
    expect(hash).not.toContain('%2F');
  });
});
