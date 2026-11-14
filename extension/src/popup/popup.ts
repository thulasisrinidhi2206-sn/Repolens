/**
 * RepoLens - Extension Action Popup Script
 */

import { parseGitHubRepoUrl } from '../content/detector';
import { apiClient } from '../services/api';
import { loadAnalysisHistory } from '../services/history';
import { downloadMarkdownReport, downloadPdfReport } from '../services/report';
import { AnalysisHistoryEntry } from '@repolens/shared';
import { CONFIG } from '../config';

const repoNameEl = document.getElementById('repo-name') as HTMLParagraphElement;
const backendStatusEl = document.getElementById('backend-status') as HTMLParagraphElement;
const statusIndicatorEl = document.getElementById('status-indicator') as HTMLSpanElement;
const historyStatusEl = document.getElementById('history-status') as HTMLParagraphElement;
const historyListEl = document.getElementById('history-list') as HTMLDivElement;
const historyRefreshEl = document.getElementById('history-refresh') as HTMLButtonElement;
const apiUrlInput = document.getElementById('api-url-input') as HTMLInputElement | null;
const apiSaveBtn = document.getElementById('api-save-btn') as HTMLButtonElement | null;
const apiResetBtn = document.getElementById('api-reset-btn') as HTMLButtonElement | null;

function renderHistory(entries: AnalysisHistoryEntry[]): void {
  if (!historyListEl || !historyStatusEl) return;

  historyListEl.replaceChildren();
  historyStatusEl.textContent = entries.length
    ? `${entries.length} saved analysis${entries.length === 1 ? '' : 'es'}`
    : 'No saved analyses yet. Analyze a repository on GitHub to add one.';

  for (const entry of entries) {
    const card = document.createElement('article');
    card.className = 'history-entry';

    const title = document.createElement('div');
    title.className = 'history-entry-title';
    title.textContent = `${entry.owner}/${entry.repo}`;

    const meta = document.createElement('p');
    meta.className = 'history-entry-meta';
    const score = typeof entry.overallScore === 'number' ? ` · ${entry.overallScore}/100${entry.grade ? ` (${entry.grade})` : ''}` : '';
    meta.textContent = `${entry.projectType} · ${entry.framework}${score} · ${new Date(entry.analyzedAt).toLocaleDateString()}`;

    card.append(title, meta);

    if (entry.analysis) {
      const details = document.createElement('details');
      details.className = 'history-analysis';
      const detailsSummary = document.createElement('summary');
      detailsSummary.textContent = 'View saved analysis';
      details.append(detailsSummary);

      const analysisSummary = document.createElement('div');
      analysisSummary.className = 'history-analysis-content';
      const quality = entry.analysis.metrics?.qualityScore;
      const reportSummary = document.createElement('p');
      reportSummary.textContent = quality
        ? `Quality: ${quality.overallScore}/100 (${quality.grade}) — ${quality.summary}`
        : 'No quality score was recorded.';
      analysisSummary.append(reportSummary);

      const architecture = entry.analysis.architecture;
      if (architecture) {
        const architectureSummary = document.createElement('p');
        architectureSummary.textContent =
          `Architecture: ${architecture.totalFilesCount} files, ${architecture.totalDirectoriesCount} directories; ` +
          `${architecture.majorModules.length} modules.`;
        analysisSummary.append(architectureSummary);
      }

      const security = entry.analysis.security;
      if (security) {
        const securitySummary = document.createElement('p');
        securitySummary.textContent =
          `Security: ${security.score}/100, ${security.findings.length} finding(s).`;
        analysisSummary.append(securitySummary);
      }

      const dependencies = entry.analysis.dependencies;
      if (dependencies) {
        const dependencySummary = document.createElement('p');
        dependencySummary.textContent =
          `Dependencies: ${dependencies.totalCount} total, ${dependencies.vulnerableCount} flagged vulnerable, ` +
          `${dependencies.outdatedCount} unpinned/deprecated.`;
        analysisSummary.append(dependencySummary);
      }

      if (entry.analysis.codeReview) {
        const reviewSummary = document.createElement('p');
        reviewSummary.textContent = `Code review: ${entry.analysis.codeReview.summary}`;
        analysisSummary.append(reviewSummary);
      }

      details.append(analysisSummary);
      card.append(details);

      const actions = document.createElement('div');
      actions.className = 'history-entry-actions';

      const markdownButton = document.createElement('button');
      markdownButton.type = 'button';
      markdownButton.className = 'history-action';
      markdownButton.textContent = 'Markdown';
      markdownButton.addEventListener('click', () => {
        if (entry.analysis) downloadMarkdownReport(entry.analysis);
      });

      const pdfButton = document.createElement('button');
      pdfButton.type = 'button';
      pdfButton.className = 'history-action';
      pdfButton.textContent = 'PDF';
      pdfButton.addEventListener('click', () => {
        if (entry.analysis) downloadPdfReport(entry.analysis);
      });

      actions.append(markdownButton, pdfButton);
      card.append(actions);
    }

    historyListEl.append(card);
  }
}

async function refreshAnalysisHistory(): Promise<void> {
  if (!historyStatusEl) return;
  historyStatusEl.textContent = 'Loading saved analyses...';

  try {
    renderHistory(await loadAnalysisHistory());
  } catch (err: unknown) {
    console.error('[RepoLens Popup] Failed to load analysis history:', err);
    historyStatusEl.textContent = 'Could not load saved analyses. Try refreshing.';
  }
}

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

  const baseUrl = await apiClient.getBaseUrl();
  if (apiUrlInput && document.activeElement !== apiUrlInput) {
    apiUrlInput.value = baseUrl;
  }

  try {
    backendStatusEl.textContent = `Connecting to ${baseUrl}...`;
    const health = await apiClient.checkHealth();
    backendStatusEl.textContent = `Connected (${health.status}) · ${baseUrl}`;
    backendStatusEl.style.color = '#3fb950';
    if (statusIndicatorEl) {
      statusIndicatorEl.className = 'status-indicator active';
    }
  } catch (_err) {
    backendStatusEl.textContent = `Offline (${baseUrl})`;
    backendStatusEl.style.color = '#f85149';
    if (statusIndicatorEl) {
      statusIndicatorEl.className = 'status-indicator offline';
    }
  }
}

// Initial checks
checkActiveTab();
checkBackendHealth();
historyRefreshEl?.addEventListener('click', refreshAnalysisHistory);
refreshAnalysisHistory();

apiSaveBtn?.addEventListener('click', async () => {
  const newUrl = apiUrlInput?.value.trim();
  if (newUrl) {
    await apiClient.setBaseUrl(newUrl);
    await checkBackendHealth();
  }
});

apiResetBtn?.addEventListener('click', async () => {
  const defaultUrl = await apiClient.resetBaseUrl();
  if (apiUrlInput) {
    apiUrlInput.value = defaultUrl;
  }
  await checkBackendHealth();
});
