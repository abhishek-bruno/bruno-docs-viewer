import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

const PING = 'meta {\n  name: Ping\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://x/o\n}\n';
const makeMonorepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdv-core-'));
  fs.mkdirSync(path.join(dir, 'apis/orders'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apis/orders/bruno.json'), JSON.stringify({ name: 'Orders API' }));
  fs.writeFileSync(path.join(dir, 'apis/orders/Ping.bru'), PING);
  fs.mkdirSync(path.join(dir, 'apis/users'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apis/users/bruno.json'), JSON.stringify({ name: 'Users API' }));
  return dir;
};

describe('importGitRepo — monorepo (clone mocked to real fs fixtures)', () => {
  afterEach(() => { vi.doUnmock('./git-clone.js'); vi.resetModules(); });

  it('returns the collection list when several exist and none is targeted', async () => {
    const dir = makeMonorepo();
    vi.resetModules();
    vi.doMock('./git-clone.js', () => ({
      normalizeGitSource: () => ({ cloneUrl: 'https://github.com/o/m.git', ref: undefined, subdir: '' }),
      cloneToTempDir: async () => dir // git-core removes it in its finally
    }));
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/o/m.git', path: '' });
    expect(out.collections).toEqual([
      { name: 'Orders API', path: 'apis/orders' },
      { name: 'Users API', path: 'apis/users' }
    ]);
  });

  it('converts the targeted collection when path is given', async () => {
    const dir = makeMonorepo();
    vi.resetModules();
    vi.doMock('./git-clone.js', () => ({
      normalizeGitSource: (g, p) => ({ cloneUrl: 'https://github.com/o/m.git', ref: undefined, subdir: p }),
      cloneToTempDir: async () => dir
    }));
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/o/m.git', path: 'apis/orders' });
    expect(out.name).toBe('Orders API');
    expect(yaml.load(out.opencollection)).toBeTruthy();
  });
});

describe('importGitRepo (integration, real clone, network)', () => {
  it('imports a real public repo to OpenCollection YAML or a collection list', async () => {
    const { importGitRepo } = await import('./git-core.js');
    const out = await importGitRepo({ gitUrl: 'https://github.com/usebruno/bruno-testbench.git', path: '' });
    if (out.opencollection) {
      expect(yaml.load(out.opencollection)).toBeTruthy();
      expect(out.name).toBeTruthy();
    } else {
      expect(Array.isArray(out.collections)).toBe(true);
    }
  }, 60000);
});
