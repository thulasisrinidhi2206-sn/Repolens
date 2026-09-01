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
          Communicating with RepoLens backend to initialize project evaluation.
        </p>
      </div>
    </div>

    <div class="repolens-modal-footer">
      <span class="repolens-footer-tag">Connecting to POST /api/analyze</span>
    </div>
  `;
}

/**
 * Generates HTML for the Success state
 */
function getSuccessStateHtml(repo: RepoInfo, data: AnalyzeRepoData): string {
  return `
    <div class="repolens-modal-header">
      <div class="repolens-modal-title-wrap">
        <span class="repolens-modal-logo">🔍</span>
        <h2 id="repolens-modal-title" class="repolens-modal-title">RepoLens Analysis</h2>
      </div>
      <button type="button" class="repolens-modal-close" aria-label="Close dialog" id="repolens-modal-close-btn">&times;</button>
    </div>

    <div class="repolens-modal-body">
      <div class="repolens-repo-pill success">
        <span class="repolens-repo-pill-icon">✓</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
        <span class="repolens-status-badge">${escapeHtml(data.status.toUpperCase())}</span>
      </div>

      <div class="repolens-success-card">
        <div class="repolens-data-row">
          <span class="repolens-data-label">Session ID</span>
          <code class="repolens-data-code">${escapeHtml(data.id)}</code>
        </div>
        <div class="repolens-data-row">
          <span class="repolens-data-label">Repository</span>
          <span class="repolens-data-value">${escapeHtml(data.repo.owner)} / ${escapeHtml(data.repo.repo)}</span>
        </div>
        <div class="repolens-data-row">
          <span class="repolens-data-label">Backend Message</span>
          <span class="repolens-data-value highlighted">${escapeHtml(data.message)}</span>
        </div>
        <div class="repolens-data-row">
          <span class="repolens-data-label">Received At</span>
          <span class="repolens-data-value">${new Date(data.receivedAt).toLocaleTimeString()}</span>
        </div>
      </div>

      <div class="repolens-info-callout">
        <span class="repolens-info-icon">ℹ️</span>
        <p class="repolens-info-text">
          Analysis session initialized successfully. Preview generation and AI evaluation will run in upcoming phases.
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
        <h3 class="repolens-error-heading">Analysis Request Failed</h3>
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
