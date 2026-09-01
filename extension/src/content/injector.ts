/**
 * RepoLens - GitHub DOM Injector Module
 */

import { RepoInfo } from './types';
import { createPreviewButton } from './ui/button';
import { showComingSoonModal } from './ui/modal';

const INJECTION_CONTAINER_ATTR = 'data-repolens-container';
const BUTTON_ID = 'repolens-preview-btn';

/**
 * Potential target selectors for button injection on GitHub repository pages
 * Ordered by preference
 */
const TARGET_SELECTORS = [
  // 1. Primary repository header action list (next to Watch / Fork / Star)
  '#repository-container-header ul.pagehead-actions',
  '#repository-container-header ul',
  'ul.pagehead-actions',
  '[data-turbo-replace="repository-container-header"] ul',

  // 2. Repository header action flex container
  '#repository-container-header .d-flex.gap-2',
  '#repository-container-header .d-flex.flex-wrap',

  // 3. File navigation action bar (near the green "Code" button on repo home)
  '.file-navigation',
  '#repo-content-pjax-container .file-navigation'
];

/**
 * Injects the "Preview Project" button into the GitHub DOM
 */
export function injectPreviewButton(repo: RepoInfo): boolean {
  // 1. Check if button is already injected and attached
  const existingBtn = document.getElementById(BUTTON_ID);
  if (existingBtn) {
    // Already in place
    return true;
  }

  // 2. Remove any orphaned containers if present
  removeInjectedElements();

  // 3. Find the best injection target
  let targetContainer: Element | null = null;

  for (const selector of TARGET_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      targetContainer = el;
      break;
    }
  }

  // 4. Create the button element
  const buttonElement = createPreviewButton(repo, {
    onPreviewClick: (targetRepo) => {
      console.log(`[RepoLens] Preview button clicked for: ${targetRepo.fullRepo}`);
      showComingSoonModal(targetRepo);
    }
  });

  // 5. Append or prepend depending on container type
  if (targetContainer) {
    requestAnimationFrame(() => {
      if (targetContainer.tagName.toLowerCase() === 'ul') {
        // Append as list item in pagehead actions
        targetContainer.appendChild(buttonElement);
      } else {
        // Prepend or insert before first action child
        targetContainer.insertBefore(buttonElement, targetContainer.firstChild);
      }
      console.log(`[RepoLens] Injected Preview button into:`, targetContainer);
    });
    return true;
  }

  // 6. Fallback: Inject as a floating bottom-right action badge
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
