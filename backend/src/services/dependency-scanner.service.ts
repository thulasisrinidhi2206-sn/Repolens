/**
 * RepoLens - Dependency & Vulnerability Scanner Service
 * Inspects package.json dependencies, unpinned versions, and known advisory patterns.
 */

import { DependencyItem } from '@repolens/shared';

// Known critical package advisories for offline deterministic detection
const KNOWN_ADVISORIES: Record<string, { minSafeVersion?: string; advisory: string; recommendation: string }> = {
  'event-stream': { minSafeVersion: '4.0.0', advisory: 'Known malicious dependency injection in 3.3.6', recommendation: 'Upgrade to 4.0.0+ or replace with standard streams.' },
  'flatmap-stream': { advisory: 'Malicious bitcoin stealing payload contained in package', recommendation: 'Remove flatmap-stream immediately.' },
  'colors': { minSafeVersion: '1.4.1', advisory: 'DoS loop introduced in 1.4.44-liberty-2', recommendation: 'Pin to safe version 1.4.0 or replace with chalk.' },
  'faker': { minSafeVersion: '5.5.3', advisory: 'Corrupted package release in 6.6.6', recommendation: 'Migrate to @faker-js/faker.' },
  'node-ipc': { minSafeVersion: '10.1.3', advisory: 'Protestware payload targeting specific locales in 10.1.1 - 10.1.2', recommendation: 'Remove or pin to safe 9.2.1 / 10.1.3.' },
};

export class DependencyScannerService {
  /**
   * Scans package.json dependencies and classifies vulnerability/health status
   */
  public static scan(packageJsonRaw?: string | null): {
    totalCount: number;
    list: DependencyItem[];
    vulnerableCount: number;
    outdatedCount: number;
  } {
    if (!packageJsonRaw) {
      return { totalCount: 0, list: [], vulnerableCount: 0, outdatedCount: 0 };
    }

    let pkg: any = {};
    try {
      pkg = JSON.parse(packageJsonRaw);
    } catch {
      return { totalCount: 0, list: [], vulnerableCount: 0, outdatedCount: 0 };
    }

    const items: DependencyItem[] = [];
    let vulnerableCount = 0;
    let outdatedCount = 0;

    const processDepMap = (deps: Record<string, string> | undefined, type: 'dependency' | 'devDependency' | 'peerDependency') => {
      if (!deps || typeof deps !== 'object') return;

      for (const [name, version] of Object.entries(deps)) {
        const item: DependencyItem = {
          name,
          currentVersion: String(version),
          type,
        };

        // 1. Check for unpinned/wildcard versions (*, latest)
        if (version === '*' || version === 'latest' || version === '') {
          item.isOutdated = true;
          item.recommendation = `Pin dependency '${name}' to an explicit semantic version (e.g. ^1.2.0) to prevent breaking builds.`;
          outdatedCount++;
        }

        // 2. Check for known advisories
        const advisory = KNOWN_ADVISORIES[name.toLowerCase()];
        if (advisory) {
          item.isVulnerable = true;
          item.vulnerabilityCount = 1;
          item.advisories = [advisory.advisory];
          item.recommendation = advisory.recommendation;
          vulnerableCount++;
        }

        // 3. Check for deprecated packages
        if (name === 'request' || name === 'request-promise') {
          item.isOutdated = true;
          item.recommendation = 'The `request` library is deprecated. Migrate to native `fetch` or `axios`.';
          outdatedCount++;
        }

        items.push(item);
      }
    };

    processDepMap(pkg.dependencies, 'dependency');
    processDepMap(pkg.devDependencies, 'devDependency');
    processDepMap(pkg.peerDependencies, 'peerDependency');

    return {
      totalCount: items.length,
      list: items,
      vulnerableCount,
      outdatedCount,
    };
  }
}
