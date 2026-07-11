import { useEffect, useState } from 'react';
import { EMPTY_SOURCE } from '../sources/sourceParams';
import { readLocalUpload } from '../storage/localUpload';
import { touchCollection } from '../storage/collectionStore';
import { DocsRenderer } from './DocsRenderer';
import { Loading, Message } from './States';

type State = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; yaml: string };

export function LocalUploadView({ uploadKey }: { uploadKey: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      const yaml = await readLocalUpload(uploadKey);
      if (!active) return;
      if (!yaml) return setState({ status: 'missing' });
      void touchCollection(uploadKey);
      setState({ status: 'ready', yaml });
    })();
    return () => {
      active = false;
    };
  }, [uploadKey]);

  if (state.status === 'loading') return <Loading message="Loading collection…" hint="Reading it from your browser storage." />;
  if (state.status === 'missing') {
    return (
      <Message
        title="Collection not found"
        body="This local preview is no longer available in your browser. Upload it again from the home page."
        action={{ type: 'go-home' }}
      />
    );
  }
  // Uploads have no shareable URL, so no Copy link button.
  return <DocsRenderer text={state.yaml} source={EMPTY_SOURCE} />;
}
