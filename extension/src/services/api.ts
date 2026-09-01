/**
 * RepoLens - Extension Backend API Client
 */

import { ApiResponse, AnalyzeRepoData, AnalyzeRepoRequest } from '@repolens/shared';
import { CONFIG } from '../config';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Sends repository URL to backend POST /api/analyze
   */
  public async analyzeRepository(repositoryUrl: string): Promise<ApiResponse<AnalyzeRepoData>> {
    const endpoint = `${this.baseUrl}/api/analyze`;
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
            `Connection timed out (${CONFIG.REQUEST_TIMEOUT_MS / 1000}s). Ensure RepoLens backend is active at ${this.baseUrl}.`
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
            `Cannot connect to RepoLens backend at ${this.baseUrl}. Please verify the server is running (\`npm run dev:backend\`).`
          );
        }

        throw err;
      }

      throw new Error('An unknown error occurred while communicating with the backend.');
    }
  }

  /**
   * Checks backend health GET /api/health
   */
  public async checkHealth(): Promise<{ status: string; service: string }> {
    const endpoint = `${this.baseUrl}/api/health`;

    try {
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return json.data || { status: 'healthy', service: 'repolens-backend' };
    } catch (_err) {
      throw new Error(`Backend unavailable at ${this.baseUrl}`);
    }
  }
}

export const apiClient = new ApiClient();
