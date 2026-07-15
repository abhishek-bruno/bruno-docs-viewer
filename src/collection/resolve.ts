import yaml from 'js-yaml';
import { sniffFormat } from './format';

/**
 * The single stage every client-fetched document flows through before it
 * reaches the renderer: detect the format and, when it is not OpenCollection,
 * convert it. Returns OpenCollection YAML.
 *
 * `@usebruno/converters` is imported lazily so the common OpenCollection path
 * never pulls the converter bundle into the main chunk.
 */
export async function resolveToOpenCollection(text: string): Promise<string> {
  const format = sniffFormat(text);
  if (format === 'opencollection') return text;

  // format === 'openapi'. openApiToBruno accepts the raw string, handles both
  // OpenAPI 3.x and Swagger 2.0, and returns the Bruno collection directly.
  const { openApiToBruno, brunoToOpenCollection } = await import('@usebruno/converters');
  const bruno = openApiToBruno(text);
  const oc = brunoToOpenCollection(bruno);
  return yaml.dump(oc, { lineWidth: -1, noRefs: true });
}
