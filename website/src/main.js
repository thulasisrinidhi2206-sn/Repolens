const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

function closeNavigation() {
  if (!navToggle || !navLinks) return;
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation menu');
  navLinks.classList.remove('is-open');
}

navToggle?.addEventListener('click', () => {
  const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isExpanded));
  navToggle.setAttribute('aria-label', isExpanded ? 'Open navigation menu' : 'Close navigation menu');
  navLinks?.classList.toggle('is-open', !isExpanded);
});

navLinks?.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', closeNavigation));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNavigation(); });

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const command = button.getAttribute('data-copy');
    if (!command) return;
    try { await navigator.clipboard.writeText(command); button.textContent = 'Copied'; }
    catch (error) { console.error('Unable to copy the setup command:', error); button.textContent = 'Copy failed'; }
    window.setTimeout(() => { button.textContent = 'Copy'; }, 1800);
  });
});

const currentYear = document.querySelector('#current-year');
if (currentYear) currentYear.textContent = String(new Date().getFullYear());

const previewForm = document.querySelector('#build-preview-form');
const previewRepositoryInput = document.querySelector('#build-preview-repository');
const previewSubmitButton = document.querySelector('#build-preview-submit');
const previewResult = document.querySelector('#build-preview-result');
const previewStatus = document.querySelector('#build-preview-status');
const previewActions = document.querySelector('#build-preview-actions');
const previewOpenLink = document.querySelector('#build-preview-open');
const previewStopButton = document.querySelector('#build-preview-stop');
const previewFrame = document.querySelector('#build-preview-frame');
const configuredApiBaseUrl = document.querySelector('meta[name="repolens-api-base-url"]')?.content;
const previewApiBaseUrl = (configuredApiBaseUrl || 'http://localhost:3001').replace(/\/+$/, '');
let activePreviewId = null;
let previewProgressTimer = null;

function setPreviewStatus(message, state) {
  if (!previewStatus || !previewResult) return;
  previewResult.hidden = false;
  previewStatus.textContent = message;
  previewStatus.dataset.state = state;
}

function clearPreviewProgress() {
  if (previewProgressTimer !== null) {
    window.clearInterval(previewProgressTimer);
    previewProgressTimer = null;
  }
}

function stopPreview() {
  if (!activePreviewId || !previewStopButton) return;
  const previewId = activePreviewId;
  previewStopButton.disabled = true;
  setPreviewStatus('Stopping the preview and removing its temporary resources…', 'loading');

  fetch(`${previewApiBaseUrl}/api/preview/${encodeURIComponent(previewId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' }
  })
    .then(async response => {
      const payload = await response.json();
      if (!response.ok || payload.success === false || payload.data?.status !== 'stopped') {
        throw new Error(payload.error || `Unable to stop preview (HTTP ${response.status}).`);
      }

      activePreviewId = null;
      clearPreviewProgress();
      if (previewSubmitButton) previewSubmitButton.disabled = false;
      if (previewFrame) {
        previewFrame.removeAttribute('src');
        previewFrame.hidden = true;
      }
      if (previewActions) previewActions.hidden = true;
      setPreviewStatus('Preview stopped. Build another preview whenever you need one.', 'success');
    })
    .catch(error => {
      setPreviewStatus(error instanceof Error ? error.message : 'Unable to stop the preview.', 'error');
    })
    .finally(() => {
      previewStopButton.disabled = false;
    });
}

previewStopButton?.addEventListener('click', stopPreview);

previewForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!previewRepositoryInput || !previewSubmitButton) return;
  if (activePreviewId) {
    setPreviewStatus('Stop the active preview before building another one.', 'error');
    return;
  }

  clearPreviewProgress();
  if (previewFrame) {
    previewFrame.removeAttribute('src');
    previewFrame.hidden = true;
  }
  if (previewActions) previewActions.hidden = true;

  const progressMessages = [
    'Checking the GitHub repository and preview support…',
    'Downloading repository files…',
    'Building the project in an isolated container…',
    'Starting the temporary preview server…'
  ];
  let progressIndex = 0;
  setPreviewStatus(progressMessages[progressIndex], 'loading');
  previewProgressTimer = window.setInterval(() => {
    progressIndex = Math.min(progressIndex + 1, progressMessages.length - 1);
    setPreviewStatus(progressMessages[progressIndex], 'loading');
  }, 8000);
  previewSubmitButton.disabled = true;
  previewSubmitButton.textContent = 'Building…';

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${previewApiBaseUrl}/api/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ repositoryUrl: previewRepositoryInput.value.trim() }),
      signal: controller.signal
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Preview service returned an invalid response (HTTP ${response.status}).`);
    }

    if (!response.ok || payload.success === false || !payload.data) {
      throw new Error(payload.error || `Preview build failed (HTTP ${response.status}).`);
    }

    const previewData = payload.data;
    if (!previewData.id || previewData.status !== 'ready') {
      throw new Error(`Preview service returned status "${previewData.status || 'unknown'}" instead of ready.`);
    }

    const previewUrl = new URL(previewData.previewUrl);
    if (previewUrl.protocol !== 'https:' && previewUrl.hostname !== 'localhost' && previewUrl.hostname !== '127.0.0.1') {
      throw new Error('Preview service did not return a secure HTTPS preview URL.');
    }
    if (previewUrl.origin !== new URL(previewApiBaseUrl).origin) {
      throw new Error('Preview service returned a URL outside the configured RepoLens backend.');
    }

    activePreviewId = previewData.id;
    clearPreviewProgress();
    setPreviewStatus(`Preview is ready for ${previewData.repo.owner}/${previewData.repo.repo}.`, 'success');
    if (previewOpenLink) previewOpenLink.href = previewUrl.href;
    if (previewActions) previewActions.hidden = false;
    if (previewFrame) {
      previewFrame.src = previewUrl.href;
      previewFrame.hidden = false;
    }
  } catch (error) {
    clearPreviewProgress();
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Preview build timed out. Try again with a smaller repository.'
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred while building the preview.';
    setPreviewStatus(message, 'error');
  } finally {
    window.clearTimeout(timeoutId);
    previewSubmitButton.disabled = Boolean(activePreviewId);
    previewSubmitButton.textContent = 'Build Preview';
  }
});

