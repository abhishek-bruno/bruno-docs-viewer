import yaml from 'js-yaml';
import { postmanToBruno, postmanToBrunoEnvironment, brunoToOpenCollection } from '@usebruno/converters';
import {
  resolveCollectionUid, fetchCollection, fetchEnvironment,
  assertPostmanHost, parseWorkspaceRef, resolveWorkspace, listWorkspaceCollectionUids, fetchCollectionName,
  listWorkspaceEnvironments
} from './postman.js';
import { internalCollectionToV21, internalEnvironmentToPostman } from './mapper.js';

export async function importPostman({ collectionUrl } = {}) {
  if (!collectionUrl) {
    const err = new Error('collectionUrl is required.');
    err.status = 400;
    throw err;
  }

  const collectionUid = await resolveCollectionUid(collectionUrl);
  const internal = await fetchCollection(collectionUid);
  const v21 = internalCollectionToV21(internal);
  const { collection: bruno } = await postmanToBruno(v21, {});

  // Auto-include the workspace's public environments (best-effort): resolve the
  // workspace from the collection URL, list its environments, fetch each one
  // sequentially. If the workspace can't be resolved or Postman rate-limits
  // (429), import the collection with whatever was fetched (possibly none).
  const environments = [];
  try {
    const { handle, slug } = parseWorkspaceRef(collectionUrl);
    if (handle && slug) {
      const ws = await resolveWorkspace(handle, slug);
      for (const env of await listWorkspaceEnvironments(ws.id)) {
        const envInternal = await fetchEnvironment(env.id);
        environments.push(await postmanToBrunoEnvironment(internalEnvironmentToPostman(envInternal)));
      }
    }
  } catch {
    // best-effort: import the collection without (further) environments
  }
  if (environments.length) bruno.environments = environments;

  const oc = brunoToOpenCollection(bruno);
  return {
    name: (oc.info && oc.info.name) || bruno.name || 'Imported Collection',
    environments: environments.map((e) => e.name),
    opencollection: yaml.dump(oc, { lineWidth: -1, noRefs: true })
  };
}

// List the public collections in a Postman workspace URL, for the picker.
// Uses only non-gated endpoints: ws/proxy (workspaces + publishing) and
// collection get-by-id for names.
export async function listPostmanWorkspace(workspaceUrl) {
  const url = String(workspaceUrl || '').trim();
  if (!url) { const e = new Error('A Postman workspace URL is required.'); e.status = 400; throw e; }
  assertPostmanHost(url);
  const { handle, slug } = parseWorkspaceRef(url);
  if (!handle || !slug) { const e = new Error('Not a Postman workspace URL.'); e.status = 400; throw e; }

  const ws = await resolveWorkspace(handle, slug);
  const uids = await listWorkspaceCollectionUids(ws.id);
  const collections = (
    await Promise.all(
      uids.map(async (uid) => {
        const name = await fetchCollectionName(uid);
        return name ? { name, url: `https://www.postman.com/${handle}/${slug}/collection/${uid}` } : null;
      })
    )
  ).filter(Boolean);

  return { name: ws.name, collections };
}
