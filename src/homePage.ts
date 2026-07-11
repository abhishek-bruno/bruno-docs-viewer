import {
  normalizeYamlDocumentUrl,
  type SourcePointers
} from './sourceParams';
import {
  buildLocalUploadUrl,
  clearLocalUploads,
  consumeUploadFlash,
  formatRelativeTime,
  listLocalUploads,
  removeLocalUpload,
  saveLocalUpload,
  setUploadFlash
} from './localUpload';
import {
  buildRecentLinkHref,
  clearRecentLinks,
  listRecentLinks,
  removeRecentLink
} from './recentLinks';
import { isPostmanCollectionUrl, isPostmanUrl, openPostmanEnvModal } from './postmanImport';

const LOGO_URL =
  'https://raw.githubusercontent.com/usebruno/mintlify-docs/main/logo/light.png';

// When the page is restored from the bfcache (e.g. Back from a rendered
// collection), browsers re-show the DOM as-is, including a typed URL. Clear it.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const input = document.querySelector('input[name="yamlUrl"]') as HTMLInputElement | null;
    if (input) input.value = '';
  });
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MAX_RECENTS = 10;

type RecentItem = {
  title: string;
  subtitle: string;
  timestamp: number;
  href: string;
  remove: { action: 'remove-link'; linkId: string } | { action: 'remove-upload'; slot: number };
};

const collectRecents = (pathname: string): RecentItem[] => {
  const links: RecentItem[] = listRecentLinks().map((entry) => ({
    title: entry.title,
    subtitle: entry.subtitle,
    timestamp: entry.lastOpenedAt,
    href: buildRecentLinkHref(entry.source, { pathname }),
    remove: { action: 'remove-link', linkId: entry.id }
  }));

  const uploads: RecentItem[] = listLocalUploads().map((entry) => ({
    title: entry.title,
    subtitle: entry.fileName,
    timestamp: entry.savedAt,
    href: buildLocalUploadUrl(entry.slot, { pathname }),
    remove: { action: 'remove-upload', slot: entry.slot }
  }));

  return [...links, ...uploads]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENTS);
};

const renderRecentItem = (item: RecentItem): string => {
  const removeAttrs =
    item.remove.action === 'remove-link'
      ? `data-action="remove-link" data-link-id="${escapeHtml(item.remove.linkId)}"`
      : `data-action="remove-upload" data-slot="${item.remove.slot}"`;

  return `
    <li class="home-recent-item" role="link" tabindex="0" data-href="${item.href}">
      <div class="home-recent-meta">
        <span class="home-recent-title">${escapeHtml(item.title)}</span>
        <span class="home-recent-subtitle">${escapeHtml(item.subtitle)} · ${formatRelativeTime(item.timestamp)}</span>
      </div>
      <button type="button" class="home-recent-remove" ${removeAttrs}>Remove</button>
    </li>
  `;
};

const renderHistory = (pathname: string): string => {
  const items = collectRecents(pathname);
  if (!items.length) return '';

  return `
    <section class="home-history" id="home-history">
      <section class="home-recents">
        <div class="home-recents-header">
          <h3 class="home-recents-heading">Recents</h3>
          <button type="button" class="home-clear-history" data-action="clear-all">Clear history</button>
        </div>
        <ul class="home-recent-list">${items.map(renderRecentItem).join('')}</ul>
      </section>
    </section>
  `;
};

