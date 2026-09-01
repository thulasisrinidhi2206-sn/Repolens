/**
 * RepoLens Extension Configuration
 * Single source of truth for backend endpoints and extension settings
 */

export const CONFIG = {
  /**
   * RepoLens Backend API Base URL
   * Change this single value to point to a different host or staging/production backend.
   */
  API_BASE_URL: 'http://localhost:3001',

  /**
   * Request timeout in milliseconds
   */
  REQUEST_TIMEOUT_MS: 10000,
} as const;

export type Config = typeof CONFIG;
