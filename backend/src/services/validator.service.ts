import { RepoIdentifier } from '@repolens/shared';

// GitHub system and reserved root routes that cannot be repository owners
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

// Valid GitHub username/org regex: alphanumeric and single hyphens, 1-39 chars, cannot start or end with hyphen
const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

// Valid GitHub repository name regex: alphanumeric, underscores, hyphens, periods, 1-100 chars
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

export interface ValidationResult {
  isValid: boolean;
  repo?: RepoIdentifier;
  normalizedUrl?: string;
  error?: string;
}

export class GitHubUrlValidatorService {
  /**
   * Validates and extracts repository information from a GitHub URL string
   */
  public static validateAndParse(rawUrl: string): ValidationResult {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      return {
        isValid: false,
        error: 'Repository URL is required and must be a non-empty string.'
      };
    }

    const trimmed = rawUrl.trim();
    let parsedUrl: URL;

    try {
      // Add https:// prefix if user provided domain without protocol
      const urlToParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      parsedUrl = new URL(urlToParse);
    } catch (_err) {
      return {
        isValid: false,
        error: 'Invalid URL format provided.'
      };
    }

    // Validate protocol
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        isValid: false,
        error: 'URL protocol must be HTTP or HTTPS.'
      };
    }

    // Validate hostname
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== 'github.com' && hostname !== 'www.github.com') {
      return {
        isValid: false,
        error: 'URL host must be github.com.'
      };
    }

    // Extract and sanitize pathname segments
    const segments = parsedUrl.pathname
      .split('/')
      .map(s => s.trim())
      .filter(Boolean);

    if (segments.length < 2) {
      return {
        isValid: false,
        error: 'GitHub repository URL must include both owner and repository name (e.g. https://github.com/owner/repository).'
      };
    }

    const [rawOwner, rawRepo, ...rest] = segments;

    // Check reserved routes
    if (GITHUB_RESERVED_ROOT_PATHS.has(rawOwner.toLowerCase())) {
      return {
        isValid: false,
        error: `'${rawOwner}' is a reserved GitHub system path and cannot be a repository owner.`
      };
    }

    // Check owner format
    if (!GITHUB_OWNER_REGEX.test(rawOwner)) {
      return {
        isValid: false,
        error: `Invalid GitHub owner/organization name: '${rawOwner}'.`
      };
    }

    // Sanitize repository name (strip .git suffix)
    const sanitizedRepo = rawRepo.replace(/\.git$/i, '');

    if (!sanitizedRepo || !GITHUB_REPO_REGEX.test(sanitizedRepo) || sanitizedRepo === '.' || sanitizedRepo === '..') {
      return {
        isValid: false,
        error: `Invalid GitHub repository name: '${rawRepo}'.`
      };
    }

    // Optional branch or commit if URL points to a subpath like /tree/:branch
    let branch: string | undefined;
    if (rest.length >= 2 && rest[0] === 'tree') {
      branch = rest[1];
    }

    const repo: RepoIdentifier = {
      owner: rawOwner,
      repo: sanitizedRepo,
      ...(branch ? { branch } : {})
    };

    const normalizedUrl = `https://github.com/${rawOwner}/${sanitizedRepo}`;

    return {
      isValid: true,
      repo,
      normalizedUrl
    };
  }
}
