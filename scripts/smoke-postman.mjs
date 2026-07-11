import yaml from 'js-yaml';
import { postmanToBruno, postmanToBrunoEnvironment, brunoToOpenCollection } from '@usebruno/converters';
import { resolveCollectionUid, resolveEnvironmentUid, fetchCollection, fetchEnvironment } from '../api/lib/postman.js';
import { internalCollectionToV21, internalEnvironmentToPostman } from '../api/lib/mapper.js';

const COLLECTION = 'https://www.postman.com/paypal/paypal-public-api-workspace/collection/ujhlb45/paypal-apis';
const ENV = 'https://www.postman.com/stripedev/stripe-developers/environment/665823-fd03c411-50c3-4d60-81fa-1820e820eeb3';

const run = async () => {
  const uid = await resolveCollectionUid(COLLECTION);
  console.log('resolved collection uid:', uid);
  const internal = await fetchCollection(uid);
  console.log('fetched internal model:', internal.name, '| folders', (internal.folders || []).length, '| requests', (internal.requests || []).length);
  const v21 = internalCollectionToV21(internal);
  const { collection: bruno } = await postmanToBruno(v21, {});
  console.log('postmanToBruno OK:', bruno.name, '| top items', (bruno.items || []).length);

  const envUid = resolveEnvironmentUid(ENV);
  const envInternal = await fetchEnvironment(envUid);
  const pmEnv = internalEnvironmentToPostman(envInternal);
  const brunoEnv = await postmanToBrunoEnvironment(pmEnv);
  bruno.environments = [brunoEnv];
  console.log('environment converted:', brunoEnv.name, '| vars', (brunoEnv.variables || []).length);

  const oc = brunoToOpenCollection(bruno);
  const ocYaml = yaml.dump(oc, { lineWidth: -1, noRefs: true });
  console.log('opencollection YAML bytes:', ocYaml.length);

  // round-trip parse to ensure valid YAML
  const parsed = yaml.load(ocYaml);
  console.log('YAML re-parses:', !!parsed, '| top keys:', Object.keys(parsed).join(','));
  console.log('--- YAML head ---');
  console.log(ocYaml.split('\n').slice(0, 20).join('\n'));
};

run().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
