import { parseSource, hasAnySource } from './sources/sourceParams';
import { parsePrefixPath } from './sources/classifySource';
import { parseLocalUploadKey } from './storage/localUpload';
import { parsePostmanShareParams } from './postman/postmanImport';
import { HomePage } from './ui/HomePage';
import { LocalUploadView } from './ui/LocalUploadView';
import { PostmanView } from './ui/PostmanView';
import { PostmanWorkspaceView } from './ui/PostmanWorkspaceView';
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
  // Prefix route: <host>/<source-url>[#/req/<id>]. When the path is not "/", it
  // IS the source URL; render the matching view directly (no redirect), keeping
  // the pretty URL in the address bar.
  const prefix = parsePrefixPath(window.location.pathname, window.location.search);
  if (prefix) {
    if (prefix.kind === 'postman') {
      return <PostmanView source={{ collectionUrl: prefix.collectionUrl, environmentUrls: prefix.environmentUrls }} />;
    }
    if (prefix.kind === 'postman-workspace') {
      return <PostmanWorkspaceView workspaceUrl={prefix.workspaceUrl} />;
    }
    return <SourceView source={prefix.source} />;
  }

  const search = new URLSearchParams(window.location.search);

  const localKey = parseLocalUploadKey(search);
  if (localKey) return <LocalUploadView uploadKey={localKey} />;

  const postman = parsePostmanShareParams(search);
  if (postman) return <PostmanView source={postman} />;

  const source = parseSource(search);
  if (hasAnySource(source)) return <SourceView source={source} />;

  return <HomePage />;
}
