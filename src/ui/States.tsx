import { LOGO_URL } from '../config';
import { buildFetchDeeplinkUrl, type SourcePointers } from '../sources/sourceParams';

export type MessageAction =
  | { type: 'open-in-bruno'; source: SourcePointers }
  | { type: 'go-home' }
  | { type: 'none' };

export function Loading({
  message = 'Loading collection…',
  hint
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="state">
      <div className="state-spinner" role="status" aria-label={message} />
      <p className="state-loading-message">{message}</p>
      {hint && <p className="state-loading-hint">{hint}</p>}
    </div>
  );
}

export function Message({
  title,
  body,
  action = { type: 'none' }
}: {
  title: string;
  body: string;
  action?: MessageAction;
}) {
  return (
    <div className="state">
      <img className="state-logo" src={LOGO_URL} alt="Bruno" />
      <h1>{title}</h1>
      <p>{body}</p>
      {action.type === 'open-in-bruno' && (
        <a className="btn btn-primary" href={buildFetchDeeplinkUrl(action.source)}>
          Open in Bruno
        </a>
      )}
      {action.type === 'go-home' && (
        <a className="btn btn-primary" href={window.location.pathname || '/'}>
          Go to Home
        </a>
      )}
    </div>
  );
}
