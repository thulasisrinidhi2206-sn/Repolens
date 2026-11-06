/**
 * RepoLens - GitHub REST API Service
 * Isolated module handling all GitHub API communication with structured error handling
 */

import path from 'path';
import dotenv from 'dotenv';
import { RepositoryMetadata } from '@repolens/shared';

// Ensure environment configuration is loaded regardless of import order
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export type GitHubErrorType =
  | 'NOT_FOUND'
  | 'PRIVATE_REPO'
  | 'RATE_LIMIT'
  | 'API_FAILURE'
  | 'BAD_CREDENTIALS'
  | 'INVALID_REPO';

export class GitHubApiError extends Error {
  public readonly errorType: GitHubErrorType;
  public readonly statusCode: number;

  constructor(message: string, errorType: GitHubErrorType, statusCode: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.errorType = errorType;
    this.statusCode = statusCode;
  }
}

export interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size?: number;
  download_url?: string | null;
  html_url?: string;
  content?: string;
  encoding?: string;
}

export class GitHubService {
  private readonly baseUrl: string;
  private readonly explicitToken?: string;

  constructor(baseUrl: string = 'https://api.github.com', token?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.explicitToken = token;
  }

  /**
   * Dynamically resolves the active GitHub token from explicit config or environment variables
   */
  public get token(): string | undefined {
    return this.explicitToken || process.env.GITHUB_TOKEN;
  }

