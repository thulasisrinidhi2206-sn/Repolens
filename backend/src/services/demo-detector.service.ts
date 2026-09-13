/**
 * RepoLens - Existing Demo & Deployment URL Detection Service
 * Analyzes repository metadata, package manifests, and README content to discover and validate live demos
 */

import { DemoUrlCandidate, DemoDetectionResult, DemoSource, RepositoryMetadata } from '@repolens/shared';

export interface DemoDetectionContext {
  metadata?: RepositoryMetadata;
  packageJsonRaw?: string | null;
  readmeContent?: string | null;
  validateReachable?: boolean; // Whether to perform safe HTTP validation (default: true)
}

// Recognized cloud deployment domains
const RECOGNIZED_DOMAINS = [
  'vercel.app',
  'netlify.app',
  'github.io',
  'pages.dev',
  'onrender.com',
  'render.com',
  'up.railway.app',
  'railway.app',
];

// Domains that should NEVER be considered demo URLs
const BLOCKED_DOMAINS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'npmjs.com',
  'www.npmjs.com',
  'pypi.org',
  'crates.io',
  'rubygems.org',
  'shields.io',
  'img.shields.io',
  'badgen.net',
  'badge.fury.io',
  'codecov.io',
  'travis-ci.org',
  'travis-ci.com',
  'circleci.com',
  'githubusercontent.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'discord.gg',
  'discord.com',
  'slack.com',
  't.me',
  'youtube.com',
  'youtu.be',
  'medium.com',
  'dev.to',
  'choosealicense.com',
  'opensource.org',
  'gnu.org',
  'w3.org',
  'developer.mozilla.org',
  'google.com',
  'en.wikipedia.org',
]);

// Keywords indicating demo or live deployment in link text or context
const DEMO_KEYWORDS = [
  'demo',
  'live demo',
  'live preview',
  'live site',
  'preview',
  'deployed',
  'deployment',
  'website',
  'try it out',
  'interactive demo',
  'app',
  'play with',
];

export class DemoDetectorService {
  /**
   * Main entrypoint to extract, score, and validate demo URLs from repository assets
   */
  public async detectDemos(context: DemoDetectionContext): Promise<DemoDetectionResult> {
    const candidateMap = new Map<string, DemoUrlCandidate>();

    // 1. Check Repository Metadata Homepage
    this.extractFromMetadata(context.metadata, candidateMap);

    // 2. Check package.json Homepage
    this.extractFromPackageJson(context.packageJsonRaw, candidateMap);

    // 3. Check README Content (Markdown links, HTML links, Badges, Text URLs)
    this.extractFromReadme(context.readmeContent, candidateMap);

    let candidates = Array.from(candidateMap.values());

    // 4. Safe HTTP validation if requested (default: true)
    if (context.validateReachable !== false && candidates.length > 0) {
      candidates = await this.validateCandidates(candidates);
    }

    // 5. Rank candidates by reachability, recognized deployment platform, and confidence
    candidates.sort((a, b) => {
      // 1. Reachable candidates come first
      if (a.isReachable !== b.isReachable) {
        if (a.isReachable) return -1;
        if (b.isReachable) return 1;
      }
      // 2. Recognized deployment domain priority
      const aIsRecognized = Boolean(a.domain);
      const bIsRecognized = Boolean(b.domain);
      if (aIsRecognized !== bIsRecognized) {
        return aIsRecognized ? -1 : 1;
      }
      // 3. Higher confidence score
      return b.confidence - a.confidence;
    });

    const hasDemo = candidates.length > 0;
    const primaryDemoUrl = hasDemo ? candidates[0].url : null;

    return {
      hasDemo,
      primaryDemoUrl,
      candidates,
    };
  }

  /**
   * Extracts demo candidate from GitHub repository homepage metadata
   */
  private extractFromMetadata(metadata: RepositoryMetadata | undefined, map: Map<string, DemoUrlCandidate>): void {
    if (!metadata || !metadata.homepage) return;

    const normalized = this.normalizeUrl(metadata.homepage);
    if (!normalized || this.isBlockedUrl(normalized)) return;

    const matchedDomain = this.getRecognizedDomain(normalized);
    const confidence = matchedDomain ? 0.95 : 0.85;

    map.set(normalized, {
      url: normalized,
      source: 'metadata_homepage',
      confidence,
      domain: matchedDomain || undefined,
      description: matchedDomain ? `Repository Homepage (${matchedDomain})` : 'Repository Homepage',
    });
  }

