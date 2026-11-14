/**
 * RepoLens - Extension Backend API Client
 */

import {
  ApiResponse,
  AnalyzeRepoData,
  AnalyzeRepoRequest,
  CreatePreviewData,
  CreatePreviewRequest,
} from '@repolens/shared';
import { CONFIG } from '../config';

export interface AskRepositoryCitation {
  path: string;
  startLine: number;
  endLine: number;
  url: string;
}
export interface AskRepositoryData {
  repository: string;
  branch: string;
  answer: string;
  citations: AskRepositoryCitation[];
  engine: string;
  isAiPowered: boolean;
  filesConsulted: number;
}


export interface IssueCodeMatch {
  path: string; relevance: number; reason: string; excerpt: string;
  startLine: number; endLine: number; url: string;
}
export interface IssueNavigatorData {
  repository: string; branch: string;
  issue: { number: number; title: string; body: string; state: string; url: string; labels: string[] };
  summary: string; matches: IssueCodeMatch[]; investigationSteps: string[];
  filesInspected: number; engine: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Retrieves the effective backend API base URL.
   * Checks chrome.storage.local for dynamic runtime overrides, otherwise falls back to configured default.
   */
  public async getBaseUrl(): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get('repolens.apiUrl');
        const customUrl = stored?.['repolens.apiUrl'];
        if (typeof customUrl === 'string' && customUrl.trim().length > 0) {
          return customUrl.trim().replace(/\/+$/, '');
        }
      } catch {
        // Fall back to memory baseUrl if chrome.storage is inaccessible
      }
    }
    return this.baseUrl;
  }

  /**
   * Updates and persists the backend API base URL
   */
  public async setBaseUrl(url: string): Promise<void> {
    this.baseUrl = url.trim().replace(/\/+$/, '');
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ 'repolens.apiUrl': this.baseUrl });
      } catch {
        // Non-blocking
      }
    }
  }

  /**
   * Resets the backend API base URL back to the configured default.
   */
  public async resetBaseUrl(): Promise<string> {
    this.baseUrl = CONFIG.API_BASE_URL.replace(/\/+$/, '');
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.remove('repolens.apiUrl');
      } catch {
        // Non-blocking
      }
    }
    return this.baseUrl;
  }

  /**
   * Sends repository URL to backend POST /api/analyze
   */
  public async analyzeRepository(repositoryUrl: string): Promise<ApiResponse<AnalyzeRepoData>> {
    const baseUrl = await this.getBaseUrl();
    const endpoint = `${baseUrl}/api/analyze`;
    const payload: AnalyzeRepoRequest = { repositoryUrl };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: ApiResponse<AnalyzeRepoData>;
      try {
        data = await response.json();
      } catch (_jsonErr) {
        throw new Error(`Server returned non-JSON response (HTTP ${response.status})`);
      }

      if (!response.ok || data.success === false) {
        const errorMsg = data?.error || `Request failed with status ${response.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new Error(
            `Connection timed out (${CONFIG.REQUEST_TIMEOUT_MS / 1000}s). Ensure RepoLens backend is active at ${baseUrl}.`
          );
        }

        // Handle network connection refused or offline (browser 'Failed to fetch', node 'fetch failed')
        if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('fetch failed') ||
          err.message.includes('NetworkError') ||
          err.message.includes('ECONNREFUSED')
        ) {
          throw new Error(
            `Cannot connect to RepoLens backend at ${baseUrl}. Please verify the backend server is running and accessible.`
          );
        }

        throw err;
      }

      throw new Error('An unknown error occurred while communicating with the backend.');
    }
  }

  /**
   * Sends repository URL to backend POST /api/preview to spin up isolated container preview
   */
  public async createPreview(repositoryUrl: string): Promise<ApiResponse<CreatePreviewData>> {
    const baseUrl = await this.getBaseUrl();
    const endpoint = `${baseUrl}/api/preview`;
    const payload: CreatePreviewRequest = { repositoryUrl };

    const controller = new AbortController();
    // Allow time for repository downloads, containerized builds, and server startup
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: ApiResponse<CreatePreviewData>;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${response.status})`);
      }

      if (!response.ok || data.success === false) {
        const errorMsg = data?.error || `Preview request failed with status ${response.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new Error('Preview creation timed out (180s). Container build required more time than expected.');
        }

        if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('fetch failed') ||
          err.message.includes('NetworkError') ||
          err.message.includes('ECONNREFUSED')
        ) {
          throw new Error(`Cannot connect to RepoLens backend at ${baseUrl}.`);
        }

        throw err;
      }

      throw new Error('An unknown error occurred while creating preview.');
    }
  }

  /**
   * Polls preview status GET /api/preview/:previewId
   */
  public async getPreview(previewId: string): Promise<ApiResponse<CreatePreviewData>> {
    const baseUrl = await this.getBaseUrl();
    const endpoint = `${baseUrl}/api/preview/${encodeURIComponent(previewId)}`;
    const response = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' },
    });

    let data: ApiResponse<CreatePreviewData>;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Preview status request returned non-JSON data (HTTP ${response.status}).`);
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Preview status request failed (HTTP ${response.status}).`);
    }
    return data;
  }

  /**
   * Stops preview session DELETE /api/preview/:previewId
   */
  public async stopPreview(previewId: string): Promise<ApiResponse<CreatePreviewData>> {
    const baseUrl = await this.getBaseUrl();
    const endpoint = `${baseUrl}/api/preview/${encodeURIComponent(previewId)}`;
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    });

    let data: ApiResponse<CreatePreviewData>;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Stop preview request returned non-JSON data (HTTP ${response.status}).`);
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Stop preview request failed (HTTP ${response.status}).`);
    }
    return data;
  }

  /**
   * Ask a question grounded in the selected public GitHub repository.
   */
  public async askRepository(repositoryUrl: string, question: string): Promise<ApiResponse<AskRepositoryData>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${this.baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ repositoryUrl, question }),
        signal: controller.signal,
      });
      const data: ApiResponse<AskRepositoryData> = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Repository question failed (HTTP ${response.status}).`);
      }
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Repository question timed out. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }


  /** Investigates a GitHub issue and ranks source files with evidence. */
  public async investigateIssue(repositoryUrl: string, issueNumber: number): Promise<ApiResponse<IssueNavigatorData>> {
    const baseUrl = await this.getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${baseUrl}/api/issue-navigator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ repositoryUrl, issueNumber }),
        signal: controller.signal,
      });
      const data: ApiResponse<IssueNavigatorData> = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || `Issue investigation failed (HTTP ${response.status}).`);
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('Issue investigation timed out. Please try again.');
      throw error;
    } finally { clearTimeout(timeoutId); }
  }

  /**
   * Checks backend health GET /api/health
   */
  public async checkHealth(): Promise<{ status: string; service: string }> {
    const baseUrl = await this.getBaseUrl();
    const endpoint = `${baseUrl}/api/health`;

    try {
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return json.data || { status: 'healthy', service: 'repolens-backend' };
    } catch (_err) {
      throw new Error(`Backend unavailable at ${baseUrl}`);
    }
  }
}

export const apiClient = new ApiClient();
