/**
 * RepoLens - Analysis & Preview Modal UI Component
 */

import { AnalyzeRepoData } from '@repolens/shared';
import { RepoInfo } from '../types';

let activeOverlay: HTMLElement | null = null;

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
  const dialog = document.getElementById('repolens-modal-dialog');
  if (!dialog) return;

  dialog.innerHTML = getSuccessStateHtml(repo, data);

  const closeBtn = dialog.querySelector('#repolens-modal-close-btn');
  const doneBtn = dialog.querySelector('#repolens-modal-done-btn');
  const openDemoBtn = dialog.querySelector<HTMLAnchorElement>('#repolens-open-demo-btn');

  closeBtn?.addEventListener('click', closeActiveModal);
  doneBtn?.addEventListener('click', closeActiveModal);

  const primaryDemoUrl = data.demo?.primaryDemoUrl;
  if (openDemoBtn && primaryDemoUrl) {
    openDemoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(primaryDemoUrl, '_blank', 'noopener,noreferrer');
    });
  }
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
          Fetching repository files, inspecting architecture, and searching for live demos.
        </p>
      </div>
    </div>

    <div class="repolens-modal-footer">
      <span class="repolens-footer-tag">POST /api/analyze</span>
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

      <!-- Footer Callout -->
      <div class="repolens-info-callout">
        <span class="repolens-info-icon">${hasDemo ? '🚀' : '💡'}</span>
        <p class="repolens-info-text">
          ${hasDemo
            ? `Active live demo identified at <strong>${escapeHtml(primaryDemoUrl || '')}</strong>.`
            : 'No live demo detected. Containerized preview sandbox will be available in upcoming release.'}
        </p>
      </div>
    </div>

    <div class="repolens-modal-footer">
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

/**
 * HTML escaper helper
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