  /**
   * Helper to perform GitHub API requests with rate limit and error handling
   */
  private async request<T>(endpoint: string, timeoutMs: number = 10000): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RepoLens-Platform/1.0',
    };

    const activeToken = this.token;
    if (activeToken && activeToken.trim().length > 0) {
      headers['Authorization'] = `Bearer ${activeToken.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } catch (networkErr: unknown) {
      clearTimeout(timeoutId);
      if (networkErr instanceof Error && networkErr.name === 'AbortError') {
        throw new GitHubApiError(
          `GitHub API request timed out (${timeoutMs / 1000}s) for endpoint: ${endpoint}`,
          'API_FAILURE',
          504
        );
      }
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new GitHubApiError(
        `Failed to reach GitHub API: ${msg}`,
        'API_FAILURE',
        503
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle Rate Limiting (Primary and Secondary)
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    if ((response.status === 403 || response.status === 429) && (rateLimitRemaining === '0' || response.headers.has('retry-after'))) {
      const resetTimestamp = response.headers.get('x-ratelimit-reset');
      const resetTime = resetTimestamp ? new Date(parseInt(resetTimestamp, 10) * 1000).toLocaleTimeString() : 'soon';
      throw new GitHubApiError(
        `GitHub API rate limit exceeded. Limit resets at ${resetTime}. Please configure a GITHUB_TOKEN in backend/.env to increase rate limits to 5,000 req/hr.`,
        'RATE_LIMIT',
        429
      );
    }

    // Handle Not Found / Private Repo
    if (response.status === 404) {
      throw new GitHubApiError(
        'Repository was not found or is private. RepoLens currently supports public repositories.',
        'NOT_FOUND',
        404
      );
    }

    // Handle Unauthorized / Bad Credentials
    if (response.status === 401) {
      throw new GitHubApiError(
        'GitHub API authentication failed. Please verify your configured GITHUB_TOKEN.',
        'BAD_CREDENTIALS',
        401
      );
    }

    // Handle Generic Forbidden
    if (response.status === 403) {
      const errorJson: any = await response.json().catch(() => ({}));
      const msg = errorJson.message || 'Access to this repository is restricted.';
      throw new GitHubApiError(
        `GitHub API access forbidden: ${msg}`,
        'PRIVATE_REPO',
        403
      );
    }

    // Handle 5xx Server Errors from GitHub
    if (response.status >= 500) {
      throw new GitHubApiError(
        `GitHub API service is currently experiencing issues (HTTP ${response.status}).`,
        'API_FAILURE',
        502
      );
    }

    if (!response.ok) {
      const errorJson: any = await response.json().catch(() => ({}));
      const msg = errorJson.message || `GitHub API error (HTTP ${response.status})`;
      throw new GitHubApiError(msg, 'API_FAILURE', response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetches basic repository metadata from GitHub REST API
   */
  public async getRepositoryMetadata(owner: string, repo: string): Promise<RepositoryMetadata> {
    const data: any = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.login || owner,
      description: data.description || null,
      url: data.html_url || `https://github.com/${owner}/${repo}`,
      homepage: data.homepage ? String(data.homepage).trim() : null,
      defaultBranch: data.default_branch || 'main',
      language: data.language || null,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      topics: Array.isArray(data.topics) ? data.topics : [],
      createdAt: data.created_at || new Date().toISOString(),
      updatedAt: data.updated_at || new Date().toISOString(),
      pushedAt: data.pushed_at || new Date().toISOString(),
      isPrivate: Boolean(data.private),
    };
  }

  /**
   * Fetches the list of files and directories in the repository root
   */
  public async getRootContents(owner: string, repo: string, ref?: string): Promise<GitHubContentItem[]> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const items: any = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${query}`);

    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size,
      download_url: item.download_url,
      html_url: item.html_url,
    }));
  }

  /**
   * Fetches the decoded string content of a specific file in the repository (e.g. package.json)
   * Returns null if file does not exist (404), but re-throws rate limit or network failures.
   */
  public async getFileRawContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    try {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data: any = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${query}`
      );

      if (data && data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (err: unknown) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches the repository README content if present
   * Returns null if file does not exist (404), but re-throws rate limit or network failures.
   */
  public async fetchReadmeContent(owner: string, repo: string, ref?: string): Promise<string | null> {
    try {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data: any = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${query}`
      );

      if (data && data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (err: unknown) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches the full recursive Git tree for a branch or commit SHA
   */
  public async getGitTree(
    owner: string,
    repo: string,
    treeShaOrBranch: string,
    recursive: boolean = true
  ): Promise<{ path: string; mode: string; type: 'blob' | 'tree'; sha: string; size?: number }[]> {
    try {
      const query = recursive ? '?recursive=1' : '';
      const data: any = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeShaOrBranch)}${query}`
      );

      if (data && Array.isArray(data.tree)) {
        return data.tree.map((item: any) => ({
          path: item.path,
          mode: item.mode,
          type: item.type === 'blob' ? 'blob' : 'tree',
          sha: item.sha,
          size: item.size,
        }));
      }

      return [];
    } catch (err: unknown) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Fetches file content as Buffer (supports binary assets like images, fonts, etc.)
   * Enforces maxBytes limit per file and timeouts to protect memory and resources.
   */
  public async getFileBuffer(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    maxBytes: number = 5 * 1024 * 1024
  ): Promise<Buffer | null> {
    try {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data: any = await this.request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${query}`
      );

      if (data && typeof data.size === 'number' && data.size > maxBytes) {
        throw new Error(`File '${path}' exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
      }

      if (data && data.content && data.encoding === 'base64') {
        const buf = Buffer.from(data.content, 'base64');
        if (buf.length > maxBytes) {
          throw new Error(`File '${path}' exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
        }
        return buf;
      }

      // If download_url is available for larger files
      if (data && data.download_url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
          const downloadRes = await fetch(data.download_url, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (downloadRes.ok) {
            const contentLength = downloadRes.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > maxBytes) {
              throw new Error(`File '${path}' exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
            }

            const arrayBuf = await downloadRes.arrayBuffer();
            if (arrayBuf.byteLength > maxBytes) {
              throw new Error(`File '${path}' exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
            }

            return Buffer.from(arrayBuf);
          }
        } catch (downloadErr) {
          clearTimeout(timeoutId);
          throw downloadErr;
        }
      }

      return null;
    } catch (err: unknown) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }
}

export const gitHubService = new GitHubService();
