/**
 * RepoLens - Extension Action Popup Script
 */

import { parseGitHubRepoUrl } from '../content/detector';
import { apiClient } from '../services/api';
import { CONFIG } from '../config';

const repoNameEl = document.getElementById('repo-name') as HTMLParagraphElement;
const backendStatusEl = document.getElementById('backend-status') as HTMLParagraphElement;
const statusIndicatorEl = document.getElementById('status-indicator') as HTMLSpanElement;

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

async function checkBackendHealth(): Promise<void> {
  if (!backendStatusEl) return;

  try {
    backendStatusEl.textContent = `Connecting to ${CONFIG.API_BASE_URL}...`;
    const health = await apiClient.checkHealth();
    backendStatusEl.textContent = `Connected (${health.status})`;
    backendStatusEl.style.color = '#3fb950';
    if (statusIndicatorEl) {
      statusIndicatorEl.className = 'status-indicator active';
    }
  } catch (_err) {
    backendStatusEl.textContent = `Offline (${CONFIG.API_BASE_URL})`;
    backendStatusEl.style.color = '#f85149';
    if (statusIndicatorEl) {
      statusIndicatorEl.className = 'status-indicator offline';
    }
  }
}

// Initial checks
checkActiveTab();
checkBackendHealth();
