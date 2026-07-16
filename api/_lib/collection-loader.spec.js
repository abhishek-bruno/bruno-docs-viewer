import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCollectionJsonFromPathname, findCollections, getCollectionFormat } from './collection-loader.js';

const PING_BRU = 'meta {\n  name: Ping\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://api.example.com/ping\n}\n';
let repo;

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bdv-loader-'));
  fs.mkdirSync(path.join(repo, 'apis/orders/list'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apis/orders/bruno.json'), JSON.stringify({ name: 'Orders API', version: '1' }));
  fs.writeFileSync(path.join(repo, 'apis/orders/Ping.bru'), PING_BRU);
  fs.writeFileSync(path.join(repo, 'apis/orders/list/Get.bru'), PING_BRU);
  fs.mkdirSync(path.join(repo, 'apis/orders/environments'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apis/orders/environments/Local.bru'), 'vars {\n  host: http://localhost\n}\n');
  fs.mkdirSync(path.join(repo, 'apis/users'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apis/users/bruno.json'), JSON.stringify({ name: 'Users API', version: '1' }));
});
afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('getCollectionFormat', () => {
  it('detects bru via bruno.json; null when not a collection root', () => {
    expect(getCollectionFormat(path.join(repo, 'apis/orders'))).toBe('bru');
    expect(getCollectionFormat(repo)).toBeNull();
  });
});

describe('findCollections', () => {
  it('finds each collection dir (name + relative path + format), does not nest', () => {
    expect(findCollections(repo)).toEqual([
      { name: 'Orders API', path: 'apis/orders', format: 'bru' },
      { name: 'Users API', path: 'apis/users', format: 'bru' }
    ]);
  });
});

describe('createCollectionJsonFromPathname', () => {
  it('builds the canonical collection JSON (folders first, then requests)', () => {
    const c = createCollectionJsonFromPathname(path.join(repo, 'apis/orders'));
    expect(c.format).toBe('bru');
    expect(c.brunoConfig.name).toBe('Orders API');
    expect(c.items[0]).toMatchObject({ type: 'folder', name: 'list' });
    expect(c.items.some((i) => i.type === 'http-request' && i.name === 'Ping')).toBe(true);
  });

  it('loads environments (name from filename), unlike the CLI runner', () => {
    const c = createCollectionJsonFromPathname(path.join(repo, 'apis/orders'));
    expect(c.environments.map((e) => e.name)).toEqual(['Local']);
    expect(c.environments[0].variables?.some((v) => v.name === 'host')).toBe(true);
  });
});
