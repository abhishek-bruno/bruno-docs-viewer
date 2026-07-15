import http from 'isomorphic-git/http/node';
import git from 'isomorphic-git';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Default public git hosts. Extend for self-hosted via GIT_IMPORT_ALLOWED_HOSTS
// (comma-separated hostnames).
const DEFAULT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];
const allowedHosts = () => {
  const extra = (process.env.GIT_IMPORT_ALLOWED_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set([...DEFAULT_HOSTS, ...extra]);
};

const fail = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const isBlockedHost = (host) => {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 loopback / unique-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;          // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;          // 192.168/16
  }
  return false;
};

/** SSRF guard: https only, no private/loopback/metadata hosts, allowlisted host. */
export function assertCloneAllowed(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    fail('Invalid repository URL.');
  }
  if (u.protocol !== 'https:') fail('Only https git URLs are supported.');
  const host = u.hostname.toLowerCase();
  if (isBlockedHost(host)) fail('That host is not allowed.', 400);
  if (!allowedHosts().has(host)) {
    fail('That git host is not on the allowed list. Set GIT_IMPORT_ALLOWED_HOSTS to add it.', 400);
  }
}

/**
 * Normalize a repo web/clone URL (+ optional path) into { cloneUrl, ref, subdir }.
 * Handles, in order: an explicit `.git` anywhere in the path (any host, any depth
 * incl. GitLab subgroups); the three big hosts' subtree web URLs; and a
 * best-effort fallback for unknown hosts (clone the whole path). The `path`
 * param always appends to the subdir.
 */
export function normalizeGitSource(gitUrl, path = '') {
  const u = new URL(gitUrl);
  const host = u.hostname.toLowerCase();
  const full = u.pathname.replace(/^\/+/, '');
  let repoPath;
  let ref;
  let subdir = '';

  const dotGit = full.match(/^(.+?\.git)(?:\/.*)?$/i);
  if (dotGit) {
    repoPath = dotGit[1].replace(/\.git$/i, '');
  } else if (host === 'github.com') {
    const seg = full.split('/');
    repoPath = seg.slice(0, 2).join('/');
    if (seg[2] === 'tree' && seg[3]) { ref = seg[3]; subdir = seg.slice(4).join('/'); }
  } else if (host === 'gitlab.com') {
    const idx = full.indexOf('/-/');
    repoPath = idx === -1 ? full : full.slice(0, idx);
    if (idx !== -1) {
      const rest = full.slice(idx + 3).split('/');
      if (rest[0] === 'tree' && rest[1]) { ref = rest[1]; subdir = rest.slice(2).join('/'); }
    }
  } else if (host === 'bitbucket.org') {
    const seg = full.split('/');
    repoPath = seg.slice(0, 2).join('/');
    if (seg[2] === 'src' && seg[3]) { ref = seg[3]; subdir = seg.slice(4).join('/'); }
  } else {
    repoPath = full;
  }

  repoPath = repoPath.replace(/\/+$/, '');
  if (!repoPath) fail('Not a repository URL.');

  const extra = (path || '').replace(/^\/+|\/+$/g, '');
  subdir = [subdir, extra].filter(Boolean).join('/');

  return { cloneUrl: `https://${host}/${repoPath}.git`, ref, subdir };
}

/**
 * Shallow-clone the repo into a fresh temp directory on the real fs and return
 * its path. The caller removes it (git-core does, in a `finally`).
 */
export async function cloneToTempDir({ cloneUrl, ref }) {
  assertCloneAllowed(cloneUrl);
  const dir = path.join(os.tmpdir(), `bdv-git-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await git.clone({
      fs, http, dir, url: cloneUrl,
      ...(ref ? { ref } : {}),
      singleBranch: true, depth: 1, noTags: true
    });
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    fail(`Could not clone the repository: ${err.message}`, 502);
  }
  return dir;
}
