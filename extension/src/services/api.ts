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
            `Cannot connect to RepoLens backend at ${this.baseUrl}. Please verify the backend server is running and accessible.`
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
    const endpoint = `${this.baseUrl}/api/preview`;
    const payload: CreatePreviewRequest = { repositoryUrl };

    const controller = new AbortController();
    // Allow up to 120s for containerized builds
    const timeoutId = setTimeout(() => controller.abort(), 120000);

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
          throw new Error('Preview creation timed out (120s). Container build required more time than expected.');
        }

        if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('fetch failed') ||
          err.message.includes('NetworkError') ||
          err.message.includes('ECONNREFUSED')
        ) {
          throw new Error(`Cannot connect to RepoLens backend at ${this.baseUrl}.`);
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
    const endpoint = `${this.baseUrl}/api/preview/${encodeURIComponent(previewId)}`;
    const response = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' },
    });
    const data: ApiResponse<CreatePreviewData> = await response.json();
    return data;
  }

  /**
   * Stops preview session DELETE /api/preview/:previewId
   */
  public async stopPreview(previewId: string): Promise<ApiResponse<CreatePreviewData>> {
    const endpoint = `${this.baseUrl}/api/preview/${encodeURIComponent(previewId)}`;
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    });
    const data: ApiResponse<CreatePreviewData> = await response.json();
    return data;
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
