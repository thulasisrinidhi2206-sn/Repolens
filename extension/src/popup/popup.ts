/**
 * RepoLens - Extension Action Popup Script
 */

import { parseGitHubRepoUrl } from '../content/detector';

const repoNameEl = document.getElementById('repo-name') as HTMLParagraphElement;

async function checkActiveTab(): Promise<void> {
  if (!repoNameEl) return;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab || !activeTab.url) {
      repoNameEl.textContent = 'No active tab detected';
      return;
    }

    const repoInfo = parseGitHubRepoUrl(activeTab.url);

    if (repoInfo) {
      repoNameEl.textContent = `📦 ${repoInfo.fullRepo}`;
      repoNameEl.style.color = '#58a6ff';
    } else if (activeTab.url.includes('github.com')) {
      repoNameEl.textContent = 'GitHub page (non-repository)';
      repoNameEl.style.color = '#d29922';
    } else {
      repoNameEl.textContent = 'Not on GitHub';
      repoNameEl.style.color = '#8b949e';
    }
  } catch (err) {
    console.error('[RepoLens Popup] Error checking active tab:', err);
    repoNameEl.textContent = 'Ready';
  }
}

// Initial active tab inspection
checkActiveTab();
