/**
 * RepoLens - React / Vite Project Preview Handler
 * Coordinates isolated containerized build (node:20-alpine) and production serving (nginx:alpine)
 */

import fs from 'fs/promises';
import path from 'path';
import { ProjectType } from '@repolens/shared';
import { IPreviewHandler, PreviewContext, BuildResult } from './preview-handler.interface';
import { gitHubService } from '../github.service';
import { ContainerStartOptions, dockerRuntimeService } from '../docker-runtime.service';
import { BLOCKED_PATH_PATTERNS } from '../static-detector.service';

export const ALLOWED_VITE_SOURCE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.vue',
  '.svelte',
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
  '.md',
  '.map',
  '.wasm',
]);

export class VitePreviewHandler implements IPreviewHandler {
  public readonly supportedProjectType: ProjectType = 'Vite';

  /**
   * Identifies if project is a Vite or React-Vite project
   */
  public canHandle(projectType: ProjectType, framework?: string): boolean {
    if (projectType === 'Vite') return true;
    if (framework && framework.toLowerCase().includes('vite')) return true;
    return false;
  }

  /**
   * Filters and normalizes source files required for building a Vite project
   */
  public filterSafeViteFiles(filePaths: string[]): string[] {
    return filePaths.filter((filePath) => {
      const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

      // Prevent directory traversal attacks
      if (normalized.includes('..') || path.isAbsolute(normalized)) {
        return false;
      }

      // Block dangerous files (.git, .env, secrets, node_modules)
      for (const pattern of BLOCKED_PATH_PATTERNS) {
        if (pattern.test(normalized)) {
          return false;
        }
      }

      const basename = path.basename(normalized).toLowerCase();
      // Allow standard configuration filenames without explicit extensions or with dots
      if (
        basename === 'package.json' ||
        basename === 'package-lock.json' ||
        basename === 'yarn.lock' ||
        basename === 'pnpm-lock.yaml' ||
        basename.startsWith('tsconfig') ||
        basename.startsWith('jsconfig') ||
        basename.startsWith('vite.config') ||
        basename.startsWith('postcss.config') ||
        basename.startsWith('tailwind.config')
      ) {
        return true;
      }

      const ext = path.extname(normalized).toLowerCase();
      return ALLOWED_VITE_SOURCE_EXTENSIONS.has(ext);
    });
  }

  /**
   * Safely downloads source code from GitHub into isolated workspace on host without running npm commands
   */
  public async prepareWorkspace(context: PreviewContext): Promise<void> {
    const { repo, metadata, workspacePath, allFilePaths } = context;

    // 1. Filter safe source and configuration files
    const safePaths = this.filterSafeViteFiles(allFilePaths);

    // 2. Concurrently download files in batches
    const batchSize = 8;
    for (let i = 0; i < safePaths.length; i += batchSize) {
      const batch = safePaths.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (relPath) => {
          const fileBuf = await gitHubService.getFileBuffer(repo.owner, repo.repo, relPath, metadata.defaultBranch);
          if (fileBuf) {
            const targetFilePath = path.join(workspacePath, relPath);
            const normalizedTarget = path.resolve(targetFilePath);

            // Ensure target path stays strictly inside workspace
            if (!normalizedTarget.startsWith(path.resolve(workspacePath))) {
              console.warn(`[VitePreviewHandler] Path traversal prevented: ${relPath}`);
              return;
            }

            await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
            await fs.writeFile(targetFilePath, fileBuf);
          }
        })
      );
    }

    // 3. Verify package.json exists in workspace
    const pkgJsonPath = path.join(workspacePath, 'package.json');
    try {
      await fs.access(pkgJsonPath);
    } catch {
      throw new Error('Vite project preparation failed: package.json is missing.');
    }
  }

  /**
   * Executes the build inside an isolated container (node:20-alpine)
   */
  public async build(context: PreviewContext): Promise<BuildResult> {
    const { previewId, workspacePath } = context;

    console.log(`[VitePreviewHandler:BuildStart] Executing containerized build for session ${previewId}`);

    const buildResult = await dockerRuntimeService.runContainerizedBuild({
      previewId,
      workspacePath,
      // --ignore-scripts prevents any malicious lifecycle hooks during npm install
      buildCommand: 'npm install --no-audit --no-fund --ignore-scripts && (npm run build || npx vite build --outDir dist)',
      timeoutMs: 120000,
    });

    if (!buildResult.success) {
      console.error(`[VitePreviewHandler:BuildFailed] Containerized build failed for ${previewId}: ${buildResult.error}`);
      return {
        success: false,
        logs: buildResult.logs,
        error: buildResult.error || 'Vite project compilation failed inside container.',
      };
    }

    // Verify output dist directory and index.html
    const distPath = path.join(workspacePath, 'dist');
    const distIndex = path.join(distPath, 'index.html');

    try {
      await fs.access(distIndex);
    } catch {
      return {
        success: false,
        logs: buildResult.logs,
        error: 'Build finished but dist/index.html was not generated.',
      };
    }

    console.log(`[VitePreviewHandler:BuildSuccess] Containerized build succeeded for ${previewId}`);
    return {
      success: true,
      logs: buildResult.logs,
      distPath,
    };
  }

  /**
   * Returns container configuration for serving the compiled dist/ directory via Nginx
   */
  public getContainerOptions(context: PreviewContext): ContainerStartOptions {
    const distPath = path.join(context.workspacePath, 'dist');
    return {
      previewId: context.previewId,
      workspacePath: distPath,
      port: context.port,
    };
  }
}

export const vitePreviewHandler = new VitePreviewHandler();

