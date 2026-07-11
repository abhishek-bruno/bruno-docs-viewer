const ENDPOINT = '/api/postman-import';

const parsePostmanUrl = (value: string): URL | null => {
  try {
    const u = new URL(String(value).trim());
    return /(^|\.)postman\.com$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
};

export const isPostmanUrl = (value: string): boolean => parsePostmanUrl(value) !== null;

export const isPostmanCollectionUrl = (value: string): boolean => {
  const u = parsePostmanUrl(value);
  return !!u && /\/collection\//i.test(u.pathname);
};

export const isPostmanEnvironmentUrl = (value: string): boolean => {
  const u = parsePostmanUrl(value);
  return !!u && /\/environment\//i.test(u.pathname);
};

export const buildPostmanShareUrl = (pathname: string, collectionUrl: string, environmentUrls: string[]): string => {
  const params = new URLSearchParams();
  params.set('postman_collection', collectionUrl);
  environmentUrls.forEach((u) => params.append('postman_env', u));
  return `${pathname}?${params.toString()}`;
};

export const parsePostmanShareParams = (search: URLSearchParams): { collectionUrl: string; environmentUrls: string[] } | null => {
  const collectionUrl = search.get('postman_collection');
  if (!collectionUrl) return null;
  return { collectionUrl, environmentUrls: search.getAll('postman_env') };
};

export const runPostmanImport = async (
  { collectionUrl, environmentUrls }: { collectionUrl: string; environmentUrls: string[] }
): Promise<{ name: string; opencollection: string }> => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionUrl, environmentUrls })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status}).`);
  return { name: data.name, opencollection: data.opencollection };
};

const envRow = (): string => `
  <div class="pm-env-row">
    <input type="url" class="pm-input pm-env-input" placeholder="https://www.postman.com/.../environment/<id>" autocomplete="off" spellcheck="false" />
    <button type="button" class="pm-env-remove" title="Remove">✕</button>
  </div>
`;

export const openPostmanEnvModal = ({ collectionUrl, pathname }: { collectionUrl: string; pathname: string }): void => {
  const overlay = document.createElement('div');
  overlay.className = 'pm-overlay';
  overlay.innerHTML = `
    <div class="pm-dialog" role="dialog" aria-modal="true" aria-label="Import from Postman">
      <h2>Import Postman Environments</h2>
      <p class="pm-lead">Add Postman environment links to resolve your collection variables (if any).</p>

      <form id="pm-form">
        <label class="pm-label">Environment links (optional)</label>
        <div id="pm-envs">${envRow()}</div>
        <button type="button" class="pm-add-env" id="pm-add-env">+ Add another environment link</button>

        <p class="pm-error" id="pm-error" hidden></p>

        <div class="pm-footer">
          <button type="button" class="pm-btn pm-btn-secondary" id="pm-cancel">Cancel</button>
          <button type="submit" class="pm-btn pm-btn-primary" id="pm-submit">Import and view</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector(sel) as T;
  const form = $<HTMLFormElement>('#pm-form');
  const envsEl = $<HTMLDivElement>('#pm-envs');
  const errorEl = $<HTMLParagraphElement>('#pm-error');

  const close = () => overlay.remove();
  const showError = (msg: string) => { errorEl.textContent = msg; errorEl.hidden = false; };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  $('#pm-cancel').addEventListener('click', close);

  overlay.querySelector<HTMLInputElement>('.pm-env-input')?.focus();

  $('#pm-add-env').addEventListener('click', () => envsEl.insertAdjacentHTML('beforeend', envRow()));
  envsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.pm-env-remove');
    if (btn && envsEl.querySelectorAll('.pm-env-row').length > 1) btn.closest('.pm-env-row')?.remove();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const environmentUrls = Array.from(overlay.querySelectorAll<HTMLInputElement>('.pm-env-input'))
      .map((i) => i.value.trim())
      .filter(Boolean);

    const badEnv = environmentUrls.find((u) => !isPostmanEnvironmentUrl(u));
    if (badEnv) {
      showError('Environment links must be Postman environment URLs (…/environment/…).');
      return;
    }

    window.location.assign(buildPostmanShareUrl(pathname, collectionUrl, environmentUrls));
  });
};
