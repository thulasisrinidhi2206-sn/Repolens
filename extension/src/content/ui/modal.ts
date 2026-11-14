/**
 * RepoLens - Analysis & Preview Modal UI Component
 */

import { AnalyzeRepoData, CreatePreviewData } from '@repolens/shared';
import { RepoInfo } from '../types';
import { apiClient } from '../../services/api';
import { downloadMarkdownReport, downloadPdfReport } from '../../services/report';
import { renderDashboardSections } from './dashboard';
import { escapeHtml } from './html';

let activeOverlay: HTMLElement | null = null;
let previewStatusTimeout: number | null = null;
let previewStatusGeneration = 0;

/**
 * Creates and displays the RepoLens Analysis Modal in Loading state
 */
export function showAnalysisModal(repo: RepoInfo, onCancel?: () => void): HTMLElement {
  closeActiveModal();

  const overlay = document.createElement('div');
  overlay.id = 'repolens-modal-overlay';
  overlay.className = 'repolens-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'repolens-modal-title');

  const dialog = document.createElement('div');
  dialog.className = 'repolens-modal-dialog';
  dialog.id = 'repolens-modal-dialog';

  dialog.innerHTML = getLoadingStateHtml(repo);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  document.body.classList.add('repolens-modal-open');

  // Setup close handlers
  setupModalListeners(overlay, dialog, onCancel);

  return overlay;
}

/**
 * Transitions the open modal to the Success state displaying the backend response
 */