const revealElements = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  document.documentElement.classList.add('has-reveal');
  revealElements.forEach(element => revealObserver.observe(element));
}

// The backend owns GitHub credentials. No secret is exposed in browser code.
const analyzerForm = document.querySelector('#repo-analyzer-form');
const repositoryInput = document.querySelector('#repository-url');
const analyzeButton = document.querySelector('#analyze-button');
const analyzerStatus = document.querySelector('#analyzer-status');
const analysisResults = document.querySelector('#analysis-results');
const REPO_LENS_API = 'https://repolens-backend-gkdm.onrender.com';
const HISTORY_KEY = 'repolens.web.analysis-history.v1';
let activeAnalysis = null;
const askRepositoryForm = document.querySelector('#ask-repository-form');
const askRepositoryInput = document.querySelector('#ask-repository-question');
const askRepositoryButton = document.querySelector('#ask-repository-button');
const askRepositoryStatus = document.querySelector('#ask-repository-status');
const askRepositoryAnswer = document.querySelector('#ask-repository-answer');
let activeQuestionRepositoryUrl = null;

function normalizeGitHubRepositoryUrl(value) {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://github.com/' + trimmed;
  let parsed;
  try { parsed = new URL(candidate); }
  catch { throw new Error('Enter a valid GitHub repository URL, such as https://github.com/facebook/react.'); }
  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('Please use a repository URL from github.com.');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || ['settings', 'marketplace', 'features', 'topics', 'collections'].includes(parts[0].toLowerCase())) {
    throw new Error('Use a repository URL in the format https://github.com/owner/repository.');
  }
  return 'https://github.com/' + parts[0] + '/' + parts[1] + (parts.length > 2 ? '/' + parts.slice(2).join('/') : '');
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined && value !== null && value !== '') element.textContent = String(value);
  return element;
}
function valueOr(value, fallback = 'Not available') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}
function addText(parent, tag, className, value) {
  const element = node(tag, className, valueOr(value));
  parent.appendChild(element);
  return element;
}
function makePanel(id, title, description) {
  const panel = node('section', 'result-panel');
  panel.id = id;
  const header = node('div', 'result-panel-heading');
  header.append(node('span', 'result-panel-kicker', 'REPOLENS FEATURE'));
  header.append(node('h3', '', title));
  if (description) header.append(node('p', '', description));
  panel.append(header);
  return panel;
}
function makeGrid(items) {
  const grid = node('div', 'analysis-metric-grid');
  items.forEach(([label, value]) => {
    const card = node('div', 'analysis-metric');
    addText(card, 'span', '', label);
    addText(card, 'strong', '', value);
    grid.append(card);
  });
  return grid;
}
function makeList(items, renderItem) {
  const list = node('div', 'result-list');
  if (!items || !items.length) {
    list.append(node('p', 'empty-state', 'No findings were reported by this analysis.'));
    return list;
  }
  items.forEach(item => list.append(renderItem(item)));
  return list;
}
function addBadge(parent, text, kind = '') {
  parent.append(node('span', 'result-badge ' + kind, text));
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}
function safeExternalLink(url, label) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const link = node('a', 'result-link', label);
    link.href = parsed.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch { return null; }
}

function getHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveHistory(data) {
  const entry = {
    id: data.id,
    repositoryUrl: data.repositoryUrl,
    repo: data.repo,
    repository: data.repository,
    projectType: data.projectType,
    framework: data.framework,
    receivedAt: data.receivedAt || new Date().toISOString(),
    metrics: data.metrics,
    security: data.security,
    dependencies: data.dependencies,
    architecture: data.architecture,
    codeReview: data.codeReview,
    demo: data.demo,
    details: data.details,
    confidence: data.confidence,
    files: Array.isArray(data.files) ? data.files.slice(0, 120) : [],
    filesAnalyzedCount: data.filesAnalyzedCount,
    filesSkippedCount: data.filesSkippedCount,
    analysisDurationMs: data.analysisDurationMs,
    message: data.message
  };
  try {
    const history = getHistory().filter(item => item.repositoryUrl !== entry.repositoryUrl);
    history.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    renderHistory();
  } catch (error) {
    console.warn('Could not save RepoLens browser history:', error);
  }
}
function renderHistory() {
  let panel = document.querySelector('#web-analysis-history');
  if (!panel) {
    panel = makePanel('web-analysis-history', 'Analysis History', 'Recent analyses saved in this browser on this device.');
    analysisResults.append(panel);
  } else {
    panel.replaceChildren();
    const heading = node('div', 'result-panel-heading');
    heading.append(node('span', 'result-panel-kicker', 'REPOLENS FEATURE'));
    heading.append(node('h3', '', 'Analysis History'));
    heading.append(node('p', '', 'Recent analyses saved in this browser on this device.'));
    panel.append(heading);
  }
  const history = getHistory();
  if (!history.length) {
    panel.append(node('p', 'empty-state', 'Your recent analyses will appear here after you analyze a repository.'));
    return;
  }
  const list = node('div', 'history-list');
  history.forEach(entry => {
    const row = node('div', 'history-row');
    const info = node('div', 'history-info');
    addText(info, 'strong', '', (entry.repo?.owner && entry.repo?.repo) ? entry.repo.owner + '/' + entry.repo.repo : entry.repositoryUrl);
    addText(info, 'span', '', formatDate(entry.receivedAt));
    addText(info, 'small', '', (entry.projectType || 'Unknown project') + ' · ' + (entry.framework || 'Unknown framework') + ' · Score ' + valueOr(entry.metrics?.overallScore, '—'));
    const actions = node('div', 'history-actions');
    const view = node('button', 'button button-small button-quiet', 'View');
    view.type = 'button';
    view.addEventListener('click', () => {
      activeAnalysis = entry;
      renderRepositoryAnalysis(entry, false);
      analysisResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    actions.append(view);
    const link = safeExternalLink(entry.repositoryUrl, 'GitHub ↗');
    if (link) actions.append(link);
    row.append(info, actions);
    list.append(row);
  });
  panel.append(list);
  const clear = node('button', 'button button-small button-quiet history-clear', 'Clear history');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });
  panel.append(clear);
}

function renderCodeReview(data) {
  const report = data.codeReview || {};
  const panel = makePanel('feature-ai-review', 'AI Code Review', report.summary || 'Review of sampled source files.');
  const meta = node('div', 'result-inline-meta');
  addBadge(meta, report.isAiPowered ? 'AI-powered' : 'Static analyzer', report.isAiPowered ? 'badge-success' : 'badge-neutral');
  addText(meta, 'span', '', report.engine || 'Review engine not specified');
  panel.append(meta);
  panel.append(makeList(report.findings || [], finding => {
    const card = node('article', 'finding-card');
    const top = node('div', 'finding-card-top');
    addText(top, 'strong', '', finding.title);
    addBadge(top, finding.severity || 'Info', 'severity-' + String(finding.severity || 'info').toLowerCase());
    card.append(top);
    addText(card, 'p', 'finding-description', finding.explanation);
    addText(card, 'code', 'finding-location', (finding.file || 'Unknown file') + (finding.line ? ':' + finding.line : '') + ' · ' + (finding.category || 'review'));
    if (finding.codeSnippet) addText(card, 'pre', 'finding-code', finding.codeSnippet);
    if (finding.suggestedFix) addText(card, 'pre', 'finding-fix', 'Suggested fix:\n' + finding.suggestedFix);
    return card;
  }));
  return panel;
}

function renderQuality(data) {
  const quality = data.metrics?.qualityScore || {};
  const score = data.metrics?.overallScore ?? quality.overallScore;
  const panel = makePanel('feature-quality', 'Code Quality Scoring', quality.summary || data.metrics?.summary || 'Heuristic quality assessment.');
  panel.append(makeGrid([['Overall score', score == null ? 'Not available' : score + '/100'], ['Grade', quality.grade || '—'], ['Files analyzed', data.filesAnalyzedCount ?? '—']]));
  const categories = quality.categories ? Object.values(quality.categories) : [];
  if (categories.length) {
    const bars = node('div', 'quality-breakdown');
    categories.forEach(category => {
      const row = node('div', 'quality-row');
      const label = node('div', 'quality-row-label');
      addText(label, 'strong', '', category.name);
      addText(label, 'span', '', category.score + '/100 · ' + Math.round((category.weight || 0) * 100) + '% weight');
      const track = node('div', 'quality-track');
      const fill = node('span', 'quality-fill');
      fill.style.width = Math.max(0, Math.min(100, Number(category.score) || 0)) + '%';
      track.append(fill);
      row.append(label, track);
      bars.append(row);
      if (category.deductions?.length) {
        const detail = node('ul', 'compact-list');
        category.deductions.forEach(item => addText(detail, 'li', '', item.reason + ' (−' + item.points + ')'));
        row.append(detail);
      }
    });
    panel.append(bars);
  }
  appendStringList(panel, 'Key strengths', quality.keyStrengths);
  appendStringList(panel, 'Suggested improvements', quality.keyImprovements);
  if (quality.methodology) addText(panel, 'p', 'methodology-note', 'Methodology: ' + quality.methodology);
  return panel;
}
function appendStringList(parent, title, items) {
  if (!Array.isArray(items) || !items.length) return;
  addText(parent, 'h4', 'subsection-title', title);
  const list = node('ul', 'compact-list');
  items.forEach(item => addText(list, 'li', '', item));
  parent.append(list);
}