export const renderHomePage = (
  container: HTMLElement,
  handlers: {
    onUrlSubmit: (source: Pick<SourcePointers, 'gistUrl' | 'gitUrl'>) => void;
  }
): void => {
  const pathname = window.location.pathname || '/';
  const flash = consumeUploadFlash();
  const hasHistory = listRecentLinks().length > 0 || listLocalUploads().length > 0;

  container.innerHTML = `
    <div class="home${hasHistory ? ' home--with-history' : ''}">
      <div class="home-shell">
        <header class="home-hero">
          <img class="state-logo" src="${LOGO_URL}" alt="Bruno" />
          <h1>View Bruno API Docs</h1>
          <p class="home-lead">
            Supports OpenCollection single YAML file URL or Postman public collection URL.
          </p>
          ${flash === 'evicted' ? '<p class="home-flash">Oldest local preview was replaced to make room for the new upload.</p>' : ''}
        </header>

        <section class="home-panel">
          <form class="home-form" id="home-form" novalidate>
            <div class="home-url-row">
              <input
                type="url"
                name="yamlUrl"
                class="home-input"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder="Paste a OpenCollection YAML URL or public Postman collection URL"
              />
              <button type="submit" class="btn btn-primary home-submit">View docs</button>
            </div>

            <div class="home-or" aria-hidden="true"><span>or</span></div>

            <label class="home-dropzone">
              <input
                type="file"
                id="home-file-input"
                class="home-file-input"
                accept=".yml,.yaml,application/x-yaml,text/yaml,text/x-yaml"
              />
              <svg class="home-dropzone-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M12 17v-6" />
                <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
              </svg>
              <span class="home-dropzone-text">
                <span class="home-dropzone-title">Choose YAML file</span>
                <span class="home-dropzone-hint">opencollection.yml · up to 10 MB</span>
              </span>
            </label>

            <p class="home-privacy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Files stay in your browser — nothing is uploaded to Bruno.
            </p>

            <p class="home-error" id="home-error" hidden></p>
          </form>
        </section>

        ${renderHistory(pathname)}
      </div>
    </div>
  `;

  const form = container.querySelector('#home-form') as HTMLFormElement;
  const urlInput = container.querySelector('input[name="yamlUrl"]') as HTMLInputElement;
  const errorEl = container.querySelector('#home-error') as HTMLElement;
  const fileInput = container.querySelector('#home-file-input') as HTMLInputElement;
  const historyEl = container.querySelector('#home-history');

  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  // Start clean so a previously-typed URL never lingers on re-render.
  urlInput.value = '';

  historyEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const actionEl = target.closest('[data-action]') as HTMLElement | null;
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    if (action === 'clear-all') {
      clearRecentLinks();
      clearLocalUploads();
      renderHomePage(container, handlers);
      return;
    }
    if (action === 'remove-link') {
      const linkId = actionEl.dataset.linkId;
      if (linkId) removeRecentLink(linkId);
      renderHomePage(container, handlers);
      return;
    }
    if (action === 'remove-upload') {
      const slot = Number.parseInt(actionEl.dataset.slot || '', 10);
      if (Number.isInteger(slot)) removeLocalUpload(slot);
      renderHomePage(container, handlers);
    }
  });

  const navigateToItem = (target: HTMLElement) => {
    const itemEl = target.closest('.home-recent-item') as HTMLElement | null;
    const href = itemEl?.dataset.href;
    if (href) window.location.assign(href);
  };

  historyEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action]')) return;
    navigateToItem(target);
  });

  historyEl?.addEventListener('keydown', (event) => {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (!target.classList.contains('home-recent-item')) return;
    event.preventDefault();
    navigateToItem(target);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const yamlInput = String(data.get('yamlUrl') || '').trim();

    if (isPostmanCollectionUrl(yamlInput)) {
      errorEl.hidden = true;
      openPostmanEnvModal({ collectionUrl: yamlInput, pathname });
      return;
    }

    if (isPostmanUrl(yamlInput)) {
      errorEl.textContent = 'That is a Postman link but not a collection. Paste a Postman collection URL.';
      errorEl.hidden = false;
      return;
    }

    const gistUrl = normalizeYamlDocumentUrl(yamlInput);
    if (!gistUrl) {
      errorEl.textContent = 'Enter a valid HTTPS URL to your OpenCollection YAML file.';
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    handlers.onUrlSubmit({ gistUrl, gitUrl: '' });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (!/\.ya?ml$/i.test(file.name)) {
      errorEl.textContent = 'Choose a .yml or .yaml file.';
      errorEl.hidden = false;
      fileInput.value = '';
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      errorEl.textContent = 'File is too large (max 10 MB).';
      errorEl.hidden = false;
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const yaml = String(reader.result || '').trim();
      if (!yaml) {
        errorEl.textContent = 'The file is empty.';
        errorEl.hidden = false;
        fileInput.value = '';
        return;
      }

      errorEl.hidden = true;
      try {
        const { slot, evicted } = saveLocalUpload(yaml, file.name);
        if (evicted) setUploadFlash('evicted');
        window.location.assign(
          buildLocalUploadUrl(slot, {
            pathname,
            hash: window.location.hash
          })
        );
      } catch (err) {
        errorEl.textContent =
          err instanceof Error ? err.message : 'Could not save the file in this browser.';
        errorEl.hidden = false;
        fileInput.value = '';
      }
    };
    reader.onerror = () => {
      errorEl.textContent = 'Could not read the file.';
      errorEl.hidden = false;
      fileInput.value = '';
    };
    reader.readAsText(file);
  });
};
