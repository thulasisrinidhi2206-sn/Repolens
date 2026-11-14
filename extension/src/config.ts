/**
 * RepoLens Extension Configuration
 * Single source of truth for backend endpoints and extension settings
 */

declare const __REPOLENS_API_URL__: string | undefined;

export const CONFIG = {
  /**
   * RepoLens Backend API Base URL
   * Injected at build time via esbuild define or defaults to localhost:3001
   */
  API_BASE_URL:
    typeof __REPOLENS_API_URL__ !== 'undefined' && __REPOLENS_API_URL__
      ? __REPOLENS_API_URL__
    : 'https://repolens-backend-gkdm.onrender.com',

  /**
   * Request timeout in milliseconds
   */
  REQUEST_TIMEOUT_MS: 45000,
} as const;

export type Config = typeof CONFIG;
