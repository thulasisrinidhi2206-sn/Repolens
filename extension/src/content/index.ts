/**
 * RepoLens - GitHub Content Script Entrypoint
 */

import { parseGitHubRepoUrl, isGitHubHost } from './detector';
import { injectPreviewButton, removeInjectedElements } from './injector';
import { RepoInfo } from './types';

let currentRepo: RepoInfo | null = null;
let observer: MutationObserver | null = null;
let mutationTimeout: number | null = null;

/**
 * Main lifecycle handler: evaluates current page URL and injects/cleans UI
 */
function handlePageEvaluation(): void {
  // 1. Verify we are on GitHub
  if (!isGitHubHost()) {
    return;
  }

  // 2. Detect if the current URL is a GitHub repository page
  const detectedRepo = parseGitHubRepoUrl();

  if (detectedRepo) {
    currentRepo = detectedRepo;
    console.log(`[RepoLens] Detected repository: ${detectedRepo.fullRepo}`);
    injectPreviewButton(detectedRepo);
  } else {
    // Navigated to a non-repo GitHub page (e.g., /settings, /explore)
    if (currentRepo) {
      console.log('[RepoLens] Navigated away from repository page. Cleaning up UI.');
      removeInjectedElements();
      currentRepo = null;
    }
  }
}

/**
 * Throttled handler for DOM mutations to re-inject if GitHub Turbo replaced the DOM
 */
function handleDomMutation(): void {
  if (mutationTimeout !== null) {
    window.clearTimeout(mutationTimeout);
  }

  mutationTimeout = window.setTimeout(() => {
    const detectedRepo = parseGitHubRepoUrl();
    if (detectedRepo) {
      const existingBtn = document.getElementById('repolens-preview-btn');
      if (!existingBtn) {
        injectPreviewButton(detectedRepo);
      }
    }
  }, 250);
}

/**
 * Initializes the content script
 */
function init(): void {
  console.log('[RepoLens] Content script initialized.');

  // Initial page evaluation
  handlePageEvaluation();

  // Listen for GitHub SPA / Turbo / PJAX navigation events
  window.addEventListener('turbo:load', handlePageEvaluation);
  window.addEventListener('turbo:render', handlePageEvaluation);
  window.addEventListener('pjax:end', handlePageEvaluation);
  window.addEventListener('popstate', handlePageEvaluation);

  // Fallback observer for dynamic client-side DOM replacement
  if (!observer && document.body) {
    observer = new MutationObserver(handleDomMutation);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Start when document is ready in browser environment
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
