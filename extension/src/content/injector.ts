/**
 * RepoLens - GitHub DOM Injector & Flow Coordinator
 */

import { apiClient } from '../services/api';
import { RepoInfo } from './types';
import { createPreviewButton } from './ui/button';
import {
  showAnalysisModal,
  updateModalToSuccess,
  updateModalToError
} from './ui/modal';

const INJECTION_CONTAINER_ATTR = 'data-repolens-container';
const BUTTON_ID = 'repolens-preview-btn';

/**
 * Potential target selectors for button injection on GitHub repository pages
 */
const TARGET_SELECTORS = [
  '#repository-container-header ul.pagehead-actions',
  '#repository-container-header ul',
  'ul.pagehead-actions',
  '[data-turbo-replace="repository-container-header"] ul',
  '#repository-container-header .d-flex.gap-2',
  '#repository-container-header .d-flex.flex-wrap',
  '.file-navigation',
  '#repo-content-pjax-container .file-navigation'
];

/**
 * Handles the complete Preview / Analyze user click flow
 */
export async function handlePreviewProjectClick(repo: RepoInfo): Promise<void> {
  console.log(`[RepoLens] Initiating analysis for ${repo.fullRepo} (${repo.url})`);

  // 1. Show modal in loading state
  showAnalysisModal(repo);

  // 2. Define reusable execution logic for retry support
  const executeAnalysis = async () => {
    try {
      const response = await apiClient.analyzeRepository(repo.url);

      if (response.success && response.data) {
        console.log('[RepoLens] Analysis response received:', response.data);
        updateModalToSuccess(repo, response.data);
      } else {
        throw new Error(response.error || 'Failed to analyze repository');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during analysis';
      console.error('[RepoLens] Analysis error:', errorMessage);
      updateModalToError(repo, errorMessage, () => {
        executeAnalysis();
      });
    }
  };

  // 3. Kick off the request
  await executeAnalysis();
}

/**
 * Injects the "Preview Project" button into the GitHub DOM
 */
export function injectPreviewButton(repo: RepoInfo): boolean {
  const existingBtn = document.getElementById(BUTTON_ID);
  if (existingBtn) {
    return true;
  }

  removeInjectedElements();

  let targetContainer: Element | null = null;
  for (const selector of TARGET_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      targetContainer = el;
      break;
    }
  }

  const buttonElement = createPreviewButton(repo, {
    onPreviewClick: (targetRepo) => {
      handlePreviewProjectClick(targetRepo);
    }
  });

  if (targetContainer) {
    requestAnimationFrame(() => {
      if (targetContainer.tagName.toLowerCase() === 'ul') {
        targetContainer.appendChild(buttonElement);
      } else {
        targetContainer.insertBefore(buttonElement, targetContainer.firstChild);
      }
      console.log('[RepoLens] Injected Preview button into:', targetContainer);
    });
    return true;
  }

  injectFloatingFallback(repo, buttonElement);
  return true;
}

/**
 * Fallback injection if GitHub's header elements are unavailable
 */
function injectFloatingFallback(repo: RepoInfo, buttonWrapper: HTMLElement): void {
  const existingFallback = document.getElementById('repolens-floating-container');
  if (existingFallback) return;

  const floatingContainer = document.createElement('div');
  floatingContainer.id = 'repolens-floating-container';
  floatingContainer.setAttribute(INJECTION_CONTAINER_ATTR, 'true');
  floatingContainer.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    border-radius: 8px;
  `;

  floatingContainer.appendChild(buttonWrapper);
  requestAnimationFrame(() => {
    document.body.appendChild(floatingContainer);
    console.log(`[RepoLens] Injected Preview button (floating fallback) for: ${repo.fullRepo}`);
  });
}

/**
 * Cleans up any injected RepoLens elements from the DOM
 */
export function removeInjectedElements(): void {
  const containers = document.querySelectorAll(`[${INJECTION_CONTAINER_ATTR}="true"]`);
  containers.forEach(el => el.remove());

  const button = document.getElementById(BUTTON_ID);
  if (button) {
    button.closest(`[${INJECTION_CONTAINER_ATTR}="true"]`)?.remove() || button.remove();
  }
}
