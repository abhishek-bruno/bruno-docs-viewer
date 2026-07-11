import yaml from 'js-yaml';
import { postmanToBruno, postmanToBrunoEnvironment, brunoToOpenCollection } from '@usebruno/converters';
import { resolveCollectionUid, resolveEnvironmentUid, fetchCollection, fetchEnvironment } from './postman.js';
import { internalCollectionToV21, internalEnvironmentToPostman } from './mapper.js';

export async function importPostman({ collectionUrl, environmentUrls = [] } = {}) {
  if (!collectionUrl) {
    const err = new Error('collectionUrl is required.');
    err.status = 400;
    throw err;
  }

  const collectionUid = await resolveCollectionUid(collectionUrl);
  const internal = await fetchCollection(collectionUid);
  const v21 = internalCollectionToV21(internal);
  const { collection: bruno } = await postmanToBruno(v21, {});

  const envUrls = Array.isArray(environmentUrls) ? environmentUrls.filter(Boolean) : [];
  const environments = [];
  for (const envUrl of envUrls) {
    const envUid = resolveEnvironmentUid(envUrl);
    const envInternal = await fetchEnvironment(envUid);
    const brunoEnv = await postmanToBrunoEnvironment(internalEnvironmentToPostman(envInternal));
    environments.push(brunoEnv);
  }
  if (environments.length) bruno.environments = environments;

  const oc = brunoToOpenCollection(bruno);
  return {
    name: (oc.info && oc.info.name) || bruno.name || 'Imported Collection',
    environments: environments.map((e) => e.name),
    opencollection: yaml.dump(oc, { lineWidth: -1, noRefs: true })
  };
}