  /**
   * Extracts demo candidate from package.json homepage property
   */
  private extractFromPackageJson(packageJsonRaw: string | null | undefined, map: Map<string, DemoUrlCandidate>): void {
    if (!packageJsonRaw) return;

    try {
      const pkg = JSON.parse(packageJsonRaw);
      if (pkg.homepage && typeof pkg.homepage === 'string') {
        const normalized = this.normalizeUrl(pkg.homepage);
        if (normalized && !this.isBlockedUrl(normalized)) {
          const matchedDomain = this.getRecognizedDomain(normalized);
          const confidence = matchedDomain ? 0.90 : 0.75;

          // If not already present or source has lower confidence, record it
          if (!map.has(normalized) || map.get(normalized)!.confidence < confidence) {
            map.set(normalized, {
              url: normalized,
              source: 'package_json',
              confidence,
              domain: matchedDomain || undefined,
              description: matchedDomain ? `Package Homepage (${matchedDomain})` : 'Package Manifest Homepage',
            });
          }
        }
      }
    } catch (_err) {
      // Non-blocking
    }
  }

  /**
   * Extracts demo candidates from README markdown links, HTML anchors, and text
   */
  private extractFromReadme(readmeContent: string | null | undefined, map: Map<string, DemoUrlCandidate>): void {
    if (!readmeContent || readmeContent.trim().length === 0) return;

    // A. Extract Markdown Badge Links: [![Alt](imgUrl)](linkUrl)
    const badgeLinkRegex = /\[!\[([^\]]*)\]\([^)]+\)\]\((https?:\/\/[^)\s]+)\)/gi;
    let badgeMatch: RegExpExecArray | null;
    while ((badgeMatch = badgeLinkRegex.exec(readmeContent)) !== null) {
      const altText = badgeMatch[1] || '';
      const rawUrl = badgeMatch[2];
      this.processReadmeCandidate(rawUrl, altText, 'readme_badge', map);
    }

    // B. Extract Markdown Links: [Text](url)
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = mdLinkRegex.exec(readmeContent)) !== null) {
      const linkText = mdMatch[1] || '';
      const rawUrl = mdMatch[2];
      this.processReadmeCandidate(rawUrl, linkText, 'readme_link', map);
    }

    // C. Extract HTML Anchor Tags: <a href="url">Text</a>
    const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"'\s>]+)["'][^>]*>(.*?)<\/a>/gis;
    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlLinkRegex.exec(readmeContent)) !== null) {
      const rawUrl = htmlMatch[1];
      const anchorText = (htmlMatch[2] || '').replace(/<[^>]+>/g, '').trim();
      this.processReadmeCandidate(rawUrl, anchorText, 'readme_link', map);
    }

    // D. Extract Raw URLs matching recognized deployment domains in plaintext
    const domainRegex = /https?:\/\/[a-zA-Z0-9.-]+\.(?:vercel\.app|netlify\.app|github\.io|pages\.dev|onrender\.com|render\.com|up\.railway\.app|railway\.app)(?:\/[^\s)\]>"']*)?/gi;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = domainRegex.exec(readmeContent)) !== null) {
      const rawUrl = textMatch[0];
      this.processReadmeCandidate(rawUrl, 'Deployment Domain', 'readme_text', map);
    }
  }

  /**
   * Filters, normalizes, and assigns confidence scores to extracted URLs
   */
  private processReadmeCandidate(
    rawUrl: string,
    contextText: string,
    source: DemoSource,
    map: Map<string, DemoUrlCandidate>
  ): void {
    const normalized = this.normalizeUrl(rawUrl);
    if (!normalized || this.isBlockedUrl(normalized)) return;

    const matchedDomain = this.getRecognizedDomain(normalized);
    const lowerContext = contextText.toLowerCase();

    // Determine if context contains explicit demo keywords
    const hasDemoKeyword = DEMO_KEYWORDS.some(kw => lowerContext.includes(kw));

    // Calculate confidence score
    let confidence = 0.50;

    if (matchedDomain && hasDemoKeyword) {
      confidence = 0.95;
    } else if (matchedDomain) {
      confidence = 0.90;
    } else if (hasDemoKeyword) {
      confidence = 0.80;
    } else if (source === 'readme_badge' && lowerContext.includes('deploy')) {
      confidence = 0.85;
    } else {
      // Generic external link without demo keywords or recognized cloud platform
      return; // Ignore generic links to keep noise low
    }

    const description = matchedDomain
      ? `${hasDemoKeyword ? 'Live Demo' : 'Deployment'} (${matchedDomain})`
      : 'Demo Link';

    const existing = map.get(normalized);
    if (!existing || existing.confidence < confidence) {
      map.set(normalized, {
        url: normalized,
        source,
        confidence,
        domain: matchedDomain || undefined,
        description,
      });
    }
  }

  /**
   * Safely checks reachability of candidates via lightweight HTTP HEAD/GET
   */
  private async validateCandidates(candidates: DemoUrlCandidate[]): Promise<DemoUrlCandidate[]> {
    const validationPromises = candidates.map(async (candidate) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

        let response: Response;
        try {
          // Attempt HEAD first
          response = await fetch(candidate.url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'RepoLens-Demo-Validator/1.0' },
            signal: controller.signal,
          });

          // Some platforms return 405 Method Not Allowed on HEAD; fallback to GET
          if (response.status === 405) {
            response = await fetch(candidate.url, {
              method: 'GET',
              headers: { 'User-Agent': 'RepoLens-Demo-Validator/1.0' },
              signal: controller.signal,
            });
          }
        } catch (_fetchErr) {
          clearTimeout(timeoutId);
          return {
            ...candidate,
            isValidated: true,
            isReachable: false,
            statusCode: 0,
          };
        }

        clearTimeout(timeoutId);
        const isReachable = response.status >= 200 && response.status < 400;

        return {
          ...candidate,
          isValidated: true,
          isReachable,
          statusCode: response.status,
          // Slightly boost confidence if verified live
          confidence: isReachable ? Math.min(1.0, candidate.confidence + 0.05) : Math.max(0.2, candidate.confidence - 0.2),
        };
      } catch (_err) {
        return {
          ...candidate,
          isValidated: true,
          isReachable: false,
          statusCode: 0,
        };
      }
    });

    return Promise.all(validationPromises);
  }

  /**
   * Identifies if a URL belongs to one of the recognized cloud deployment domains
   */
  public getRecognizedDomain(urlStr: string): string | null {
    try {
      const parsed = new URL(urlStr);
      const hostname = parsed.hostname.toLowerCase();

      for (const domain of RECOGNIZED_DOMAINS) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return domain;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalizes a URL string (ensures https/http, strips tracking query params, removes trailing slash)
   */
  public normalizeUrl(rawUrl: string): string | null {
    try {
      const trimmed = rawUrl.trim();
      const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(withProto);

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }

      // Strip common analytics & tracking params
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('ref');

      // Strip trailing slash from pathname
      let cleanPath = parsed.pathname;
      if (cleanPath.endsWith('/')) {
        cleanPath = cleanPath.slice(0, -1);
      }

      let cleanUrl = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}${cleanPath}`;
      if (parsed.search) {
        cleanUrl += parsed.search;
      }

      return cleanUrl;
    } catch {
      return null;
    }
  }

  /**
   * Checks whether a URL is in the blocklist
   */
  private isBlockedUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const hostname = parsed.hostname.toLowerCase();

      if (BLOCKED_DOMAINS.has(hostname)) return true;

      for (const blocked of BLOCKED_DOMAINS) {
        if (hostname.endsWith(`.${blocked}`)) {
          return true;
        }
      }

      // Block file downloads or images
      const pathname = parsed.pathname.toLowerCase();
      if (/\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|tar|gz|mp4)$/i.test(pathname)) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }
}

export const demoDetectorService = new DemoDetectorService();
