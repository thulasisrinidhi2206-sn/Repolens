/**
 * RepoLens - Preview Placeholder Modal Component
 */

import { RepoInfo } from '../types';

let activeModal: HTMLElement | null = null;

/**
 * Displays the "RepoLens preview is coming soon" modal dialog
 */
export function showComingSoonModal(repo: RepoInfo): void {
  // Remove any previously open modal
  closeActiveModal();

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'repolens-modal-overlay';
  overlay.className = 'repolens-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'repolens-modal-title');

  // Modal dialog box
  const dialog = document.createElement('div');
  dialog.className = 'repolens-modal-dialog';

  dialog.innerHTML = `
    <div class="repolens-modal-header">
      <div class="repolens-modal-title-wrap">
        <span class="repolens-modal-logo">🔍</span>
        <h2 id="repolens-modal-title" class="repolens-modal-title">RepoLens Preview</h2>
      </div>
      <button type="button" class="repolens-modal-close" aria-label="Close dialog" id="repolens-modal-close-btn">&times;</button>
    </div>

    <div class="repolens-modal-body">
      <div class="repolens-repo-pill">
        <span class="repolens-repo-pill-icon">📦</span>
        <span class="repolens-repo-pill-name">${escapeHtml(repo.fullRepo)}</span>
      </div>

      <div class="repolens-placeholder-card">
        <div class="repolens-placeholder-icon">🚀</div>
        <h3 class="repolens-placeholder-heading">RepoLens preview is coming soon.</h3>
        <p class="repolens-placeholder-subtext">
          Interactive containerized visual previews and automated project evaluations are currently under active development.
        </p>
      </div>
    </div>

    <div class="repolens-modal-footer">
      <button type="button" class="repolens-modal-btn-primary" id="repolens-modal-action-btn">
        Got it
      </button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  activeModal = overlay;

  // Prevent background scrolling while modal is open
  document.body.classList.add('repolens-modal-open');

  // Setup event listeners
  const closeBtn = dialog.querySelector('#repolens-modal-close-btn');
  const actionBtn = dialog.querySelector('#repolens-modal-action-btn');

  const handleClose = () => {
    closeActiveModal();
  };

  closeBtn?.addEventListener('click', handleClose);
  actionBtn?.addEventListener('click', handleClose);

  // Close on clicking backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      handleClose();
    }
  });

  // Close on Escape key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Closes and removes the active modal from DOM
 */
export function closeActiveModal(): void {
  if (activeModal && activeModal.parentNode) {
    activeModal.parentNode.removeChild(activeModal);
    activeModal = null;
    document.body.classList.remove('repolens-modal-open');
  }
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