function renderSecurity(data) {
  const security = data.security || {};
  const panel = makePanel('feature-security', 'Security Scanning', 'Selected secret, configuration and source-pattern checks from sampled repository files.');
  panel.append(makeGrid([['Security score', valueOr(security.score, '—') + (security.score == null ? '' : '/100')], ['Findings', security.findings?.length ?? 0], ['Exposed-secret signals', security.exposedSecretsCount ?? 0]]));
  panel.append(makeList(security.findings || [], finding => {
    const card = node('article', 'finding-card');
    const top = node('div', 'finding-card-top');
    addText(top, 'strong', '', finding.title);
    addBadge(top, finding.severity || 'Info', 'severity-' + String(finding.severity || 'info').toLowerCase());
    card.append(top);
    addText(card, 'p', 'finding-description', finding.description);
    addText(card, 'code', 'finding-location', (finding.file || 'Repository') + (finding.line ? ':' + finding.line : '') + ' · ' + (finding.isConfirmed ? 'Pattern matched' : 'Heuristic warning'));
    addText(card, 'p', 'finding-recommendation', 'Recommendation: ' + valueOr(finding.recommendation));
    return card;
  }));
  return panel;
}

function renderDependencies(data) {
  const deps = data.dependencies || { list: [] };
  const panel = makePanel('feature-dependencies', 'Dependency Analysis', 'Package versions and a small built-in offline advisory list. This is not a live vulnerability database.');
  panel.append(makeGrid([['Total dependencies', deps.totalCount ?? deps.list?.length ?? 0], ['Known advisory matches', deps.vulnerableCount ?? 0], ['Unpinned / deprecated', deps.outdatedCount ?? 0]]));
  panel.append(makeList(deps.list || [], item => {
    const card = node('article', 'dependency-row');
    const info = node('div', 'dependency-info');
    addText(info, 'strong', '', item.name);
    addText(info, 'span', '', valueOr(item.currentVersion) + ' · ' + valueOr(item.type));
    card.append(info);
    const flags = node('div', 'dependency-flags');
    if (item.isVulnerable) addBadge(flags, 'Advisory match', 'badge-danger');
    if (item.isOutdated) addBadge(flags, 'Review version', 'badge-warning');
    if (!item.isVulnerable && !item.isOutdated) addBadge(flags, 'No listed issue', 'badge-neutral');
    card.append(flags);
    if (item.advisories?.length) addText(card, 'p', 'finding-description', item.advisories.join(' · '));
    if (item.recommendation) addText(card, 'p', 'finding-recommendation', item.recommendation);
    return card;
  }));
  return panel;
}

