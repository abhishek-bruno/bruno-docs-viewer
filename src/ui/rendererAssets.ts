import { CDN_BASE } from '../config';

/** Poll until the renderer's global constructor is available (or time out). */
export const waitForRenderer = (timeoutMs = 10000): Promise<any> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if ((window as any).OpenCollection) return resolve((window as any).OpenCollection);
      if (Date.now() - started > timeoutMs) return reject(new Error('Renderer failed to load'));
      setTimeout(poll, 50);
    };
    poll();
  });

let rendererAssetsPromise: Promise<void> | null = null;

/** Load the renderer CSS + JS from the CDN once, lazily. */
export const loadRendererAssets = (): Promise<void> => {
  if (!rendererAssetsPromise) {
    rendererAssetsPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${CDN_BASE}/docs/index.css`;
      link.onload = () => {
        const script = document.createElement('script');
        script.src = `${CDN_BASE}/docs/index.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Renderer failed to load'));
        document.head.appendChild(script);
      };
      link.onerror = () => reject(new Error('Renderer styles failed to load'));
      document.head.appendChild(link);
    });
  }
  return rendererAssetsPromise;
};