export function updateModalToSuccess(repo: RepoInfo, data: AnalyzeRepoData): void {
  stopPreviewStatusPolling();

  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  dialog.innerHTML = getSuccessStateHtml(repo, data);

  const closeBtn = dialog.querySelector('#repolens-modal-close-btn');
  const doneBtn = dialog.querySelector('#repolens-modal-done-btn');
  const openDemoBtn = dialog.querySelector<HTMLAnchorElement>('#repolens-open-demo-btn');
  const launchPreviewBtn = dialog.querySelector('#repolens-modal-launch-preview-btn');
  const exportMdBtn = dialog.querySelector('#repolens-export-md-btn');
  const exportPdfBtn = dialog.querySelector('#repolens-export-pdf-btn');

  closeBtn?.addEventListener('click', closeActiveModal);
  doneBtn?.addEventListener('click', closeActiveModal);
  exportMdBtn?.addEventListener('click', () => downloadMarkdownReport(data));
  exportPdfBtn?.addEventListener('click', () => downloadPdfReport(data));

  const primaryDemoUrl = data.demo?.primaryDemoUrl;
  if (openDemoBtn && primaryDemoUrl) {
    openDemoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(primaryDemoUrl, '_blank', 'noopener,noreferrer');
    });
  }

  const askForm = dialog.querySelector<HTMLFormElement>('#repolens-ask-repository-form');
  const askInput = dialog.querySelector<HTMLTextAreaElement>('#repolens-ask-repository-question');
  const askButton = dialog.querySelector<HTMLButtonElement>('#repolens-ask-repository-submit');
  const askStatus = dialog.querySelector<HTMLElement>('#repolens-ask-repository-status');
  const askAnswer = dialog.querySelector<HTMLElement>('#repolens-ask-repository-answer');
  askForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = askInput?.value.trim() || '';
    if (!question || !askButton || !askStatus || !askAnswer) return;
    askButton.disabled = true;
    askButton.textContent = 'Thinking…';
    askStatus.textContent = 'Reading relevant repository files…';
    askAnswer.replaceChildren();
    try {
      const response = await apiClient.askRepository(repo.url, question);
      const result = response.data;
      if (!result) throw new Error(response.error || 'No answer was returned.');
      askAnswer.textContent = result.answer;
      const citations = document.createElement('div');
      citations.className = 'repolens-ask-citations';
      result.citations.forEach((citation) => {
        const link = document.createElement('a');
        link.href = citation.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${citation.path} · lines ${citation.startLine}-${citation.endLine}`;
        citations.appendChild(link);
      });
      askAnswer.appendChild(citations);
      askStatus.textContent = `${result.engine} · ${result.filesConsulted} files consulted${result.isAiPowered ? '' : ' · evidence-only fallback'}`;
    } catch (error) {
      askStatus.textContent = error instanceof Error ? error.message : 'Unable to answer this question.';
    } finally {
      askButton.disabled = false;
      askButton.textContent = 'Ask RepoLens';
    }
  });

  // Handle "Launch Sandbox Preview" button click
  // Handle source preview creation
  if (launchPreviewBtn) {
    launchPreviewBtn.addEventListener('click', () => {
      startPreviewFlow(repo, data);
    });
  }
}

/**
 * Executes the containerized preview creation workflow
 */
async function startPreviewFlow(repo: RepoInfo, analysisData: AnalyzeRepoData): Promise<void> {
  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  stopPreviewStatusPolling();
  setPreviewBuildButtonVisible(dialog, false);
  renderPreviewPanel(dialog, getPreviewLoadingStateHtml(repo));

  const buildStatus = dialog.querySelector<HTMLElement>('#repolens-preview-build-status');
  const buildStages = [
    'Checking repository eligibility…',
    'Downloading repository files…',
    'Building in an isolated container…',
    'Starting the temporary preview server…',
  ];
  let buildStage = 0;
  const buildProgressInterval = window.setInterval(() => {
    if (!dialog.isConnected || !buildStatus) return;
    buildStage = Math.min(buildStage + 1, buildStages.length - 1);
    buildStatus.textContent = buildStages[buildStage];
  }, 8000);

  try {
    const previewRes = await apiClient.createPreview(repo.url);

    if (previewRes.success && previewRes.data) {
      if (!previewRes.data.id) {
        throw new Error('Preview service did not return a preview session ID.');
      }
      if (previewRes.data.status !== 'ready') {
        throw new Error(`Preview service returned status '${previewRes.data.status}' instead of ready.`);
      }

      const backendOrigin = new URL(await apiClient.getBaseUrl()).origin;
      const previewUrl = getSafePreviewUrl(previewRes.data.previewUrl);
      if (!previewUrl) {
        throw new Error('Preview service did not return a valid preview URL.');
      }
      if (new URL(previewUrl).origin !== backendOrigin) {
        throw new Error('Preview service returned a URL outside the configured RepoLens backend.');
      }

      updateModalToPreviewReady(repo, { ...previewRes.data, previewUrl }, analysisData);
    } else {
      throw new Error(previewRes.error || 'Failed to create visual preview container');
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown preview error';
    updateModalToPreviewError(repo, errMsg, analysisData);
  } finally {
    window.clearInterval(buildProgressInterval);
  }
}

/**
 * Transitions modal to Preview Ready state
 */
function updateModalToPreviewReady(
  repo: RepoInfo,
  previewData: CreatePreviewData,
  analysisData: AnalyzeRepoData
): void {
  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  renderPreviewPanel(dialog, getPreviewReadyStateHtml(repo, previewData));

  const stopBtn = dialog.querySelector<HTMLButtonElement>('#repolens-modal-stop-preview-btn');
  stopBtn?.addEventListener('click', () => {
    stopPreviewFlow(repo, previewData, analysisData);
  });
  monitorPreviewSession(repo, previewData, analysisData, dialog);
}

/**
 * Transitions modal to Preview Error state
 */
function updateModalToPreviewError(
  repo: RepoInfo,
  errorMessage: string,
  analysisData: AnalyzeRepoData,
  ended = false
): void {
  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  stopPreviewStatusPolling();
  setPreviewBuildButtonVisible(dialog, false);
  renderPreviewPanel(dialog, getPreviewErrorStateHtml(repo, errorMessage, ended));

  const retryBtn = dialog.querySelector('#repolens-modal-retry-btn');

  retryBtn?.addEventListener('click', () => {
    startPreviewFlow(repo, analysisData);
  });
}

async function stopPreviewFlow(
  repo: RepoInfo,
  previewData: CreatePreviewData,
  analysisData: AnalyzeRepoData
): Promise<void> {
  const dialog = document.getElementById('repolens-modal-dialog');
  const stopBtn = dialog?.querySelector<HTMLButtonElement>('#repolens-modal-stop-preview-btn');
  const status = dialog?.querySelector<HTMLElement>('#repolens-preview-status');
  if (!dialog || !stopBtn) return;

  stopPreviewStatusPolling();
  stopBtn.disabled = true;
  if (status) status.textContent = 'Stopping preview...';

  try {
    const response = await apiClient.stopPreview(previewData.id);
    if (!response.data || response.data.status !== 'stopped') {
      throw new Error(response.error || 'Backend did not confirm that the preview stopped.');
    }
    updateModalToPreviewError(repo, 'Preview stopped. Build a new preview whenever you need one.', analysisData, true);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error while stopping preview.';
    if (isExpiredPreviewError(message)) {
      updateModalToPreviewError(repo, 'This preview session has expired or is no longer available.', analysisData, true);
      return;
    }

    if (status) status.textContent = `Unable to stop preview: ${message}`;
    stopBtn.disabled = false;
    monitorPreviewSession(repo, previewData, analysisData, dialog);
  }
}

function monitorPreviewSession(
  repo: RepoInfo,
  previewData: CreatePreviewData,
  analysisData: AnalyzeRepoData,
  dialog: HTMLElement
): void {
  stopPreviewStatusPolling();
  const generation = previewStatusGeneration;
  const expiryTime = previewData.expiresAt ? Date.parse(previewData.expiresAt) : Number.NaN;

  const checkStatus = async (): Promise<void> => {
    if (generation !== previewStatusGeneration || !dialog.isConnected) return;

    if (Number.isFinite(expiryTime) && Date.now() >= expiryTime) {
      updateModalToPreviewError(repo, 'This preview session has expired. Build a new preview to continue.', analysisData, true);
      return;
    }

    try {
      const response = await apiClient.getPreview(previewData.id);
      if (generation !== previewStatusGeneration) return;
      if (!response.data) throw new Error(response.error || 'Backend returned no preview status.');

      if (response.data.status === 'stopped' || response.data.status === 'failed') {
        updateModalToPreviewError(repo, 'This preview session has expired or is no longer running. Build a new preview to continue.', analysisData, true);
        return;
      }

      const status = dialog.querySelector<HTMLElement>('#repolens-preview-status');
      if (status) status.textContent = 'Preview is running.';
    } catch (err: unknown) {
      if (generation !== previewStatusGeneration) return;
      const message = err instanceof Error ? err.message : 'Unknown status check error.';
      if (isExpiredPreviewError(message)) {
        updateModalToPreviewError(repo, 'This preview session has expired or is no longer available. Build a new preview to continue.', analysisData, true);
        return;
      }

      const status = dialog.querySelector<HTMLElement>('#repolens-preview-status');
      if (status) status.textContent = `Could not verify preview status: ${message}`;
    }

    if (generation !== previewStatusGeneration || !dialog.isConnected) return;
    const untilExpiry = Number.isFinite(expiryTime) ? Math.max(1000, expiryTime - Date.now()) : 15000;
    previewStatusTimeout = window.setTimeout(checkStatus, Math.min(15000, untilExpiry));
  };

  const untilExpiry = Number.isFinite(expiryTime) ? Math.max(1000, expiryTime - Date.now()) : 15000;
  previewStatusTimeout = window.setTimeout(checkStatus, Math.min(15000, untilExpiry));
}

function stopPreviewStatusPolling(): void {
  previewStatusGeneration++;
  if (previewStatusTimeout !== null) {
    window.clearTimeout(previewStatusTimeout);
    previewStatusTimeout = null;
  }
}

function renderPreviewPanel(dialog: HTMLElement, html: string): void {
  const panel = dialog.querySelector<HTMLElement>('#repolens-preview-panel');
  if (!panel) return;
  panel.hidden = false;
  panel.innerHTML = html;
}

function setPreviewBuildButtonVisible(dialog: HTMLElement, visible: boolean): void {
  const buildButton = dialog.querySelector<HTMLButtonElement>('#repolens-modal-launch-preview-btn');
  if (buildButton) buildButton.hidden = !visible;
}

function getSafePreviewUrl(previewUrl?: string): string | null {
  if (!previewUrl) return null;

  try {
    const url = new URL(previewUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function isExpiredPreviewError(message: string): boolean {
  return /preview.*(not found|expired)|not found.*preview|HTTP 404/i.test(message);
}

/**
 * Transitions the open modal to the Error state with retry action
 */
export function updateModalToError(repo: RepoInfo, errorMessage: string, onRetry: () => void): void {
  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  dialog.innerHTML = getErrorStateHtml(repo, errorMessage);

  const closeBtn = dialog.querySelector('#repolens-modal-close-btn');
  const cancelBtn = dialog.querySelector('#repolens-modal-cancel-btn');
  const retryBtn = dialog.querySelector('#repolens-modal-retry-btn');

  closeBtn?.addEventListener('click', closeActiveModal);
  cancelBtn?.addEventListener('click', closeActiveModal);
  retryBtn?.addEventListener('click', () => {
    dialog.innerHTML = getLoadingStateHtml(repo);
    const newCloseBtn = dialog.querySelector('#repolens-modal-close-btn');
    newCloseBtn?.addEventListener('click', closeActiveModal);
    onRetry();
  });
}

/**
 * Closes and removes the active modal
 */
export function closeActiveModal(): void {
  stopPreviewStatusPolling();
  if (activeOverlay && activeOverlay.parentNode) {
    activeOverlay.parentNode.removeChild(activeOverlay);
    activeOverlay = null;
    document.body.classList.remove('repolens-modal-open');
  }
}

/**
 * Generates HTML for the Loading state
 */
function getLoadingStateHtml(repo: RepoInfo): string {
  return `
    <div class="repolens-modal-header">
      <div class="repolens-modal-title-wrap">
        <span class="repolens-modal-logo">🔍</span>
        <h2 id="repolens-modal-title" class="repolens-modal-title">RepoLens Analysis</h2>
      </div>
      <button type="button" class="repolens-modal-close" aria-label="Close dialog" id="repolens-modal-close-btn">&times;</button>
    </div>

    <div class="repolens-modal-body">
      <div class="repolens-repo-pill">
        <span class="repolens-repo-pill-icon">📦</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
      </div>

      <div class="repolens-loading-card">
        <div class="repolens-spinner"></div>
        <h3 class="repolens-loading-heading">Analyzing Repository...</h3>
        <p class="repolens-loading-subtext">
          Fetching repository files, scoring quality, scanning security and dependencies, and searching for live demos.
        </p>
      </div>
    </div>

    <div class="repolens-modal-footer">
      <span class="repolens-footer-tag">POST /api/analyze</span>
    </div>
  `;
}

/**
 * Generates HTML for the Preview Loading state
 */
function getPreviewLoadingStateHtml(repo: RepoInfo): string {
  return `
    <div class="repolens-preview-state">
      <div class="repolens-repo-pill">
        <span class="repolens-repo-pill-icon">📦</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
      </div>
      <div class="repolens-loading-card">
        <div class="repolens-spinner"></div>
        <h3 class="repolens-loading-heading">Building Preview from Source...</h3>
        <p class="repolens-loading-subtext">
          Downloading repository files, checking static/Vite eligibility, and starting the isolated preview.
        </p>
      </div>
      <p class="repolens-preview-status" id="repolens-preview-build-status" role="status" aria-live="polite">${escapeHtml('Checking repository eligibility…')}</p>
    </div>
  `;
}

/**
 * Generates HTML for Preview Ready state
 */
function getPreviewReadyStateHtml(repo: RepoInfo, previewData: CreatePreviewData): string {
  const previewUrl = getSafePreviewUrl(previewData.previewUrl);
  if (!previewUrl) return getPreviewErrorStateHtml(repo, 'Preview service did not return a valid preview URL.');
  const projectType = previewData.projectType || 'Static/Vite';
  const sandboxPermissions = new URL(previewUrl).origin === window.location.origin
    ? 'allow-scripts allow-forms'
    : 'allow-scripts allow-same-origin allow-forms';

  return `
    <div class="repolens-preview-state">
      <div class="repolens-repo-header-row">
        <div class="repolens-repo-pill success">
          <span class="repolens-repo-pill-icon">📦</span>
          <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
        </div>
        <div class="repolens-type-badge-container">
          <span class="repolens-project-type-badge">${escapeHtml(projectType)}</span>
        </div>
      </div>

      <div class="repolens-demo-card detected">
        <div class="repolens-demo-header">
          <div class="repolens-demo-status-wrap">
            <span class="repolens-demo-status-indicator available"></span>
            <span class="repolens-demo-status-text available">Preview Ready</span>
          </div>
          <a href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener noreferrer" class="repolens-demo-open-btn" id="repolens-open-sandbox-preview-btn">
            <span>Open in New Tab</span>
            <span class="repolens-btn-arrow">↗</span>
          </a>
        </div>
        <div class="repolens-demo-url-box">
          <span class="repolens-demo-url-icon">🌐</span>
          <a href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener noreferrer" class="repolens-demo-url-link" title="${escapeHtml(previewUrl)}">
            ${escapeHtml(previewUrl)}
          </a>
        </div>
      </div>

      <div class="repolens-preview-embed">
        <iframe
          class="repolens-preview-iframe"
          src="${escapeHtml(previewUrl)}"
          title="Preview of ${escapeHtml(repo.fullRepo)}"
          sandbox="${sandboxPermissions}"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
      <p class="repolens-preview-status" id="repolens-preview-status" role="status" aria-live="polite">Preview server is running.</p>

      <div class="repolens-info-callout">
        <span class="repolens-info-icon">🔒</span>
        <p class="repolens-info-text">
          This preview runs in an isolated container and automatically expires at ${escapeHtml(previewData.expiresAt || 'its session limit')}.
        </p>
      </div>

      <button type="button" class="repolens-modal-btn-secondary repolens-stop-preview-btn" id="repolens-modal-stop-preview-btn">
        Stop Preview
      </button>
    </div>
  `;
}

/**
 * Generates HTML for Preview Error state
 */
function getPreviewErrorStateHtml(repo: RepoInfo, errorMessage: string, ended = false): string {
  return `
    <div class="repolens-preview-state">
      <div class="repolens-repo-pill error">
        <span class="repolens-repo-pill-icon">⚠️</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
      </div>

      <div class="repolens-error-card">
        <div class="repolens-error-icon">ℹ️</div>
        <h3 class="repolens-error-heading">${ended ? 'Preview Session Ended' : 'Preview Unavailable'}</h3>
        <p class="repolens-error-message">${escapeHtml(errorMessage)}</p>
      </div>
      <button type="button" class="repolens-modal-btn-primary" id="repolens-modal-retry-btn">
        ${ended ? 'Build Preview' : 'Retry Build'}
      </button>
    </div>
  `;
}

/**
 * Generates HTML for the Success state
 */
function getSuccessStateHtml(repo: RepoInfo, data: AnalyzeRepoData): string {
  const repoMeta = data.repository;
  const repoFullName = repoMeta?.fullName || repo.fullRepo;
  const projectType = data.projectType || 'Unknown';
  const framework = data.framework || 'Unknown';
  const confidencePercent = Math.round((data.confidence || 0) * 100);
  const files = data.files || [];
  const filePreview = files.slice(0, 8);
  const remainingFiles = files.length - filePreview.length;

  const stars = repoMeta?.stars?.toLocaleString() || '0';
  const forks = repoMeta?.forks?.toLocaleString() || '0';
  const language = repoMeta?.language || 'Unknown';

  const demoResult = data.demo;
  const hasDemo = Boolean(demoResult?.hasDemo && demoResult?.primaryDemoUrl);
  const primaryDemoUrl = demoResult?.primaryDemoUrl || null;

  return `
    <div class="repolens-modal-header">
      <div class="repolens-modal-title-wrap">
        <span class="repolens-modal-logo">🔍</span>
        <h2 id="repolens-modal-title" class="repolens-modal-title">RepoLens Analysis</h2>
      </div>
      <button type="button" class="repolens-modal-close" aria-label="Close dialog" id="repolens-modal-close-btn">&times;</button>
    </div>

    <div class="repolens-modal-body">
      <div class="repolens-repo-header-row">
        <div class="repolens-repo-pill success">
          <span class="repolens-repo-pill-icon">📦</span>
          <span class="repolens-repo-pill-name">${escapeHtml(repoFullName)}</span>
        </div>
        <div class="repolens-type-badge-container">
          <span class="repolens-project-type-badge">${escapeHtml(projectType)}</span>
        </div>
      </div>

      <!-- Demo Availability Section -->
      ${hasDemo && primaryDemoUrl ? `
      <div class="repolens-demo-card detected">
        <div class="repolens-demo-header">
          <div class="repolens-demo-status-wrap">
            <span class="repolens-demo-status-indicator available"></span>
            <span class="repolens-demo-status-text available">Live Demo Available</span>
          </div>
          <a href="${escapeHtml(primaryDemoUrl)}" target="_blank" rel="noopener noreferrer" class="repolens-demo-open-btn" id="repolens-open-demo-btn">
            <span>Open Live Demo</span>
            <span class="repolens-btn-arrow">↗</span>
          </a>
        </div>
        <div class="repolens-demo-url-box">
          <span class="repolens-demo-url-icon">🌐</span>
          <a href="${escapeHtml(primaryDemoUrl)}" target="_blank" rel="noopener noreferrer" class="repolens-demo-url-link" title="${escapeHtml(primaryDemoUrl)}">
            ${escapeHtml(primaryDemoUrl)}
          </a>
        </div>
      </div>
      ` : `
      <div class="repolens-demo-card not-detected">
        <div class="repolens-demo-header">
          <div class="repolens-demo-status-wrap">
            <span class="repolens-demo-status-indicator not-available"></span>
            <span class="repolens-demo-status-text not-available">No Live Demo Detected</span>
          </div>
        </div>
        <div class="repolens-demo-empty-notice">
          <span>No public demo deployment was found in repository metadata or README.</span>
        </div>
      </div>
      `}

      <!-- Analysis Summary Grid -->
      <div class="repolens-analysis-summary-card">
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Project Type</span>
          <span class="repolens-summary-val highlight">${escapeHtml(projectType)}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Framework</span>
          <span class="repolens-summary-val highlight">${escapeHtml(framework)}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Demo Status</span>
          <span class="repolens-summary-val ${hasDemo ? 'demo-active' : 'demo-inactive'}">
            ${hasDemo ? '● Available' : '○ Not Detected'}
          </span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Confidence</span>
          <span class="repolens-summary-val">${confidencePercent}%</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Language</span>
          <span class="repolens-summary-val">${escapeHtml(language)}</span>
        </div>
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Repository Stats</span>
          <span class="repolens-summary-val">⭐ ${stars} &nbsp; 🍴 ${forks}</span>
        </div>
      </div>

      <!-- Root Files Section -->
      <div class="repolens-files-section">
        <div class="repolens-section-title">
          <span>Root Files (${files.length})</span>
        </div>
        <div class="repolens-file-chips">
          ${filePreview.map(f => `<span class="repolens-file-chip">${escapeHtml(f)}</span>`).join('')}
          ${remainingFiles > 0 ? `<span class="repolens-file-chip more">+${remainingFiles} more</span>` : ''}
        </div>
      </div>

      ${renderDashboardSections(data)}

      <section class="repolens-ask-repository" aria-labelledby="repolens-ask-title">
        <div class="repolens-section-title"><span>Ask Your Repository</span></div>
        <p class="repolens-ask-hint" id="repolens-ask-title">Ask about files, functions, routes, architecture, or setup. Answers include links to source evidence.</p>
        <form id="repolens-ask-repository-form">
          <label class="repolens-ask-label" for="repolens-ask-repository-question">Your question</label>
          <textarea id="repolens-ask-repository-question" rows="2" maxlength="500" minlength="5" placeholder="Where is authentication handled?" required></textarea>
          <button type="submit" class="repolens-modal-btn-primary" id="repolens-ask-repository-submit">Ask RepoLens</button>
        </form>
        <p class="repolens-ask-status" id="repolens-ask-repository-status" role="status" aria-live="polite"></p>
        <div class="repolens-ask-answer" id="repolens-ask-repository-answer"></div>
      </section>

      <!-- Footer Callout -->
      <div class="repolens-info-callout">
        <span class="repolens-info-icon">${hasDemo ? '🚀' : '💡'}</span>
        <p class="repolens-info-text">
          ${hasDemo
            ? `Active live demo identified at <strong>${escapeHtml(primaryDemoUrl || '')}</strong>.`
            : 'No live demo detected. You can launch an isolated Docker sandbox preview below if Docker is running on the backend.'}
        </p>
      </div>

      <section class="repolens-preview-panel" id="repolens-preview-panel" aria-label="Source preview" hidden></section>
    </div>

    <div class="repolens-modal-footer">
      <button type="button" class="repolens-modal-btn-secondary" id="repolens-export-md-btn">
        Export Markdown
      </button>
      <button type="button" class="repolens-modal-btn-secondary" id="repolens-export-pdf-btn">
        Export PDF
      </button>
      <button type="button" class="repolens-modal-btn-secondary" id="repolens-modal-launch-preview-btn">
        Build Preview
      </button>
      <button type="button" class="repolens-modal-btn-primary" id="repolens-modal-done-btn">
        Done
      </button>
    </div>
  `;
}

/**
 * Generates HTML for the Error state
 */
function getErrorStateHtml(repo: RepoInfo, errorMessage: string): string {
  return `
    <div class="repolens-modal-header">
      <div class="repolens-modal-title-wrap">
        <span class="repolens-modal-logo">🔍</span>
        <h2 id="repolens-modal-title" class="repolens-modal-title">RepoLens Analysis</h2>
      </div>
      <button type="button" class="repolens-modal-close" aria-label="Close dialog" id="repolens-modal-close-btn">&times;</button>
    </div>

    <div class="repolens-modal-body">
      <div class="repolens-repo-pill error">
        <span class="repolens-repo-pill-icon">⚠️</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
      </div>

      <div class="repolens-error-card">
        <div class="repolens-error-icon">❌</div>
        <h3 class="repolens-error-heading">Analysis Failed</h3>
        <p class="repolens-error-message">${escapeHtml(errorMessage)}</p>
      </div>
    </div>

    <div class="repolens-modal-footer">
      <button type="button" class="repolens-modal-btn-secondary" id="repolens-modal-cancel-btn">
        Cancel
      </button>
      <button type="button" class="repolens-modal-btn-primary" id="repolens-modal-retry-btn">
        Retry Request
      </button>
    </div>
  `;
}

/**
 * Sets up global overlay listeners (Escape key, backdrop click)
 */
function setupModalListeners(overlay: HTMLElement, dialog: HTMLElement, onCancel?: () => void): void {
  const closeBtn = dialog.querySelector('#repolens-modal-close-btn');

  const handleClose = () => {
    closeActiveModal();
    if (onCancel) onCancel();
  };

  closeBtn?.addEventListener('click', handleClose);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      handleClose();
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}
