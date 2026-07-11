import { saveLocalUpload, buildLocalUploadUrl, setUploadFlash } from './localUpload';

const ENDPOINT = '/api/postman-import';

export const isPostmanCollectionUrl = (value: string): boolean => {
  try {
    const u = new URL(String(value).trim());
    return /(^|\.)postman\.com$/i.test(u.hostname) && /\/collection\//i.test(u.pathname);
  } catch {
    return false;
  }
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
      <h2>Postman collection detected</h2>
      <p class="pm-lead">It will be converted to OpenCollection and viewed here.</p>

      <div class="pm-note">
        <strong>This one uses Bruno's server.</strong> Postman blocks direct browser access, so the link is sent to Bruno's server to fetch and convert the collection. The link is used only for this conversion and is not stored.
      </div>

      <div class="pm-collection">${escapeHtml(collectionUrl)}</div>

      <label class="pm-label">Environment links (optional)</label>
      <div id="pm-envs">${envRow()}</div>
      <button type="button" class="pm-add-env" id="pm-add-env">+ Add another environment link</button>

      <p class="pm-error" id="pm-error" hidden></p>

      <div class="pm-footer">
        <button type="button" class="pm-btn pm-btn-secondary" id="pm-cancel">Cancel</button>
        <button type="button" class="pm-btn pm-btn-primary" id="pm-submit">Import and view</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector(sel) as T;
  const envsEl = $<HTMLDivElement>('#pm-envs');
  const errorEl = $<HTMLParagraphElement>('#pm-error');
  const submitBtn = $<HTMLButtonElement>('#pm-submit');

  const close = () => overlay.remove();
  const showError = (msg: string) => { errorEl.textContent = msg; errorEl.hidden = false; };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  $('#pm-cancel').addEventListener('click', close);

  $('#pm-add-env').addEventListener('click', () => envsEl.insertAdjacentHTML('beforeend', envRow()));
  envsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.pm-env-remove');
    if (btn && envsEl.querySelectorAll('.pm-env-row').length > 1) btn.closest('.pm-env-row')?.remove();
  });

  submitBtn.addEventListener('click', async () => {
    const environmentUrls = Array.from(overlay.querySelectorAll<HTMLInputElement>('.pm-env-input'))
      .map((i) => i.value.trim())
      .filter(Boolean);

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="pm-spinner" aria-hidden="true"></span>Importing…';

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionUrl, environmentUrls })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status}).`);

      const { slot, evicted } = saveLocalUpload(data.opencollection, `${data.name || 'postman-import'}.yml`);
      if (evicted) setUploadFlash('evicted');
      window.location.assign(buildLocalUploadUrl(slot, { pathname }));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Import failed.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Import and view';
    }
  });
};
