/**
 * RepoLens - Static Project Detector & Eligibility Service
 * Validates whether a GitHub repository can be previewed as a static HTML/CSS/JS application
 */

import path from 'path';
import { ProjectType, StaticPreviewEligibility } from '@repolens/shared';

export interface StaticProjectDetectionContext {
  projectType: ProjectType;
  framework?: string;
  rootFiles: string[];
  allFiles?: string[];
  packageJsonRaw?: string | null;
}

export const ALLOWED_STATIC_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.txt',
  '.xml',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.wav',
  '.pdf',
  '.map',
]);

export const BLOCKED_PATH_PATTERNS = [
  /^\.git\b/i,
  /^\.env/i,
  /^\.github\b/i,
  /node_modules/i,
  /^\.vscode\b/i,
  /^\.idea\b/i,
  /\.pem$/i,
  /\.key$/i,
  /\.id_rsa/i,
  /\.passwd$/i,
  /\.shadow$/i,
];

export const MAX_STATIC_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per individual file
export const MAX_TOTAL_WORKSPACE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB total workspace

export class StaticDetectorService {
  /**
   * Evaluates if repository is eligible for isolated preview (Static or Vite)
   */
  public static evaluateEligibility(context: StaticProjectDetectionContext): StaticPreviewEligibility {
    const { projectType, framework = '', rootFiles, allFiles = rootFiles, packageJsonRaw } = context;

    const lowerRoot = rootFiles.map(f => f.toLowerCase());
    const lowerAll = allFiles.map(f => f.toLowerCase());

    // 1. Check for Vite / React-Vite Project from package.json, config, or detector classification
    let hasViteInPackageJson = false;
    if (packageJsonRaw) {
      try {
        const pkg = JSON.parse(packageJsonRaw);
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
          ...(pkg.peerDependencies || {}),
          ...(pkg.optionalDependencies || {}),
        };
        const depKeys = Object.keys(allDeps);
        const hasViteDep = depKeys.some(d => d === 'vite' || d.startsWith('@vitejs/') || d.includes('vite-plugin') || d.includes('vite'));
        const hasViteScript = Boolean(
          pkg.scripts &&
          Object.values(pkg.scripts).some((s: any) => typeof s === 'string' && (s.includes('vite') || s.includes('vitest')))
        );
        const hasViteName = Boolean(pkg.name && (pkg.name.includes('vite') || pkg.name.startsWith('@vitejs/')));
        const hasViteKeyword = Array.isArray(pkg.keywords) && pkg.keywords.some((k: any) => typeof k === 'string' && k.toLowerCase().includes('vite'));

        if (hasViteDep || hasViteScript || hasViteName || hasViteKeyword) {
          hasViteInPackageJson = true;
        }
      } catch {
        // ignore JSON parse error
      }
    }

    const hasViteConfig =
      lowerRoot.some(f =>
        f === 'vite.config.js' || f === 'vite.config.ts' || f === 'vite.config.mjs' || f === 'vite.config.cjs'
      ) ||
      lowerAll.some(f =>
        /(^|\/)vite\.config\.(js|ts|mjs|cjs)$/i.test(f)
      );

    const isViteProject =
      projectType === 'Vite' ||
      framework.toLowerCase().includes('vite') ||
      hasViteConfig ||
      hasViteInPackageJson;

    if (isViteProject) {
      const hasPackageJson = lowerRoot.includes('package.json') || Boolean(packageJsonRaw);
      if (!hasPackageJson) {
        return {
          isEligible: false,
          reason: 'Vite project is missing a package.json file required for build execution.',
          projectType: 'Vite',
        };
      }

      return {
        isEligible: true,
        entryFile: 'package.json',
        staticFilesCount: allFiles.length,
        projectType: 'Vite',
      };
    }

    // 2. Reject non-Vite build-dependent project types (Next.js, Create-React-App without Vite, Python, etc.)
    if (projectType === 'Next.js') {
      return {
        isEligible: false,
        reason: `Build-dependent framework detected (Next.js). Next.js server-side preview builds will be supported in a future phase.`,
        projectType,
      };
    }

    if (projectType === 'React' && !isViteProject) {
      return {
        isEligible: false,
        reason: `Build-dependent framework detected (React). Non-Vite React build pipelines will be supported in a future phase.`,
        projectType,
      };
    }

    if (projectType === 'Python') {
      return {
        isEligible: false,
        reason: 'Python backend project detected. Server-side execution is not supported in preview mode.',
        projectType,
      };
    }

    const hasStaticEntry = lowerAll.some(file =>
      file === 'index.html' || file === 'public/index.html' || file === 'src/index.html' || file === 'dist/index.html'
    );

    if (projectType === 'Node.js' && !hasStaticEntry) {
      return {
        isEligible: false,
        reason: 'Node.js server-side project detected without an entry index.html file.',
        projectType,
      };
    }

    // 3. Identify Entry HTML file for Static Web projects
    let entryFile: string | undefined;

    if (lowerRoot.includes('index.html')) {
      const idx = lowerRoot.indexOf('index.html');
      entryFile = rootFiles[idx];
    } else {
      // Look for index.html in shallow standard folders
      const candidates = allFiles.filter(f => {
        const lower = f.toLowerCase();
        return (
          lower === 'index.html' ||
          lower === 'public/index.html' ||
          lower === 'src/index.html' ||
          lower === 'dist/index.html'
        );
      });

      if (candidates.length > 0) {
        entryFile = candidates[0];
      }
    }

    if (!entryFile) {
      return {
        isEligible: false,
        reason: 'Repository is missing an entry index.html file required for static preview.',
        projectType,
      };
    }

    // 4. Count valid static assets
    const validStaticFiles = this.filterSafeStaticFiles(allFiles);

    return {
      isEligible: true,
      entryFile,
      staticFilesCount: validStaticFiles.length,
      projectType: 'HTML/CSS/JavaScript',
    };
  }

  /**
   * Filters and normalizes file paths to ensure only safe static files are accepted
   */
  public static filterSafeStaticFiles(filePaths: string[]): string[] {
    return filePaths.filter(filePath => {
      // Normalize slashes
      const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

      // Prevent path traversal attacks (../ or absolute paths)
      if (normalized.includes('..') || path.isAbsolute(normalized)) {
        return false;
      }

      // Check blocklisted paths (.git, .env, secrets, node_modules)
      for (const pattern of BLOCKED_PATH_PATTERNS) {
        if (pattern.test(normalized)) {
          return false;
        }
      }

      // Verify extension
      const ext = path.extname(normalized).toLowerCase();
      return ALLOWED_STATIC_EXTENSIONS.has(ext);
    });
  }
}