function renderArchitecture(data) {
  const architecture = data.architecture || {};
  const panel = makePanel('feature-architecture', 'Architecture Visualization', 'A connected diagram generated from the repository structure detected by RepoLens.');
  panel.append(makeGrid([['Files in tree', architecture.totalFilesCount ?? '—'], ['Directories', architecture.totalDirectoriesCount ?? '—'], ['Modules', architecture.majorModules?.length ?? 0]]));
  const modules = (architecture.majorModules || []).slice(0, 10);
  const diagram = node('div', 'architecture-diagram-wrap');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const columns = 2;
  const rows = Math.max(1, Math.ceil(modules.length / columns));
  const width = 760;
  const rowHeight = 116;
  const height = 112 + rows * rowHeight + 12;
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Architecture diagram connecting the detected application root to repository modules');
  svg.classList.add('architecture-diagram');

  const makeSvg = (tag, attrs, textValue) => {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (textValue !== undefined) el.textContent = String(textValue);
    return el;
  };
  const rootX = width / 2;
  const rootY = 18;
  const rootW = 260;
  const rootH = 62;
  const rootBottom = rootY + rootH;
  const rootTitle = (data.framework || data.projectType || 'Application') + ' application';

  // Draw connectors first so they remain behind the diagram nodes.
  modules.forEach((module, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardW = 330;
    const cardX = col === 0 ? 35 : width - 35 - cardW;
    const cardY = 126 + row * rowHeight;
    const cardCenter = cardX + cardW / 2;
    const startX = rootX + (cardCenter - rootX) * 0.45;
    const path = makeSvg('path', {
      d: 'M ' + rootX + ' ' + rootBottom + ' C ' + startX + ' ' + (rootBottom + 22) + ', ' + cardCenter + ' ' + (cardY - 24) + ', ' + cardCenter + ' ' + cardY,
      class: 'architecture-edge',
      'marker-end': 'url(#architecture-arrow)'
    });
    svg.append(path);
  });

  const defs = makeSvg('defs', {});
  const marker = makeSvg('marker', { id: 'architecture-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
  marker.append(makeSvg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'architecture-arrow-head' }));
  defs.append(marker);
  svg.prepend(defs);

  svg.append(makeSvg('rect', { x: rootX - rootW / 2, y: rootY, width: rootW, height: rootH, rx: 12, class: 'architecture-root-node' }));
  svg.append(makeSvg('text', { x: rootX, y: rootY + 25, 'text-anchor': 'middle', class: 'architecture-root-title' }, rootTitle));
  svg.append(makeSvg('text', { x: rootX, y: rootY + 44, 'text-anchor': 'middle', class: 'architecture-root-subtitle' }, 'Repository entry point'));

  modules.forEach((module, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardW = 330;
    const cardH = 78;
    const cardX = col === 0 ? 35 : width - 35 - cardW;
    const cardY = 126 + row * rowHeight;
    svg.append(makeSvg('rect', { x: cardX, y: cardY, width: cardW, height: cardH, rx: 9, class: 'architecture-module-node' }));
    svg.append(makeSvg('text', { x: cardX + 16, y: cardY + 24, class: 'architecture-node-title' }, module.name || module.path));
    svg.append(makeSvg('text', { x: cardX + 16, y: cardY + 43, class: 'architecture-node-path' }, module.path));
    svg.append(makeSvg('text', { x: cardX + 16, y: cardY + 62, class: 'architecture-node-meta' }, (module.role || 'Application module') + ' · ' + (module.fileCount ?? 0) + ' files'));
  });

  if (!modules.length) {
    svg.append(makeSvg('text', { x: rootX, y: 145, 'text-anchor': 'middle', class: 'architecture-empty-label' }, 'No directory modules were detected in this repository sample.'));
    svg.setAttribute('viewBox', '0 0 760 190');
  }
  diagram.append(svg);
  const hint = node('p', 'architecture-diagram-hint', 'Each connector links the detected repository root to a module found in its file tree. This is a structural overview, not a runtime dependency trace.');
  diagram.append(hint);
  panel.append(diagram);
  appendStringList(panel, 'Entry points', architecture.entryPoints);
  appendStringList(panel, 'Configuration files', architecture.configFiles);
  return panel;
}

function renderInsights(data) {
  const repo = data.repository || {};
  const panel = makePanel('feature-insights', 'Repository Insights', 'Detected stack, GitHub metadata and likely demo links.');
  panel.append(makeGrid([
    ['Project type', data.projectType],
    ['Framework', data.framework],
    ['Primary language', repo.language || data.details?.mainLanguage],
    ['Default branch', repo.defaultBranch || data.repo?.branch],
    ['Stars', repo.stars],
    ['Forks', repo.forks],
    ['Detection confidence', data.confidence == null ? '—' : Math.round(data.confidence * 100) + '%'],
    ['Analysis duration', data.analysisDurationMs == null ? '—' : (data.analysisDurationMs / 1000).toFixed(1) + ' sec']
  ]));
  if (repo.description) addText(panel, 'p', 'analysis-summary', repo.description);
  if (Array.isArray(repo.topics) && repo.topics.length) {
    const topics = node('div', 'topic-list');
    repo.topics.forEach(topic => addBadge(topics, topic, 'badge-neutral'));
    panel.append(topics);
  }
  if (data.demo?.hasDemo && data.demo.primaryDemoUrl) {
    const demo = safeExternalLink(data.demo.primaryDemoUrl, 'Open detected live demo ↗');
    if (demo) panel.append(demo);
  } else {
    addText(panel, 'p', 'empty-state', 'No live demo link was detected.');
  }
  return panel;
}

