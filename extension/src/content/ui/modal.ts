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

  closeBtn?.addEventListener('click', closeActiveModal);
  doneBtn?.addEventListener('click', closeActiveModal);
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
          Fetching repository files and inspecting architecture via GitHub REST API.
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
  const projectType = data.projectType || 'Unknown';
  const framework = data.framework || 'Unknown';
  const confidencePercent = Math.round((data.confidence || 0) * 100);
  const files = data.files || [];
  const filePreview = files.slice(0, 8);
  const remainingFiles = files.length - filePreview.length;

  const repoMeta = data.repository;
  const stars = repoMeta?.stars?.toLocaleString() || '0';
  const forks = repoMeta?.forks?.toLocaleString() || '0';
  const language = repoMeta?.language || 'Unknown';

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
          <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
        </div>
        <div class="repolens-type-badge-container">
          <span class="repolens-project-type-badge">${escapeHtml(projectType)}</span>
        </div>
      </div>

      <div class="repolens-analysis-summary-card">
        <div class="repolens-summary-item">
          <span class="repolens-summary-label">Framework</span>
          <span class="repolens-summary-val highlight">${escapeHtml(framework)}</span>
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
          <span class="repolens-summary-label">Stats</span>
          <span class="repolens-summary-val">⭐ ${stars} &nbsp; 🍴 ${forks}</span>
        </div>
      </div>

      <div class="repolens-files-section">
        <div class="repolens-section-title">
          <span>Root Files (${files.length})</span>
        </div>
        <div class="repolens-file-chips">
          ${filePreview.map(f => `<span class="repolens-file-chip">${escapeHtml(f)}</span>`).join('')}
          ${remainingFiles > 0 ? `<span class="repolens-file-chip more">+${remainingFiles} more</span>` : ''}
        </div>
      </div>

      <div class="repolens-info-callout">
        <span class="repolens-info-icon">🚀</span>
        <p class="repolens-info-text">
          Repository structure classified. Ready for containerized preview and evaluation pipeline.
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
