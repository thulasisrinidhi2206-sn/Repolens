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
   * Evaluates if repository is eligible for static isolated preview
   */
  public static evaluateEligibility(context: StaticProjectDetectionContext): StaticPreviewEligibility {
    const { projectType, rootFiles, allFiles = rootFiles } = context;

    const lowerRoot = rootFiles.map(f => f.toLowerCase());

    // 1. Check for build-dependent project types (React, Vite, Next.js, Python, etc.)
    if (projectType === 'React' || projectType === 'Vite' || projectType === 'Next.js') {
      return {
        isEligible: false,
        reason: `Build-dependent framework detected (${context.framework || projectType}). Bundled preview builds will be supported in a future phase.`,
        projectType,
      };
    }

    if (projectType === 'Python') {
      return {
        isEligible: false,
        reason: 'Python backend project detected. Server-side execution is not supported in static preview mode.',
        projectType,
      };
    }

    if (projectType === 'Node.js' && !lowerRoot.includes('index.html')) {
      return {
        isEligible: false,
        reason: 'Node.js server-side project detected without an entry index.html file.',
        projectType,
      };
    }

    // 2. Identify Entry HTML file
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

    // 3. Count valid static assets
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