function buildMarkdownReport(data) {
  const quality = data.metrics?.qualityScore || {};
  const security = data.security || {};
  const deps = data.dependencies || {};
  const lines = [
    '# RepoLens Analysis Report',
    '',
    '- Repository: ' + (data.repositoryUrl || ''),
    '- Project: ' + valueOr(data.projectType) + ' / ' + valueOr(data.framework),
    '- Branch: ' + valueOr(data.repo?.branch),
    '- Analyzed: ' + formatDate(data.receivedAt),
    '- Quality score: ' + valueOr(data.metrics?.overallScore, '—') + '/100 (' + valueOr(quality.grade, '—') + ')',
    '',
    '## Repository insights',
    valueOr(data.repository?.description, 'No description available.'),
    '',
    '## Quality strengths',
    ...(quality.keyStrengths || []).map(item => '- ' + item),
    '',
    '## Suggested improvements',
    ...(quality.keyImprovements || []).map(item => '- ' + item),
    '',
    '## Security findings',
    ...(security.findings || []).map(item => '- [' + item.severity + '] ' + item.title + ' — ' + item.description + ' Recommendation: ' + item.recommendation),
    '',
    '## Dependencies',
    'Total: ' + valueOr(deps.totalCount, 0) + ' · Advisory matches: ' + valueOr(deps.vulnerableCount, 0) + ' · Version flags: ' + valueOr(deps.outdatedCount, 0),
    ...(deps.list || []).map(item => '- ' + item.name + ' ' + item.currentVersion + (item.isVulnerable ? ' — advisory match' : '') + (item.recommendation ? ' — ' + item.recommendation : '')),
    '',
    '## Code review',
    valueOr(data.codeReview?.summary, 'No code review report returned.'),
    ...(data.codeReview?.findings || []).map(item => '- [' + item.severity + '] ' + item.title + ' (' + item.file + (item.line ? ':' + item.line : '') + '): ' + item.explanation + (item.suggestedFix ? '\n  Suggested fix: ' + item.suggestedFix : '')),
    '',
    '## Architecture',
    ...(data.architecture?.majorModules || []).map(item => '- ' + item.path + ' — ' + item.role + ' (' + item.fileCount + ' files)'),
    '',
    '## Scope and limitations',
    'RepoLens uses bounded file sampling and heuristic checks. Dependency advisories are offline and limited; results are not a professional security audit.'
  ];
  return lines.join('\n');
}
function downloadMarkdown(data) {
  const blob = new Blob([buildMarkdownReport(data)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = node('a');
  link.href = url;
  link.download = ((data.repo?.owner || 'repository') + '-' + (data.repo?.repo || 'analysis') + '-repolens-report.md').replace(/[^a-z0-9._-]/gi, '-');
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function printPdfReport(data) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    analyzerStatus.textContent = 'Your browser blocked the report window. Allow pop-ups for this site and try again.';
    analyzerStatus.className = 'analyzer-status is-error';
    return;
  }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const markdown = buildMarkdownReport(data);
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>RepoLens report</title><style>body{font:14px/1.6 Arial,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#172033}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{button{display:none}body{margin:15mm auto}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>RepoLens Analysis Report</h1><pre>' + escapeHtml(markdown) + '</pre></body></html>';
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
}
function renderReports(data) {
  const panel = makePanel('feature-reports', 'Markdown and PDF Reports', 'Export this analysis for sharing or keeping with your project notes.');
  const actions = node('div', 'report-actions');
  const markdown = node('button', 'button button-primary', 'Download Markdown');
  markdown.type = 'button';
  markdown.addEventListener('click', () => downloadMarkdown(data));
  const pdf = node('button', 'button button-quiet', 'Print / Save as PDF');
  pdf.type = 'button';
  pdf.addEventListener('click', () => printPdfReport(data));
  actions.append(markdown, pdf);
  panel.append(actions);
  addText(panel, 'p', 'methodology-note', 'For PDF: choose “Save as PDF” in your browser print dialog.');
  return panel;
}

function renderRepositoryAnalysis(data, persist = true) {
  activeQuestionRepositoryUrl = data.repositoryUrl || (data.repo?.owner && data.repo?.repo ? 'https://github.com/' + data.repo.owner + '/' + data.repo.repo : null);
  if (askRepositoryButton) askRepositoryButton.disabled = !activeQuestionRepositoryUrl;
  if (askRepositoryStatus) {
    askRepositoryStatus.textContent = activeQuestionRepositoryUrl ? 'Ask a question about ' + (data.repository?.fullName || data.repo?.owner + '/' + data.repo?.repo) + '.' : 'Analyze a repository first to start asking questions.';
    askRepositoryStatus.className = 'ask-repository-status';
  }
  if (askRepositoryAnswer) { askRepositoryAnswer.hidden = true; askRepositoryAnswer.replaceChildren(); }

  activeAnalysis = data;
  analysisResults.replaceChildren();
  analysisResults.hidden = false;

  const heading = node('div', 'analysis-result-heading');
  addText(heading, 'span', 'section-kicker', 'ANALYSIS COMPLETE');
  addText(heading, 'h3', '', data.repo ? data.repo.owner + '/' + data.repo.repo : 'Repository analysis');
  const repoLink = safeExternalLink(data.repositoryUrl, 'View on GitHub ↗');
  if (repoLink) heading.append(repoLink);
  analysisResults.append(heading);
  if (data.message) addText(analysisResults, 'p', 'analysis-summary', data.message);

  const qualityScore = data.metrics?.overallScore;
  analysisResults.append(makeGrid([
    ['Quality score', qualityScore == null ? '—' : qualityScore + '/100'],
    ['Security findings', data.security?.findings?.length ?? 0],
    ['Dependencies', data.dependencies?.totalCount ?? data.dependencies?.list?.length ?? 0],
    ['Files analyzed', data.filesAnalyzedCount ?? '—'],
    ['Project type', data.projectType],
    ['Framework', data.framework]
  ]));

  const featureGrid = node('div', 'result-feature-grid');
  const sections = [
    renderCodeReview(data),
    renderQuality(data),
    renderSecurity(data),
    renderDependencies(data),
    renderArchitecture(data),
    renderInsights(data),
    renderReports(data)
  ];
  sections.forEach(section => {
    featureGrid.append(section);
  });
  analysisResults.append(featureGrid);

  if (Array.isArray(data.files) && data.files.length) {
    const filesPanel = makePanel('analysis-root-files', 'Repository files', 'Root-level files discovered during analysis.');
    const details = node('details', 'analysis-files');
    addText(details, 'summary', '', 'Show ' + data.files.length + ' root entries');
    const list = node('ul', 'compact-list');
    data.files.slice(0, 60).forEach(file => addText(list, 'li', '', file));
    details.append(list);
    filesPanel.append(details);
    analysisResults.append(filesPanel);
  }

  renderHistory();
  if (persist) saveHistory(data);
}

analyzerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  analysisResults.hidden = true;
  analysisResults.replaceChildren();
  let repositoryUrl;
  try {
    repositoryUrl = normalizeGitHubRepositoryUrl(repositoryInput.value);
  } catch (error) {
    analyzerStatus.textContent = error.message;
    analyzerStatus.className = 'analyzer-status is-error';
    repositoryInput.focus();
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing…';
  analyzerStatus.textContent = 'Connecting to RepoLens and inspecting the repository. This can take a little while.';
  analyzerStatus.className = 'analyzer-status is-loading';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(REPO_LENS_API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || payload.error || 'Analysis failed (HTTP ' + response.status + '). Check that the repository is public and try again.');
    }
    const data = payload.data || payload;
    if (!data.repo && !data.repositoryUrl && !data.projectType) {
      throw new Error(payload.message || 'The backend returned an unexpected response. Please try again.');
    }
    renderRepositoryAnalysis(data, true);
    analyzerStatus.textContent = 'Analysis finished successfully. All available feature sections are below.';
    analyzerStatus.className = 'analyzer-status is-success';
    analysisResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    analyzerStatus.textContent = error.name === 'AbortError'
      ? 'The analysis took too long. Please try again in a moment.'
      : error.message || 'Could not reach the RepoLens backend. Please try again.';
    analyzerStatus.className = 'analyzer-status is-error';
  } finally {
    window.clearTimeout(timeout);
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = 'Analyze repository <span aria-hidden="true">→</span>';
  }
});

