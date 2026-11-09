/**
 * RepoLens - Local analysis history (chrome.storage.local)
 */

import { AnalysisHistoryEntry, AnalyzeRepoData } from '@repolens/shared';

const STORAGE_KEY = 'repolens.analysisHistory';
const MAX_ENTRIES = 15;

function canUseStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export function toHistoryEntry(data: AnalyzeRepoData): AnalysisHistoryEntry {
  return {
    id: data.id,
    repositoryUrl: data.repositoryUrl,
    owner: data.repo.owner,
    repo: data.repo.repo,
    analyzedAt: data.receivedAt,
    projectType: data.projectType,
    framework: data.framework,
    overallScore: data.metrics?.qualityScore?.overallScore ?? data.metrics?.overallScore,
    grade: data.metrics?.qualityScore?.grade,
    hasDemo: Boolean(data.demo?.hasDemo),
    primaryDemoUrl: data.demo?.primaryDemoUrl ?? null,
    analysis: data,
  };
}

export async function loadAnalysisHistory(): Promise<AnalysisHistoryEntry[]> {
  if (!canUseStorage()) return [];

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const entries = result[STORAGE_KEY];
  return Array.isArray(entries) ? (entries as AnalysisHistoryEntry[]) : [];
}

export async function saveAnalysisToHistory(data: AnalyzeRepoData): Promise<void> {
  if (!canUseStorage()) return;

  const entry = toHistoryEntry(data);
  const existing = await loadAnalysisHistory();
  const next = [entry, ...existing.filter(item => item.repositoryUrl !== entry.repositoryUrl)].slice(0, MAX_ENTRIES);

  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export async function getHistoryEntry(id: string): Promise<AnalysisHistoryEntry | undefined> {
  const entries = await loadAnalysisHistory();
  return entries.find(item => item.id === id);
}
