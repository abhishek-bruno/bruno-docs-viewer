import { createRoot } from 'react-dom/client';
import './style.css';
import { App } from './App';
import { getRequestIdFromHash } from './sources/sourceParams';

// No StrictMode: the docs renderer is an imperative third-party bundle mounted
// into a DOM node, and StrictMode's dev double-invoke would mount it twice.
// Navigation in this app is full-page, so a component never truly remounts.
createRoot(document.getElementById('app') as HTMLElement).render(<App />);

// A hash change (deep link to a request) after load: reload so the renderer
// selects the requested item on mount.
window.addEventListener('hashchange', () => {
  if (getRequestIdFromHash()) window.location.reload();
});