// Show locally saved analyses on page load. The full report is displayed after selecting one.
if (analysisResults && getHistory().length) {
  analysisResults.hidden = false;
  renderHistory();
}

/* Ask Your Repository — questions are answered by the backend using repository source evidence. */


function renderRepositoryAnswer(result) {
  askRepositoryAnswer.replaceChildren();
  const answer = document.createElement('p');
  answer.className = 'ask-answer-text';
  answer.textContent = result.answer || 'No answer was returned.';
  askRepositoryAnswer.append(answer);
  if (Array.isArray(result.citations) && result.citations.length) {
    const heading = document.createElement('h4');
    heading.textContent = 'Source files';
    askRepositoryAnswer.append(heading);
    const list = document.createElement('ul');
    list.className = 'ask-citation-list';
    result.citations.forEach(citation => {
      if (!citation || typeof citation.path !== 'string' || typeof citation.url !== 'string') return;
      let parsed;
      try { parsed = new URL(citation.url); } catch { return; }
      if (parsed.hostname !== 'github.com' || parsed.protocol !== 'https:') return;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = parsed.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = citation.path + ' · lines ' + citation.startLine + '-' + citation.endLine;
      item.append(link);
      list.append(item);
    });
    askRepositoryAnswer.append(list);
  }
  const meta = document.createElement('p');
  meta.className = 'ask-answer-meta';
  meta.textContent = (result.engine || 'RepoLens') + ' · ' + (result.filesConsulted || 0) + ' files consulted' + (result.isAiPowered ? '' : ' · evidence-only fallback');
  askRepositoryAnswer.append(meta);
  askRepositoryAnswer.hidden = false;
}

askRepositoryForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const question = askRepositoryInput?.value.trim() || '';
  if (!activeQuestionRepositoryUrl) {
    askRepositoryStatus.textContent = 'Analyze a repository first.';
    askRepositoryStatus.className = 'ask-repository-status is-error';
    return;
  }
  if (question.length < 5 || question.length > 500) {
    askRepositoryStatus.textContent = 'Enter a question between 5 and 500 characters.';
    askRepositoryStatus.className = 'ask-repository-status is-error';
    return;
  }
  askRepositoryButton.disabled = true;
  askRepositoryButton.textContent = 'Thinking…';
  askRepositoryStatus.textContent = 'Reading relevant repository files…';
  askRepositoryStatus.className = 'ask-repository-status is-loading';
  askRepositoryAnswer.hidden = true;
  try {
    const response = await fetch(REPO_LENS_API + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryUrl: activeQuestionRepositoryUrl, question })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || payload.message || 'Could not answer this question.');
    renderRepositoryAnswer(payload.data || payload);
    askRepositoryStatus.textContent = 'Answer ready.';
    askRepositoryStatus.className = 'ask-repository-status is-success';
  } catch (error) {
    askRepositoryStatus.textContent = error instanceof Error ? error.message : 'Unable to answer this question.';
    askRepositoryStatus.className = 'ask-repository-status is-error';
  } finally {
    askRepositoryButton.disabled = !activeQuestionRepositoryUrl;
    askRepositoryButton.textContent = 'Ask RepoLens';
  }
});


