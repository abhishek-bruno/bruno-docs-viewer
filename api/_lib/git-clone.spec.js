import { describe, it, expect } from 'vitest';
import { normalizeGitSource, assertCloneAllowed } from './git-clone.js';

describe('normalizeGitSource', () => {
  it('github web URL with /tree/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://github.com/org/repo/tree/main/apis/users', '')).toEqual({
      cloneUrl: 'https://github.com/org/repo.git', ref: 'main', subdir: 'apis/users'
    });
  });

  it('github .git clone URL (+ path param)', () => {
    expect(normalizeGitSource('https://github.com/usebruno/bruno-testbench.git', 'apis')).toEqual({
      cloneUrl: 'https://github.com/usebruno/bruno-testbench.git', ref: undefined, subdir: 'apis'
    });
  });

  it('gitlab web URL with /-/tree/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://gitlab.com/org/repo/-/tree/dev/sub', '')).toEqual({
      cloneUrl: 'https://gitlab.com/org/repo.git', ref: 'dev', subdir: 'sub'
    });
  });

  it('bitbucket web URL with /src/<ref>/<subdir>', () => {
    expect(normalizeGitSource('https://bitbucket.org/org/repo/src/main/sub', '')).toEqual({
      cloneUrl: 'https://bitbucket.org/org/repo.git', ref: 'main', subdir: 'sub'
    });
  });

  it('gitlab subgroups with /-/tree/', () => {
    expect(normalizeGitSource('https://gitlab.com/grp/sub/repo/-/tree/main/apis', '')).toEqual({
      cloneUrl: 'https://gitlab.com/grp/sub/repo.git', ref: 'main', subdir: 'apis'
    });
  });

  it('self-hosted .git URL at any depth (host-agnostic)', () => {
    expect(normalizeGitSource('https://git.acme.io/team/group/project.git', 'collections/orders')).toEqual({
      cloneUrl: 'https://git.acme.io/team/group/project.git', ref: undefined, subdir: 'collections/orders'
    });
  });
});

describe('assertCloneAllowed (SSRF guard)', () => {
  it('allows the default public hosts over https', () => {
    expect(() => assertCloneAllowed('https://github.com/o/r.git')).not.toThrow();
    expect(() => assertCloneAllowed('https://gitlab.com/o/r.git')).not.toThrow();
    expect(() => assertCloneAllowed('https://bitbucket.org/o/r.git')).not.toThrow();
  });

  it('blocks non-https', () => {
    expect(() => assertCloneAllowed('http://github.com/o/r.git')).toThrow(/https/i);
  });

  it('blocks private / loopback / metadata / unknown hosts', () => {
    expect(() => assertCloneAllowed('https://localhost/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://127.0.0.1/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://169.254.169.254/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://10.0.0.5/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://git.internal.corp/o/r.git')).toThrow();
    expect(() => assertCloneAllowed('https://evil.example.com/o/r.git')).toThrow(/allowed/i);
  });
});
