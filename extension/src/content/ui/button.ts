/**
 * RepoLens - Preview Project Button Component
 */

import { RepoInfo, PreviewButtonOptions } from '../types';

/**
 * Creates the "Preview Project" DOM button element styled for GitHub
 */
export function createPreviewButton(
  repo: RepoInfo,
  options: PreviewButtonOptions
): HTMLElement {
  // Container wrapper (list item if injected into GitHub's action list)
  const wrapper = document.createElement('li');
  wrapper.className = 'repolens-btn-wrapper';
  wrapper.setAttribute('data-repolens-container', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'repolens-preview-btn';
  button.className = `btn btn-sm repolens-preview-btn ${options.className || ''}`;
  button.setAttribute('aria-label', `Preview ${repo.fullRepo} with RepoLens`);
  button.title = `Preview ${repo.fullRepo} with RepoLens`;

  // SVG Icon (Magnifying Glass / Preview Lens)
  const iconSvg = `
    <svg class="repolens-btn-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path>
      <circle cx="7" cy="7" r="2" fill="currentColor" opacity="0.6"/>
    </svg>
  `;

  button.innerHTML = `
    <span class="repolens-btn-content">
      ${iconSvg}
      <span class="repolens-btn-text">Preview Project</span>
      <span class="repolens-btn-badge">RepoLens</span>
    </span>
  `;

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onPreviewClick(repo);
  });

  wrapper.appendChild(button);
  return wrapper;
}