/* Issue-to-Code Navigator — website client for the existing backend endpoint. */
const issueNavigatorForm = document.querySelector('#website-issue-navigator-form');
const issueRepositoryInput = document.querySelector('#website-issue-repository');
const issueNumberInput = document.querySelector('#website-issue-number');
const issueNavigatorButton = document.querySelector('#website-issue-submit');
const issueNavigatorStatus = document.querySelector('#website-issue-status');
const issueNavigatorOutput = document.querySelector('#website-issue-output');

function renderIssueNavigatorResult(data) {
  issueNavigatorOutput.replaceChildren();
  const heading = node('div', 'issue-result-heading');
  addText(heading, 'span', 'result-panel-kicker', data.repository + ' · #' + data.issue.number);
  addText(heading, 'h4', '', data.issue.title);
  const issueLink = safeExternalLink(data.issue.url, 'Open GitHub issue ↗');
  if (issueLink) heading.append(issueLink);
  issueNavigatorOutput.append(heading);
  addText(issueNavigatorOutput, 'p', 'issue-result-summary', data.summary);
  const meta = node('div', 'result-inline-meta');
  addBadge(meta, data.issue.state || 'unknown');
  addBadge(meta, data.branch || 'default branch');
  addText(meta, 'span', '', (data.filesInspected || 0) + ' files inspected');
  issueNavigatorOutput.append(meta);

  const matchesHeading = node('h4', 'issue-output-heading', 'Likely relevant files');
  issueNavigatorOutput.append(matchesHeading);
  const matches = node('div', 'issue-match-list');
  (Array.isArray(data.matches) ? data.matches : []).forEach(match => {
    const card = node('article', 'issue-match-card');
    const top = node('div', 'issue-match-top');
    const fileLink = safeExternalLink(match.url, match.path);
    if (fileLink) top.append(fileLink); else addText(top, 'strong', '', match.path);
    addBadge(top, 'Relevance ' + match.relevance);
    card.append(top);
    addText(card, 'p', 'issue-match-reason', match.reason);
    if (match.excerpt) addText(card, 'pre', 'issue-match-excerpt', match.excerpt);
    addText(card, 'span', 'issue-match-lines', 'Lines ' + match.startLine + '–' + match.endLine);
    matches.append(card);
  });
  if (!matches.childElementCount) addText(matches, 'p', 'empty-state', 'No candidate files were returned.');
  issueNavigatorOutput.append(matches);

  const steps = node('section', 'issue-investigation-steps');
  addText(steps, 'h4', 'issue-output-heading', 'Suggested investigation steps');
  const list = node('ol', 'compact-list');
  (Array.isArray(data.investigationSteps) ? data.investigationSteps : []).forEach(step => addText(list, 'li', '', step));
  steps.append(list);
  issueNavigatorOutput.append(steps);
  addText(issueNavigatorOutput, 'p', 'issue-result-disclaimer', 'These ranked files are investigation leads, not confirmed root causes. Verify the evidence before changing code.');
  issueNavigatorOutput.hidden = false;
}

issueNavigatorForm?.addEventListener('submit', async event => {
  event.preventDefault();
  let repositoryUrl;
  try {
    repositoryUrl = normalizeGitHubRepositoryUrl(issueRepositoryInput.value);
  } catch (error) {
    issueNavigatorStatus.textContent = error.message;
    issueNavigatorStatus.className = 'issue-navigator-status is-error';
    issueRepositoryInput.focus();
    return;
  }
  const issueNumber = Number(issueNumberInput.value);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    issueNavigatorStatus.textContent = 'Enter a valid positive GitHub issue number.';
    issueNavigatorStatus.className = 'issue-navigator-status is-error';
    issueNumberInput.focus();
    return;
  }

  issueNavigatorButton.disabled = true;
  issueNavigatorButton.textContent = 'Investigating…';
  issueNavigatorStatus.textContent = 'Fetching the issue and ranking relevant source files. This may take a little while.';
  issueNavigatorStatus.className = 'issue-navigator-status is-loading';
  issueNavigatorOutput.hidden = true;
  issueNavigatorOutput.replaceChildren();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(REPO_LENS_API + '/api/issue-navigator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ repositoryUrl, issueNumber }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || payload.message || 'Issue investigation failed (HTTP ' + response.status + ').');
    const data = payload.data || payload;
    if (!data.issue || !Array.isArray(data.matches)) throw new Error('The backend returned an unexpected issue investigation response.');
    renderIssueNavigatorResult(data);
    issueNavigatorStatus.textContent = 'Issue investigation complete.';
    issueNavigatorStatus.className = 'issue-navigator-status is-success';
    issueNavigatorOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    issueNavigatorStatus.textContent = error instanceof Error && error.name === 'AbortError'
      ? 'The investigation timed out. Try again with a smaller repository.'
      : error instanceof Error ? error.message : 'Unable to investigate this issue right now.';
    issueNavigatorStatus.className = 'issue-navigator-status is-error';
  } finally {
    window.clearTimeout(timeout);
    issueNavigatorButton.disabled = false;
    issueNavigatorButton.innerHTML = 'Find relevant code <span aria-hidden="true">→</span>';
  }
});
