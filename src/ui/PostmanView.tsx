import { useEffect, useState } from 'react';
import { EMPTY_SOURCE } from '../sources/sourceParams';
import { runPostmanImport } from '../postman/postmanImport';
import { postmanCacheKey, getCachedImport, touchCachedImport, cachePostmanImport } from '../storage/importCache';
import { DocsRenderer } from './DocsRenderer';
import { PostmanEnvModal } from './PostmanEnvModal';
import { Loading, Message } from './States';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; yaml: string };

export function PostmanView({ source }: { source: { collectionUrl: string; environmentUrls: string[] } }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [showEnvModal, setShowEnvModal] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const cacheKey = postmanCacheKey(source.collectionUrl, source.environmentUrls);
      const href = `${window.location.pathname}${window.location.search}`;
      try {
        let yaml = await getCachedImport(cacheKey);
        if (yaml) {
          void touchCachedImport(cacheKey);
        } else {
          const result = await runPostmanImport(source);
          yaml = result.opencollection;
          void cachePostmanImport(cacheKey, { title: result.name, subtitle: source.collectionUrl, href, yaml });
        }
        if (active) setState({ status: 'ready', yaml });
      } catch (err) {
        if (active) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'The Postman collection could not be imported.'
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [source.collectionUrl, source.environmentUrls.join(',')]);

  if (state.status === 'loading') {
    return <Loading message="Importing from Postman…" hint="Fetching and converting the collection. This can take a few seconds." />;
  }
  if (state.status === 'error') {
    return <Message title="Couldn't import from Postman" body={state.message} action={{ type: 'go-home' }} />;
  }
  return (
    <>
      <DocsRenderer
        text={state.yaml}
        source={EMPTY_SOURCE}
        extraActions={
          <button type="button" className="btn btn-secondary" onClick={() => setShowEnvModal(true)}>
            Import Postman environment
          </button>
        }
      />
      {showEnvModal && (
        <PostmanEnvModal
          collectionUrl={source.collectionUrl}
          // Always land on the canonical ?pm=&pe= form (root path), so adding
          // environments works whether the view came from the prefix route or
          // the query route.
          pathname="/"
          initialEnvs={source.environmentUrls}
          onClose={() => setShowEnvModal(false)}
        />
      )}
    </>
  );
}
