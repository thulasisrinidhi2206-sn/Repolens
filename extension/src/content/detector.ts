/**
 * RepoLens - GitHub Page & Repository Detector
 */

import { RepoInfo } from './types';

// Reserved root paths on GitHub that do not represent repository owners
const GITHUB_RESERVED_ROOT_PATHS = new Set([
  'about',
  'account',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'dashboard',
  'discussions',
  'enterprises',
  'enterprise',
  'events',
  'explore',
  'features',
  'git-guides',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'nonprofit',
  'notifications',
  'organizations',
  'orgs',
  'password_reset',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'session',
  'sessions',
  'settings',
  'signup',
  'site',
  'sponsors',
  'stars',
  'team',
  'topics',
  'trending',
  'users',
  'watching'
]);

/**
 * Checks whether the current window origin is GitHub
 */
export function isGitHubHost(urlStr?: string): boolean {
  try {
    const url = new URL(urlStr || window.location.href);
    return url.hostname === 'github.com' || url.hostname === 'www.github.com';
  } catch {
    return false;
  }
}

/**
 * Parses GitHub repository details from a URL string.
 * Returns null if the URL is not a valid GitHub repository page.
 */
export function parseGitHubRepoUrl(urlStr?: string): RepoInfo | null {
  try {
    const targetUrl = urlStr ? new URL(urlStr) : new URL(window.location.href);

    // 1. Verify hostname
    if (targetUrl.hostname !== 'github.com' && targetUrl.hostname !== 'www.github.com') {
      return null;
    }

    // 2. Split pathname into segments, omitting empty parts
    const segments = targetUrl.pathname
      .split('/')
      .map(s => s.trim())
      .filter(Boolean);

    // A repository URL requires at least [owner, repo]
    if (segments.length < 2) {
      return null;
    }

    const [owner, repo, ...rest] = segments;

    // 3. Filter out reserved GitHub system pages
    if (GITHUB_RESERVED_ROOT_PATHS.has(owner.toLowerCase())) {
      return null;
    }

    // 4. Sanitize repo name (strip .git suffix if present)
    const sanitizedRepo = repo.replace(/\.git$/i, '');
    if (!sanitizedRepo || sanitizedRepo === '.' || sanitizedRepo === '..') {
      return null;
    }

    // 5. Extract branch or subPath if available (e.g. /owner/repo/tree/main)
    let branch: string | undefined;
    let subPath: string | undefined;

    if (rest.length >= 2 && (rest[0] === 'tree' || rest[0] === 'blob')) {
      branch = rest[1];
      if (rest.length > 2) {
        subPath = rest.slice(2).join('/');
      }
    }

    return {
      owner,
      repo: sanitizedRepo,
      fullRepo: `${owner}/${sanitizedRepo}`,
      branch,
      subPath,
      url: `https://github.com/${owner}/${sanitizedRepo}`
    };
  } catch (_err) {
    return null;
  }
}
