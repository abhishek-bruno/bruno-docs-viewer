import { useEffect, useState } from 'react';
import { decideSource, type SourcePointers } from '../sources/sourceParams';
import { loadCollectionText, CollectionFetchError } from '../sources/loader';
import { recordRecentLink } from '../storage/recentLinks';
import { parseCollectionTitle } from '../storage/localUpload';
import { DocsRenderer } from './DocsRenderer';
import { Loading, Message } from './States';

type ErrorKind = 'not-found' | 'cors' | 'unknown';
type State = { status: 'loading' } | { status: 'error'; kind: ErrorKind } | { status: 'ready'; text: string };

export function SourceView({ source }: { source: SourcePointers }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const text = await loadCollectionText(source);
        void recordRecentLink(source, parseCollectionTitle(text));
        if (active) setState({ status: 'ready', text });
      } catch (err) {
        const kind: ErrorKind = err instanceof CollectionFetchError ? (err.kind as ErrorKind) : 'unknown';
        if (active) setState({ status: 'error', kind });
      }
    })();
    return () => {
      active = false;
    };
    // A source object is stable for the page's life; key on its pointers.
  }, [source.gitUrl, source.gistUrl, source.gist, source.path]);

  if (state.status === 'loading') return <Loading message="Loading collection…" hint="Fetching the collection source." />;

  if (state.status === 'ready') {
    return <DocsRenderer text={state.text} source={source} />;
  }

  const isRepoOnly = decideSource(source) === 'repo' && !source.gistUrl && !source.gist;
  if (state.kind === 'not-found') {
    return <Message title="Collection not found" body="This shared collection no longer exists." action={{ type: 'go-home' }} />;
  }
  if (state.kind === 'cors') {
    return (
      <Message
        title={isRepoOnly ? 'Private collection' : "Couldn't load this collection"}
        body={
          isRepoOnly
            ? "This collection is private and can't be viewed in the browser. Open it in Bruno to view and sync it."
            : 'The collection source could not be reached in the browser. You can still open it in Bruno.'
        }
        action={{ type: 'open-in-bruno', source }}
      />
    );
  }
  return <Message title="Couldn't load this collection" body="Something went wrong loading this collection." action={{ type: 'go-home' }} />;
}
