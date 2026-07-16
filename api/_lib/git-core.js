import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { brunoToOpenCollection } from '@usebruno/converters';
import { normalizeGitSource, cloneToTempDir } from './git-clone.js';
import { createCollectionJsonFromPathname, findCollections } from './collection-loader.js';

const convert = (collectionDir) => {
  const bruno = createCollectionJsonFromPathname(collectionDir);
  // The loader carries the name on `brunoConfig`; brunoToOpenCollection reads a
  // top-level `name`, so surface it (root meta name wins if present).
  bruno.name = bruno.root?.meta?.name || bruno.brunoConfig?.name || bruno.name;
  const oc = brunoToOpenCollection(bruno);
  return {
    name: (oc.info && oc.info.name) || bruno.name || 'Bruno Collection',
    opencollection: yaml.dump(oc, { lineWidth: -1, noRefs: true })
  };
};

/**
 * Returns either a single converted collection `{ name, opencollection }` (when
 * a collection is targeted via `path`, or the repo has exactly one) or the list
 * `{ collections: { name, path }[] }` for a monorepo with several. Always
 * removes the temp clone afterward.
 */
export async function importGitRepo({ gitUrl, path: subPath = '' } = {}) {
  if (!gitUrl) {
    const e = new Error('gitUrl is required.');
    e.status = 400;
    throw e;
  }

  const source = normalizeGitSource(gitUrl, subPath);
  const dir = await cloneToTempDir(source);
  try {
    const collections = findCollections(dir);
    if (!collections.length) {
      const e = new Error('No Bruno collection found in this repository.');
      e.status = 404;
      throw e;
    }

    if (source.subdir) {
      const match = collections.find((c) => c.path === source.subdir);
      if (!match) {
        const e = new Error('No Bruno collection at that path.');
        e.status = 404;
        throw e;
      }
      return convert(path.join(dir, match.path));
    }
    if (collections.length === 1) {
      return convert(path.join(dir, collections[0].path));
    }
    return { collections: collections.map(({ name, path }) => ({ name, path })) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
