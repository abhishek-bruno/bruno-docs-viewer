// Ported from @usebruno/cli packages/bruno-cli/src/utils/collection.js
// (createCollectionJsonFromPathname + helpers). Keep in sync with upstream.
import fs from 'node:fs';
import path from 'node:path';
import { parseRequest, parseCollection, parseFolder, parseEnvironment } from '@usebruno/filestore';

export const FORMAT_CONFIG = {
  yml: { ext: '.yml', collectionFile: 'opencollection.yml', folderFile: 'folder.yml' },
  bru: { ext: '.bru', collectionFile: 'collection.bru', folderFile: 'folder.bru' }
};

export const getCollectionFormat = (collectionPath) => {
  if (fs.existsSync(path.join(collectionPath, 'opencollection.yml'))) return 'yml';
  if (fs.existsSync(path.join(collectionPath, 'bruno.json'))) return 'bru';
  return null;
};

const getCollectionConfig = (collectionPath, format) => {
  if (format === 'yml') {
    const parsed = parseCollection(fs.readFileSync(path.join(collectionPath, 'opencollection.yml'), 'utf8'), { format: 'yml' });
    return { brunoConfig: parsed.brunoConfig, collectionRoot: parsed.collectionRoot || {} };
  }
  const brunoConfig = JSON.parse(fs.readFileSync(path.join(collectionPath, 'bruno.json'), 'utf8'));
  const collectionBruPath = path.join(collectionPath, 'collection.bru');
  const collectionRoot = fs.existsSync(collectionBruPath)
    ? parseCollection(fs.readFileSync(collectionBruPath, 'utf8'), { format: 'bru' })
    : {};
  return { brunoConfig, collectionRoot };
};

const getFolderRoot = (dir, format) => {
  const folderPath = path.join(dir, FORMAT_CONFIG[format].folderFile);
  if (!fs.existsSync(folderPath)) return null;
  return parseFolder(fs.readFileSync(folderPath, 'utf8'), { format });
};

// Unlike the CLI runner (which skips environments), the docs viewer wants them
// so the renderer's environment switcher is populated.
const loadEnvironments = (collectionPath, format) => {
  const dir = path.join(collectionPath, 'environments');
  if (!fs.existsSync(dir)) return [];
  const { ext } = FORMAT_CONFIG[format];
  return fs
    .readdirSync(dir)
    .filter((f) => path.extname(f) === ext)
    .map((f) => {
      try {
        const env = parseEnvironment(fs.readFileSync(path.join(dir, f), 'utf8'), { format });
        // The env name comes from the filename (Bruno convention), like requests.
        return { ...env, name: env?.name || path.basename(f, ext) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

// Port from @usebruno/cli: folders sorted alphabetically, then entries with a
// valid seq inserted at their positions.
const sortByNameThenSequence = (items) => {
  const isSeqValid = (seq) => Number.isFinite(seq) && Number.isInteger(seq) && seq > 0;
  const alpha = [...items].sort((a, b) => (a.name && b.name ? a.name.localeCompare(b.name) : 0));
  const withoutSeq = alpha.filter((f) => !isSeqValid(f.seq));
  const withSeq = alpha.filter((f) => isSeqValid(f.seq)).sort((a, b) => a.seq - b.seq);
  const sorted = [...withoutSeq];
  withSeq.forEach((item) => sorted.splice(Math.min(Math.max(item.seq - 1, 0), sorted.length), 0, item));
  return sorted;
};

export const createCollectionJsonFromPathname = (collectionPath) => {
  const format = getCollectionFormat(collectionPath);
  if (!format) {
    const e = new Error('Not a Bruno collection.');
    e.status = 404;
    throw e;
  }

  const { brunoConfig, collectionRoot } = getCollectionConfig(collectionPath, format);
  const { ext, collectionFile, folderFile } = FORMAT_CONFIG[format];
  const environmentsPath = path.join(collectionPath, 'environments');

  const traverse = (currentPath) => {
    if (currentPath.includes('node_modules')) return [];
    const dirItems = [];
    for (const file of fs.readdirSync(currentPath)) {
      const filePath = path.join(currentPath, file);
      const stats = fs.lstatSync(filePath);
      if (stats.isDirectory()) {
        if (filePath === environmentsPath || file === '.git' || file === 'node_modules') continue;
        const folderItem = { name: file, pathname: filePath, type: 'folder', items: traverse(filePath) };
        const folderRoot = getFolderRoot(filePath, format);
        if (folderRoot) {
          folderItem.root = folderRoot;
          folderItem.seq = folderRoot.meta?.seq;
        }
        dirItems.push(folderItem);
      } else {
        if (file === collectionFile || file === folderFile || path.extname(filePath) !== ext) continue;
        try {
          const requestItem = parseRequest(fs.readFileSync(filePath, 'utf8'), { format });
          dirItems.push({ name: file, ...requestItem, pathname: filePath });
        } catch {
          /* skip invalid file */
        }
      }
    }
    const folders = sortByNameThenSequence(dirItems.filter((i) => i.type === 'folder'));
    const requests = dirItems.filter((i) => i.type !== 'folder').sort((a, b) => a.seq - b.seq);
    return folders.concat(requests);
  };

  return {
    brunoConfig,
    format,
    root: collectionRoot,
    pathname: collectionPath,
    items: traverse(collectionPath),
    environments: loadEnvironments(collectionPath, format)
  };
};

/**
 * Discover every collection under `rootDir`: each directory that is a collection
 * root (has `bruno.json` or `opencollection.yml`). Does not descend into a
 * collection. Returns `{ name, path (relative), format }[]` sorted by path.
 */
export const findCollections = (rootDir) => {
  const found = [];
  const walk = (dir, rel) => {
    const format = getCollectionFormat(dir);
    if (format) {
      let name = rel ? path.basename(rel) : path.basename(dir);
      try {
        const cfg = getCollectionConfig(dir, format);
        name = cfg.brunoConfig?.name || cfg.collectionRoot?.meta?.name || cfg.collectionRoot?.info?.name || name;
      } catch {
        /* keep dir name */
      }
      found.push({ name, path: rel, format });
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
    }
  };
  walk(rootDir, '');
  return found.sort((a, b) => a.path.localeCompare(b.path));
};
