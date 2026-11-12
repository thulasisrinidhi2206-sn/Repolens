/* RepoLens Live Website Preview UI.
 * Uses a detected deployed demo when available and the existing isolated
 * Docker preview API for repositories that do not publish a demo URL.
 */
(() => {
  const API = 'https://repolens-backend-gkdm.onrender.com';
  const RESULTS_ID = 'analysis-results';
  let mountedFor = null;
  let activePreviewId = null;

  const el = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  };

  function makePanel() {
    const panel = el('section', 'result-panel live-preview-panel');
    panel.id = 'feature-live-preview';
    const heading = el('div', 'result-panel-heading');
    heading.append(
      el('span', 'result-panel-kicker', 'REPOLENS FEATURE'),
      el('h3', '', 'Live Website Preview'),
      el('p', '', 'Open a detected deployed demo or build a temporary preview from the repository source.')
    );
    panel.append(heading);
    return panel;
  }

  function setStatus(panel, message, kind = '') {
    const status = panel.querySelector('.live-preview-status') || el('p', 'live-preview-status');
    status.className = 'live-preview-status' + (kind ? ' is-' + kind : '');
    status.textContent = message;
    if (!status.isConnected) panel.append(status);
  }

  function addOpenLink(panel, url, label) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      const link = el('a', 'button button-small button-quiet', label);
      link.href = parsed.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      panel.append(link);
    } catch { /* Ignore invalid links from repository metadata. */ }
  }

  function mountPreview() {
    const results = document.getElementById(RESULTS_ID);
    const grid = results?.querySelector('.result-feature-grid');
    const insights = grid?.querySelector('#feature-insights');
    if (!results || results.hidden || !grid || !insights) return;
    if (mountedFor === results.querySelector('.analysis-result-heading h3')?.textContent) return;

    grid.querySelector('#feature-live-preview')?.remove();
    const panel = makePanel();
    const demoLink = insights.querySelector('a.result-link');
    const repoLink = results.querySelector('.analysis-result-heading a[href*="github.com"]');
    const repositoryUrl = repoLink?.href;

    if (demoLink?.href) {
      const demoUrl = demoLink.href;
      const demoNote = el('p', 'live-preview-note', 'RepoLens found a published demo URL for this repository. Some websites block embedded previews; use Open demo if the frame stays blank.');
      panel.append(demoNote);
      const frameWrap = el('div', 'live-preview-frame-wrap');
      const frame = el('iframe', 'live-preview-frame');
      frame.src = demoUrl;
      frame.title = 'Detected live website demo';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
      frameWrap.append(frame);
      panel.append(frameWrap);
      addOpenLink(panel, demoUrl, 'Open detected demo ↗');
    } else {
      panel.append(el('p', 'live-preview-note', 'No published demo link was found. RepoLens can try building a supported static HTML or Vite project in its isolated preview environment.'));
    }

    const actions = el('div', 'live-preview-actions');
    const buildButton = el('button', 'button button-primary', 'Build preview from source');
    buildButton.type = 'button';
    const stopButton = el('button', 'button button-quiet', 'Stop preview');
    stopButton.type = 'button';
    stopButton.hidden = true;
    actions.append(buildButton, stopButton);
    panel.append(actions);

    const frameContainer = el('div', 'live-preview-built-frame');
    frameContainer.hidden = true;
    panel.append(frameContainer);

    buildButton.addEventListener('click', async () => {
      if (!repositoryUrl) {
        setStatus(panel, 'The repository URL could not be identified from this analysis.', 'error');
        return;
      }
      buildButton.disabled = true;
      buildButton.textContent = 'Preparing preview…';
      setStatus(panel, 'Checking the repository and preparing an isolated preview. This may take a few minutes.', 'loading');
      try {
        const response = await fetch(API + '/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repositoryUrl })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
          const message = payload.message || payload.error || 'Preview could not be created (HTTP ' + response.status + ').';
          if (response.status === 503 || /docker/i.test(message)) {
            throw new Error('The hosted RepoLens backend does not currently have a Docker runtime. Source-based previews need a Docker-enabled preview host. A published demo, if detected above, can still be opened.');
          }
          throw new Error(message);
        }
        const session = payload.data || payload;
        activePreviewId = session.id || session.previewId;
        const previewUrl = session.previewUrl;
        if (!previewUrl) throw new Error('The preview service did not return a preview URL.');
        const parsedPreview = new URL(previewUrl);
        if (['localhost', '127.0.0.1', '::1'].includes(parsedPreview.hostname)) {
          throw new Error('The preview container started on the backend machine, but its URL is localhost-only and cannot be reached from this hosted website. The preview host needs a secure public proxy URL before it can be embedded here.');
        }
        const frame = el('iframe', 'live-preview-frame');
        frame.src = parsedPreview.href;
        frame.title = 'Built repository website preview';
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer';
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
        frameContainer.replaceChildren(frame);
        frameContainer.hidden = false;
        addOpenLink(panel, parsedPreview.href, 'Open built preview ↗');
        stopButton.hidden = false;
        setStatus(panel, 'Preview is ready. The temporary session will expire automatically.', 'success');
      } catch (error) {
        setStatus(panel, error.message || 'Unable to create preview.', 'error');
      } finally {
        buildButton.disabled = false;
        buildButton.textContent = 'Try again';
      }
    });

    stopButton.addEventListener('click', async () => {
      if (!activePreviewId) return;
      stopButton.disabled = true;
      try {
        await fetch(API + '/api/preview/' + encodeURIComponent(activePreviewId), { method: 'DELETE' });
      } catch { /* TTL cleanup remains enabled if the stop request fails. */ }
      activePreviewId = null;
      frameContainer.replaceChildren();
      frameContainer.hidden = true;
      stopButton.hidden = true;
      stopButton.disabled = false;
      setStatus(panel, 'Preview stopped. Temporary resources were asked to clean up.', 'success');
    });

    grid.append(panel);
    mountedFor = results.querySelector('.analysis-result-heading h3')?.textContent || 'repository';
  }

  const results = document.getElementById(RESULTS_ID);
  if (results) {
    const observer = new MutationObserver(() => {
      if (!results.hidden) mountPreview();
    });
    observer.observe(results, { childList: true, subtree: true });
    if (!results.hidden) mountPreview();
  }
})();
