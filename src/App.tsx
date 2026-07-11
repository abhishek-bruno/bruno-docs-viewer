import { parseSource, hasAnySource } from './sources/sourceParams';
import { parseLocalUploadKey } from './storage/localUpload';
import { parsePostmanShareParams } from './postman/postmanImport';
import { HomePage } from './ui/HomePage';
import { LocalUploadView } from './ui/LocalUploadView';
import { PostmanView } from './ui/PostmanView';
import { SourceView } from './ui/SourceView';

/**
 * Routes on the query string, in order:
 *   ?local=<key>  -> a browser-local upload
 *   ?pm=…         -> a Postman share (cache-first import)
 *   a gist/repo   -> fetch and render
 *   nothing       -> the home page
 * Navigation is full-page (window.location.assign), so this runs once per load.
 */
export function App() {
  const search = new URLSearchParams(window.location.search);

  const localKey = parseLocalUploadKey(search);
  if (localKey) return <LocalUploadView uploadKey={localKey} />;

  const postman = parsePostmanShareParams(search);
  if (postman) return <PostmanView source={postman} />;

  const source = parseSource(search);
  if (hasAnySource(source)) return <SourceView source={source} />;

  return <HomePage />;
}
