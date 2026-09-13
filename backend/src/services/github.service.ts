/**
 * RepoLens - GitHub REST API Service
 * Isolated module handling all GitHub API communication with structured error handling
 */

import { RepositoryMetadata } from '@repolens/shared';

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
  private readonly token?: string;

  constructor(baseUrl: string = 'https://api.github.com', token?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token || process.env.GITHUB_TOKEN;
  }

  /**
   * Helper to perform GitHub API requests with rate limit and error handling
   */
  private async request<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RepoLens-Platform/1.0',
    };

    if (this.token && this.token.trim().length > 0) {
      headers['Authorization'] = `Bearer ${this.token.trim()}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new GitHubApiError(
        `Failed to reach GitHub API: ${msg}`,
        'API_FAILURE',
        503
      );
    }

    // Handle Rate Limiting
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    if (response.status === 403 && rateLimitRemaining === '0') {
      const resetTimestamp = response.headers.get('x-ratelimit-reset');
      const resetTime = resetTimestamp ? new Date(parseInt(resetTimestamp, 10) * 1000).toLocaleTimeString() : 'soon';
      throw new GitHubApiError(
        `GitHub API rate limit exceeded. Limit resets at ${resetTime}. Please try again later or configure a GITHUB_TOKEN.`,
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
   * Returns null if file does not exist.
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
      return null;
    }
  }

  /**
   * Fetches the repository README content if present
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
      return null;
    }
  }
}

export const gitHubService = new GitHubService();
